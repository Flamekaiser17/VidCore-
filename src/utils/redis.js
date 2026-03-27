import { Redis } from "@upstash/redis"

// Upstash Redis connection using REST credentials
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

console.log("🚀 Upstash Redis (REST) client initialized");

export { redis }
