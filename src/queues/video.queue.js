import { Queue } from "bullmq";
import { redisConnectionOptions } from "../redis/index.js";

/**
 * BullMQ Queue — video transcoding pipeline
 *
 * Queue name must match the Worker name in src/workers/video.worker.js.
 * redisConnectionOptions is a plain ioredis options object (not an instance)
 * so BullMQ can manage its own internal connections.
 */
export const videoTranscodeQueue = new Queue("video-transcoding", {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: "exponential",
      delay: 3000, // 3s → 9s → 27s
    },
    removeOnComplete: true, // Clean up completed jobs automatically
    removeOnFail: false, // Keep failed jobs for inspection (acts as DLQ)
  },
});

videoTranscodeQueue.on("error", (err) => {
  console.error("❌ VideoTranscodeQueue error:", err.message);
});
