import crypto from "crypto";
import { ChatGroq } from "@langchain/groq";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { ChatMessageHistory } from "@langchain/community/stores/message/in_memory";
import { HumanMessage, AIMessage } from "@langchain/core/messages";
import { redis } from "../redis/index.js";
import { withExponentialBackoff } from "../utils/retry.js";
import { generateEmbeddings, cosineSimilarity } from "./embedding.service.js";

const SESSION_TTL_SECONDS = 86400; // 24 hours strict TTL
const MAX_HISTORY_MESSAGES = 10; // Sliding window: 5 user/AI turns

/**
 * Format raw seconds to MM:SS display format.
 * @param {number} seconds
 * @returns {string} Formatted timestamp string "MM:SS"
 */
const formatTimestamp = (seconds) => {
  const totalSeconds = Math.max(0, Math.floor(seconds || 0));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const remainingSeconds = (totalSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${remainingSeconds}`;
};

// ─────────────────────────────────────────────
// Distributed Redis Session Memory Store
// ─────────────────────────────────────────────

/**
 * Persist messages to Redis under chat:history:${sessionId}
 * with a sliding window of max 10 messages and 24h TTL.
 *
 * @param {string} sessionId
 * @param {Array<object>} messages
 */
export const saveSessionMessages = async (sessionId, messages) => {
  const cacheKey = `chat:history:${sessionId}`;
  const windowed = (messages || []).slice(-MAX_HISTORY_MESSAGES);

  const serialized = JSON.stringify(
    windowed.map((m) => ({
      role: typeof m._getType === "function" ? m._getType() : m.role || "human",
      content:
        typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content)
            ? m.content.map((c) => c.text || "").join("")
            : String(m.content || ""),
    }))
  );

  await redis.set(cacheKey, serialized, "EX", SESSION_TTL_SECONDS);
};

/**
 * Custom ChatMessageHistory subclass that synchronizes with Redis on message updates.
 */
class RedisChatMessageHistory extends ChatMessageHistory {
  constructor(sessionId, initialMessages = []) {
    super(initialMessages);
    this.sessionId = sessionId;
  }

  async addMessage(message) {
    await super.addMessage(message);
    const all = await this.getMessages();
    await saveSessionMessages(this.sessionId, all);
  }

  async addMessages(messages) {
    await super.addMessages(messages);
    const all = await this.getMessages();
    await saveSessionMessages(this.sessionId, all);
  }
}

/**
 * Hydrate ChatMessageHistory from Redis for a given sessionId.
 * Enforces sliding window of most recent 10 messages.
 *
 * @param {string} sessionId - Combined identifier (e.g., `${userId}:${videoId}`)
 * @returns {Promise<RedisChatMessageHistory>}
 */
export const getMessageHistory = async (sessionId) => {
  const cacheKey = `chat:history:${sessionId}`;
  const raw = await redis.get(cacheKey);

  let initialMessages = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const recent = parsed.slice(-MAX_HISTORY_MESSAGES);
        initialMessages = recent.map((item) => {
          if (item.role === "human" || item.role === "user") {
            return new HumanMessage(item.content);
          }
          return new AIMessage(item.content);
        });
      }
    } catch (parseErr) {
      console.warn(
        `⚠️ Could not parse chat history for session ${sessionId}:`,
        parseErr.message
      );
    }
  }

  return new RedisChatMessageHistory(sessionId, initialMessages);
};

/**
 * Clear conversational session memory directly from Redis.
 *
 * @param {string} sessionId
 * @returns {Promise<boolean>} True if a session was found and removed
 */
export const clearSessionHistory = async (sessionId) => {
  const cacheKey = `chat:history:${sessionId}`;
  const deleted = await redis.del(cacheKey);
  return deleted > 0;
};

/**
 * Inspect session history to compute a context hash from the last message.
 * Returns null if no prior history exists (Turn 1).
 *
 * @param {string} sessionId
 * @returns {Promise<string|null>} 16-char hash or null
 */
export const getSessionHistoryHash = async (sessionId) => {
  const cacheKey = `chat:history:${sessionId}`;
  const raw = await redis.get(cacheKey);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const lastMsg = parsed[parsed.length - 1];
    const contextString = `${lastMsg.role || "msg"}:${lastMsg.content || ""}`;

    return crypto
      .createHash("sha256")
      .update(contextString)
      .digest("hex")
      .substring(0, 16);
  } catch {
    return null;
  }
};

// ─────────────────────────────────────────────
// Semantic Chunk Retrieval Helper
// ─────────────────────────────────────────────
/**
 * Retrieve Top-K most relevant chunks using cosine similarity
 * between user question and precomputed chunk embeddings.
 *
 * @param {string} question - User question
 * @param {Array<object>} chunks - Transcript chunks with embedding vectors
 * @param {number} [k=4] - Number of top chunks to retrieve
 * @returns {Promise<{topChunks: Array<object>, citations: Array<object>, contextText: string}>}
 */
export const retrieveTopKChunks = async (question, chunks, k = 4) => {
  if (!Array.isArray(chunks) || chunks.length === 0) {
    return {
      topChunks: [],
      citations: [],
      contextText: "No transcript chunks available for this video.",
    };
  }

  // 1. Generate embedding for user question
  const questionEmbedding = await generateEmbeddings(question);

  // 2. Score each chunk using in-memory cosine similarity
  const scoredChunks = chunks
    .filter((c) => Array.isArray(c.embedding) && c.embedding.length > 0)
    .map((chunk) => {
      const score = cosineSimilarity(questionEmbedding, chunk.embedding);
      return {
        ...chunk,
        score,
      };
    })
    .sort((a, b) => b.score - a.score);

  // 3. Take Top-K chunks and order chronologically for logical flow
  const topChunks = scoredChunks.slice(0, k);
  const chronologicalChunks = [...topChunks].sort(
    (a, b) => a.startTime - b.startTime
  );

  // 4. Format context string with timestamp bounds [MM:SS - MM:SS]
  const contextText = chronologicalChunks
    .map(
      (c) =>
        `[${formatTimestamp(c.startTime)} - ${formatTimestamp(c.endTime)}] ${c.text.trim()}`
    )
    .join("\n\n");

  const citations = chronologicalChunks.map((c) => ({
    chunkIndex: c.chunkIndex,
    startTime: c.startTime,
    endTime: c.endTime,
    formattedStartTime: formatTimestamp(c.startTime),
    formattedEndTime: formatTimestamp(c.endTime),
    score: Number((c.score || 0).toFixed(4)),
    text: c.text,
  }));

  return {
    topChunks: chronologicalChunks,
    citations,
    contextText,
  };
};

// ─────────────────────────────────────────────
// Conversational RAG Service
// ─────────────────────────────────────────────
/**
 * Executes a stateful, grounded Q&A query using LangChain, Redis session memory,
 * and resilient exponential backoff retry.
 *
 * @param {object} params
 * @param {string} params.videoId
 * @param {string} params.userId
 * @param {string} params.question
 * @param {Array<object>} params.chunks
 * @returns {Promise<{answer: string, citations: Array<object>}>}
 */
export const askVideoWithMemory = async ({
  videoId,
  userId,
  question,
  chunks,
}) => {
  const { citations, contextText } = await retrieveTopKChunks(
    question,
    chunks,
    4
  );

  const model = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: "llama-3.3-70b-versatile",
    temperature: 0.2,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "You are the VidVore Video Intelligence Assistant. Answer the user question accurately and concisely, strictly grounded in the retrieved video context snippets. Always cite timestamps in [MM:SS] format when referencing statements. If the answer cannot be deduced from the context, state that clearly.\n\nRetrieved Video Context:\n{context}",
    ],
    new MessagesPlaceholder("chat_history"),
    ["human", "<user_question>{question}</user_question>"],
  ]);

  const chain = prompt.pipe(model);

  const chainWithHistory = new RunnableWithMessageHistory({
    runnable: chain,
    getMessageHistory: (sessionId) => getMessageHistory(sessionId),
    inputMessagesKey: "question",
    historyMessagesKey: "chat_history",
  });

  const sessionId = `${userId}:${videoId}`;

  // Execute with resilient exponential backoff
  const response = await withExponentialBackoff(() =>
    chainWithHistory.invoke(
      {
        context: contextText,
        question: question,
      },
      {
        configurable: { sessionId },
      }
    )
  );

  const answer =
    typeof response.content === "string"
      ? response.content
      : Array.isArray(response.content)
        ? response.content.map((c) => c.text || "").join("")
        : String(response.content || "");

  // Refresh and safeguard sliding window persistence in Redis
  const activeHistory = await getMessageHistory(sessionId);
  const allMessages = await activeHistory.getMessages();
  await saveSessionMessages(sessionId, allMessages);

  return {
    answer,
    citations,
  };
};

/**
 * Stream a grounded conversational response token-by-token using LangChain, ChatGroq,
 * Redis session memory, and AbortSignal cancellation support.
 *
 * @param {object} params
 * @param {string} params.videoId
 * @param {string} params.userId
 * @param {string} params.question
 * @param {Array<object>} params.chunks
 * @param {Array<object>} [params.segments] - Optional fallback segments
 * @param {AbortSignal} [params.signal] - Abort signal to cancel generation on client disconnect
 * @returns {Promise<{citations: Array<object>, streamGenerator: AsyncGenerator<string, void, unknown>}>}
 */
export const streamVideoWithMemory = async ({
  videoId,
  userId,
  question,
  chunks,
  segments = [],
  signal,
}) => {
  let citations = [];
  let contextText = "";

  if (Array.isArray(chunks) && chunks.length > 0) {
    const retrieved = await retrieveTopKChunks(question, chunks, 4);
    citations = retrieved.citations;
    contextText = retrieved.contextText;
  } else if (Array.isArray(segments) && segments.length > 0) {
    contextText = segments
      .map((s) => `[${formatTimestamp(s.start)}] ${s.text.trim()}`)
      .join("\n");
  } else {
    contextText = "No video transcript snippets available.";
  }

  const sessionId = `${userId}:${videoId}`;
  const activeHistory = await getMessageHistory(sessionId);
  const historyMessages = await activeHistory.getMessages();

  const model = new ChatGroq({
    apiKey: process.env.GROQ_API_KEY,
    model: "llama-3.3-70b-versatile",
    temperature: 0.2,
    streaming: true,
  });

  const prompt = ChatPromptTemplate.fromMessages([
    [
      "system",
      "You are the VidVore Video Intelligence Assistant. Answer the user question accurately and concisely, strictly grounded in the retrieved video context snippets. Always cite timestamps in [MM:SS] format when referencing statements. If the answer cannot be deduced from the context, state that clearly.\n\nRetrieved Video Context:\n{context}",
    ],
    new MessagesPlaceholder("chat_history"),
    ["human", "<user_question>{question}</user_question>"],
  ]);

  const chain = prompt.pipe(model);

  async function* streamGenerator() {
    let accumulatedAnswer = "";

    const stream = await chain.stream(
      {
        context: contextText,
        chat_history: historyMessages,
        question: question,
      },
      { signal }
    );

    for await (const chunk of stream) {
      if (signal?.aborted) {
        return;
      }

      const text =
        typeof chunk.content === "string"
          ? chunk.content
          : Array.isArray(chunk.content)
            ? chunk.content.map((c) => c.text || "").join("")
            : "";

      if (text) {
        accumulatedAnswer += text;
        yield text;
      }
    }

    // Persist turn to Redis with sliding window and 24h TTL if stream completed cleanly
    if (!signal?.aborted && accumulatedAnswer.trim()) {
      const updatedMessages = [
        ...historyMessages,
        new HumanMessage(question),
        new AIMessage(accumulatedAnswer),
      ];
      await saveSessionMessages(sessionId, updatedMessages);
    }
  }

  return {
    citations,
    streamGenerator: streamGenerator(),
  };
};
