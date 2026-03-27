import Redis from "ioredis"

// Redis connection - using environment variable for the full URL
// Example: redis://default:token@host:port
const redis = new Redis(process.env.UPSTASH_REDIS_URL)

redis.on("connect", () => {
    console.log("🚀 Redis connected successfully!")
})

redis.on("error", (err) => {
    console.log("❌ Redis connection failed:", err)
})

export { redis }
