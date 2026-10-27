import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const videoSchema = new Schema(
  {
    videoFile: {
      type: String,
      default: "", // HLS master playlist URL — set after background transcoding completes
    },
    thumbnail: {
      type: String, // cloudinary url
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    duration: {
      type: Number,
      default: 0, // Extracted via ffprobe after transcoding; 0 until then
    },
    views: {
      type: Number,
      default: 0,
    },
    isPublished: {
      type: Boolean,
      default: true,
    },
    owner: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    // --- Async transcoding state fields ---
    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
    },
    hlsUrl: {
      type: String,
      default: "", // Relative URL: /hls/<videoId>/master.m3u8
    },
    transcodeError: {
      type: String,
      default: "", // Populated on failure for debugging
    },
  },
  { timestamps: true }
);

videoSchema.plugin(mongooseAggregatePaginate);

export const Video = mongoose.model("Video", videoSchema);
