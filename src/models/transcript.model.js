import mongoose, { Schema } from "mongoose";

const transcriptSegmentSchema = new Schema(
  {
    start: {
      type: Number,
      required: true,
    },
    end: {
      type: Number,
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const transcriptChunkSchema = new Schema(
  {
    chunkIndex: {
      type: Number,
      required: true,
    },
    startTime: {
      type: Number,
      required: true,
    },
    endTime: {
      type: Number,
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    embedding: {
      type: [Number],
      required: true,
    },
  },
  { _id: false }
);

const transcriptSchema = new Schema(
  {
    video: {
      type: Schema.Types.ObjectId,
      ref: "Video",
      required: true,
      unique: true,
      index: true,
    },
    rawText: {
      type: String,
      required: true,
    },
    segments: {
      type: [transcriptSegmentSchema],
      default: [],
    },
    chunks: {
      type: [transcriptChunkSchema],
      default: [],
    },
    status: {
      type: String,
      enum: ["processing", "ready", "completed", "failed"],
      default: "processing",
    },
    error: {
      type: String,
      default: null,
    },
    errorMessage: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

export const Transcript = mongoose.model("Transcript", transcriptSchema);
