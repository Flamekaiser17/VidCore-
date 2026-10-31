/**
 * BullMQ Video Transcoding Worker
 *
 * Run this as a separate process:
 *   npm run worker
 *
 * This worker:
 *   1. Picks transcoding jobs from the "video-transcoding" BullMQ queue
 *   2. Uses fluent-ffmpeg (loaded via createRequire for ESM safety) to transcode
 *      the raw uploaded video into HLS segments (master.m3u8 + .ts chunks)
 *   3. Updates the MongoDB Video document with the result (status, hlsUrl, duration)
 *   4. Cleans up the temp raw file saved by Multer in public/temp/
 */
import "dotenv/config";
import { Worker } from "bullmq";
import { createRequire } from "module";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import connectDB from "../db/index.js";
import { Video } from "../models/video.model.js";
import { Transcript } from "../models/transcript.model.js";
import { redisConnectionOptions } from "../redis/index.js";
import { transcribeAudioFile } from "../services/ai.service.js";
import { generateEmbeddings } from "../services/embedding.service.js";

// Load .env (worker runs as a standalone process separate from the API server)
dotenv.config({ path: "./.env" });

// ESM-safe import of fluent-ffmpeg (CommonJS package)
const require = createRequire(import.meta.url);
const ffmpeg = require("fluent-ffmpeg");

// Wire up the ffmpeg binary from @ffmpeg-installer/ffmpeg (no system PATH needed)
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Resolve __dirname equivalent in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// project root → public/hls/
const HLS_BASE_DIR = path.resolve(__dirname, "../../public/hls");

// ─────────────────────────────────────────────
// Connect to MongoDB before the worker starts
// ─────────────────────────────────────────────
await connectDB();

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

/**
 * Extract video duration in seconds using ffprobe.
 * Returns 0 if metadata is unavailable (non-fatal).
 */
const getVideoDuration = (inputPath) =>
  new Promise((resolve) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        console.warn("⚠️  ffprobe could not read duration:", err.message);
        return resolve(0);
      }
      resolve(metadata?.format?.duration || 0);
    });
  });

/**
 * Transcode a video file into HLS format using ffmpeg.
 * Outputs master.m3u8 + .ts segment files to outputPath directory.
 */
const transcodeToHLS = (inputPath, outputPath) =>
  new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions([
        "-profile:v baseline", // Maximum compatibility (H.264 Baseline)
        "-level 3.0",
        "-start_number 0",
        "-hls_time 10", // Each segment = 10 seconds
        "-hls_list_size 0", // Keep all segments in the playlist
        "-f hls",
      ])
      .output(outputPath)
      .on("start", (cmd) => console.log("🎬 ffmpeg started:", cmd))
      .on("progress", (p) => {
        if (p.percent) {
          process.stdout.write(
            `\r   ⏳ Transcoding: ${Math.round(p.percent)}%`
          );
        }
      })
      .on("end", () => {
        process.stdout.write("\n");
        resolve();
      })
      .on("error", (err) => {
        process.stdout.write("\n");
        reject(err);
      })
      .run();
  });

const extractAudio = (inputPath, outputPath) =>
  new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate(48)
      .on("end", () => resolve(outputPath))
      .on("error", (err) => reject(err))
      .save(outputPath);
  });

/**
 * Group Whisper segments into 35-45 second temporal windows (or end of transcript)
 * to keep coherent context while preserving exact startTime and endTime.
 *
 * @param {Array<{start: number, end: number, text: string}>} segments
 * @param {number} [targetWindowSeconds=40]
 * @returns {Array<{chunkIndex: number, startTime: number, endTime: number, text: string}>}
 */
export const buildTranscriptChunks = (segments, targetWindowSeconds = 40) => {
  if (!Array.isArray(segments) || segments.length === 0) {
    return [];
  }

  const chunks = [];
  let currentGroup = [];
  let chunkStartTime = null;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    if (chunkStartTime === null) {
      chunkStartTime = seg.start;
    }

    currentGroup.push(seg);
    const currentDuration = seg.end - chunkStartTime;
    const isLastSegment = i === segments.length - 1;

    // Trigger chunk creation when window duration is in the 35-45s window (>= 35s) or at the end
    if (currentDuration >= 35 || isLastSegment) {
      const text = currentGroup
        .map((s) => s.text.trim())
        .filter(Boolean)
        .join(" ");

      if (text) {
        chunks.push({
          chunkIndex: chunks.length,
          startTime: chunkStartTime,
          endTime: seg.end,
          text,
        });
      }

      currentGroup = [];
      chunkStartTime = null;
    }
  }

  return chunks;
};

// ─────────────────────────────────────────────
// BullMQ Worker
// ─────────────────────────────────────────────
const worker = new Worker(
  "video-transcoding",
  async (job) => {
    const { videoId, videoLocalPath } = job.data;

    console.log(`\n📥 Processing job ${job.id} — videoId: ${videoId}`);

    // Output: public/hls/<videoId>/master.m3u8
    const outputDir = path.join(HLS_BASE_DIR, videoId.toString());
    const outputPath = path.join(outputDir, "master.m3u8");
    const hlsUrl = `/hls/${videoId}/master.m3u8`;

    try {
      // 1. Ensure output directory exists
      await fs.mkdir(outputDir, { recursive: true });

      // 2. Extract duration before transcoding (ffprobe reads raw file)
      const duration = await getVideoDuration(videoLocalPath);

      // 3. Transcode raw video → HLS
      await transcodeToHLS(videoLocalPath, outputPath);
      console.log(`✅ Transcode complete for video ${videoId}`);

      // 4. Update MongoDB: mark as ready
      await Video.findByIdAndUpdate(videoId, {
        status: "ready",
        hlsUrl,
        videoFile: hlsUrl,
        duration,
      });
      console.log(`💾 MongoDB updated → status: ready`);

      // Transcription is independent of streaming readiness.
      const tempAudioPath = path.join("public", "temp", `audio-${videoId}.mp3`);
      try {
        await extractAudio(videoLocalPath, tempAudioPath);

        await Transcript.findOneAndUpdate(
          { video: videoId },
          {
            status: "processing",
            rawText: "Pending transcription...",
            segments: [],
            chunks: [],
            error: null,
            errorMessage: null,
          },
          { upsert: true, new: true }
        );

        const { rawText, segments } = await transcribeAudioFile(tempAudioPath);

        const chunks = buildTranscriptChunks(segments);
        let enrichedChunks = [];

        if (chunks.length > 0) {
          const chunkTexts = chunks.map((c) => c.text);
          const embeddings = await generateEmbeddings(chunkTexts);
          enrichedChunks = chunks.map((chunk, idx) => ({
            ...chunk,
            embedding: embeddings[idx] || [],
          }));
        }

        await Transcript.findOneAndUpdate(
          { video: videoId },
          {
            status: "completed",
            rawText,
            segments,
            chunks: enrichedChunks,
            error: null,
            errorMessage: null,
          },
          { upsert: true, new: true }
        );
        console.log(
          `🧠 AI transcription & semantic chunking complete for video ${videoId} (${enrichedChunks.length} chunks generated)`
        );
      } catch (aiErr) {
        console.error(
          `AI transcription failed for video ${videoId}:`,
          aiErr.message
        );
        try {
          await Transcript.findOneAndUpdate(
            { video: videoId },
            {
              $set: {
                status: "failed",
                error: aiErr.message,
                errorMessage: aiErr.message,
              },
              $setOnInsert: {
                rawText: "Transcription unavailable",
                segments: [],
                chunks: [],
              },
            },
            { upsert: true }
          );
        } catch (transcriptErr) {
          console.error(
            `Failed to record transcription error for video ${videoId}:`,
            transcriptErr.message
          );
        }
      } finally {
        try {
          await fs.unlink(tempAudioPath);
        } catch (audioUnlinkErr) {
          if (audioUnlinkErr.code !== "ENOENT") {
            console.warn(
              `Could not delete temporary audio file ${tempAudioPath}:`,
              audioUnlinkErr.message
            );
          }
        }
      }

      // Delete the original temp raw file (saved by Multer in public/temp/)
      try {
        await fs.unlink(videoLocalPath);
        console.log(`🗑️  Temp file deleted: ${videoLocalPath}`);
      } catch (unlinkErr) {
        // Non-fatal — temp file may have already been cleaned up
        console.warn(`⚠️  Could not delete temp file: ${unlinkErr.message}`);
      }

      return { success: true, hlsUrl, duration };
    } catch (err) {
      console.error(`❌ Transcode failed for video ${videoId}:`, err.message);

      // Update MongoDB: mark as failed with error details
      await Video.findByIdAndUpdate(videoId, {
        status: "failed",
        transcodeError: err.message,
      }).catch((dbErr) =>
        console.error("Failed to update DB on error:", dbErr.message)
      );

      // Re-throw so BullMQ triggers its retry logic
      throw err;
    }
  },
  {
    connection: redisConnectionOptions,
    concurrency: 1, // Process one video at a time (laptop-friendly, avoids OOM)
  }
);

// ─────────────────────────────────────────────
// Worker event listeners
// ─────────────────────────────────────────────
worker.on("completed", (job, result) => {
  console.log(`\n🎉 Job ${job.id} completed successfully — ${result?.hlsUrl}`);
});

worker.on("failed", (job, err) => {
  console.error(
    `\n💀 Job ${job?.id} failed after ${job?.attemptsMade} attempt(s): ${err.message}`
  );
});

worker.on("error", (err) => {
  console.error("Worker-level error:", err.message);
});

console.log("🚀 Video transcoding worker is running (concurrency: 1)");
