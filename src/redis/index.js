import Redis from "ioredis";

/**
 * Parse a rediss:// or redis:// URL into an ioredis-compatible options object.
 * BullMQ Queue and Worker require maxRetriesPerRequest: null on their connections.
 * enableReadyCheck: false is required for Upstash compatibility.
 */
const parseRedisUrl = (url) => {
  const parsed = new URL(url);
  return {
    host: parsed.hostname,
    port: parseInt(parsed.port) || 6379,
    username: parsed.username || undefined,
    password: decodeURIComponent(parsed.password) || undefined,
    tls:
      parsed.protocol === "rediss:" ? { rejectUnauthorized: false } : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
};

/**
 * Shared connection options — used by:
 *   1. The `redis` ioredis instance (direct cache operations: get/set/del)
 *   2. BullMQ Queue and Worker (they create their own internal connections using these options)
 */
export const redisConnectionOptions = parseRedisUrl(
  process.env.UPSTASH_REDIS_URL
);

// General-purpose ioredis client for cache operations (getVideoById, etc.)
export const redis = new Redis(redisConnectionOptions);

redis.on("connect", () => {
  console.log(" Redis connected");
});

redis.on("error", (err) => {
  console.error(" Redis error:", err.message);
});
