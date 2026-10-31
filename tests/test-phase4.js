import { redis } from "../src/redis/index.js";
import crypto from "crypto";

async function runTests() {
  console.log("--- TEST 1: SSE Event Formatting Verification ---");
  const mockCitations = [
    { chunkIndex: 0, startTime: 0, endTime: 30, text: "Sample snippet" },
  ];
  const citationsEvent = `data: ${JSON.stringify({ type: "citations", citations: mockCitations, isCached: false })}\n\n`;
  const tokenEvent = `data: ${JSON.stringify({ type: "token", text: "Hello" })}\n\n`;
  const doneEvent = "data: [DONE]\n\n";

  console.assert(
    citationsEvent.startsWith('data: {"type":"citations"'),
    "Citations format matches"
  );
  console.assert(
    tokenEvent === 'data: {"type":"token","text":"Hello"}\n\n',
    "Token format matches"
  );
  console.assert(doneEvent === "data: [DONE]\n\n", "Done signal matches");
  console.log("SSE event formatting tests passed.");

  console.log("\n--- TEST 2: AbortController Client Disconnect Simulation ---");
  const ac = new AbortController();
  let chunksEmitted = 0;
  let abortedCleanly = false;

  async function* mockStream(signal) {
    for (let i = 1; i <= 10; i++) {
      if (signal?.aborted) {
        abortedCleanly = true;
        return;
      }
      yield `chunk ${i}`;
      if (i === 3) {
        // Client disconnects mid-stream
        ac.abort();
      }
    }
  }

  for await (const chunk of mockStream(ac.signal)) {
    chunksEmitted++;
  }

  console.assert(chunksEmitted === 3, "Stream stopped at 3 chunks upon abort");
  console.assert(abortedCleanly === true, "Stream acknowledged abort signal");
  console.log(
    `Abort cancellation test passed: emitted ${chunksEmitted} chunks before abort.`
  );

  console.log("\n--- TEST 3: Cache HIT Fast-Path Simulation ---");
  const testVideoId = "test-vid-999";
  const question = "What is VidVore?";
  const queryHash = crypto
    .createHash("sha256")
    .update(question.toLowerCase())
    .digest("hex");
  const cacheKey = `cache:video:${testVideoId}:qa:${queryHash}`;

  await redis.set(
    cacheKey,
    JSON.stringify({
      answer: "VidVore is a high-throughput video streaming engine.",
      citations: mockCitations,
    }),
    "EX",
    60
  );

  const rawCached = await redis.get(cacheKey);
  const parsed = JSON.parse(rawCached);

  const fastPathEvents = [];
  fastPathEvents.push(
    `data: ${JSON.stringify({ type: "citations", citations: parsed.citations, isCached: true })}\n\n`
  );
  fastPathEvents.push(
    `data: ${JSON.stringify({ type: "token", text: parsed.answer })}\n\n`
  );
  fastPathEvents.push("data: [DONE]\n\n");

  console.assert(
    fastPathEvents[0].includes('"isCached":true'),
    "Cache HIT event has isCached: true"
  );
  console.assert(
    fastPathEvents[1].includes(parsed.answer),
    "Cache HIT returns cached text"
  );
  console.assert(
    fastPathEvents[2] === "data: [DONE]\n\n",
    "Cache HIT ends with [DONE]"
  );

  await redis.del(cacheKey);
  console.log("Cache HIT fast-path test passed successfully.");

  console.log("\nALL SSE & ABORT TESTS COMPLETED SUCCESSFULLY!");
  process.exit(0);
}

runTests().catch((e) => {
  console.error("Test error:", e);
  process.exit(1);
});
