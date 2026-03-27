import Redis from "ioredis";
import dotenv from "dotenv";

dotenv.config({ path: './.env' });

const redis = new Redis(process.env.UPSTASH_REDIS_URL);

redis.on("connect", () => {
    console.log("🚀 Redis connected successfully!");
    redis.set("test", "working", "EX", 10);
    redis.get("test", (err, result) => {
        if (err) {
            console.error("❌ Redis Error:", err);
            process.exit(1);
        } else {
            console.log("✅ Redis Test Result:", result);
            process.exit(0);
        }
    });
});

redis.on("error", (err) => {
    console.log("❌ Redis connection failed:", err);
    process.exit(1);
});
