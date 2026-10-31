import { pipeline } from "@xenova/transformers";

let extractorInstance = null;
let extractorPromise = null;

/**
 * Singleton pipeline initialization for feature extraction
 * using Xenova/all-MiniLM-L6-v2 (384-dimensional embeddings).
 */
const getExtractor = async () => {
  if (extractorInstance) {
    return extractorInstance;
  }

  if (!extractorPromise) {
    extractorPromise = pipeline(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2"
    ).then((pipe) => {
      extractorInstance = pipe;
      return pipe;
    });
  }

  return extractorPromise;
};

/**
 * Generate normalized 384-dimensional embeddings for input text(s).
 * Accepts a single string or an array of strings.
 *
 * @param {string|string[]} texts - Single text string or array of text strings.
 * @returns {Promise<number[]|number[][]>} Normalized 384-d vector or array of vectors.
 */
export const generateEmbeddings = async (texts) => {
  if (!texts || (Array.isArray(texts) && texts.length === 0)) {
    return Array.isArray(texts) ? [] : [];
  }

  const isBatch = Array.isArray(texts);
  const inputList = isBatch ? texts : [texts];

  const extractor = await getExtractor();
  const output = await extractor(inputList, {
    pooling: "mean",
    normalize: true,
  });

  const rawEmbeddings = output.tolist();
  return isBatch ? rawEmbeddings : rawEmbeddings[0];
};

/**
 * High-performance in-memory cosine similarity calculation
 * for 384-dimensional vectors with zero-division safeguard.
 *
 * @param {number[]} vecA
 * @param {number[]} vecB
 * @returns {number} Cosine similarity in range [-1, 1]
 */
export const cosineSimilarity = (vecA, vecB) => {
  if (
    !Array.isArray(vecA) ||
    !Array.isArray(vecB) ||
    vecA.length === 0 ||
    vecB.length === 0 ||
    vecA.length !== vecB.length
  ) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i];
    const b = vecB[i];
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
};
