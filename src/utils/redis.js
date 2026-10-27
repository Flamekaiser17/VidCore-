/**
 * ⚠️  DEPRECATED — This file previously used @upstash/redis (REST client)
 * which required UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN env vars
 * that were never present in .env — making it silently broken.
 *
 * Now re-exports the unified ioredis client from src/redis/index.js so that
 * any legacy import (named or default) from this path keeps working without
 * changes to other files.
 */
export { redis as default, redis } from "../redis/index.js";
