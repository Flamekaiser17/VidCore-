import mongoose, { isValidObjectId } from "mongoose";
import { Video } from "../models/video.model.js";
import { User } from "../models/user.models.js";
import { apiError } from "../utils/apiError.js";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import {
  uploadOnCloudinary,
  deleteFromCloudinary,
} from "../utils/cloudinary.js";
import { redis } from "../redis/index.js"; // unified ioredis client
import { videoTranscodeQueue } from "../queues/video.queue.js"; // BullMQ queue

////////// Get all videos //////////
// 1. Get the page, limit, query, sortBy, sortType, userId from the request query(frontend) [http://localhost:8000/api/v1/video/all-video?page=1&limit=10&query=hello&sortBy=createdAt&sortType=1&userId=123]
// 2. Get all videos based on query, sort, pagination)
// 2.1 match the videos based on title and description
// 2.2 match the videos based on userId=Owner
// 3. lookup the Owner field of video and get the user details
// 4. addFields just add the Owner field to the video document
// 5. set options for pagination
// 6. get the videos based on pipeline and options
const getAllVideos = asyncHandler(async (req, res) => {
  //TODO: get all videos based on query, sort, pagination

  const {
    page = 1,
    limit = 10,
    query = "",
    sortBy = "createdAt",
    sortType = 1,
    userId = "",
  } = req.query;

  let pipeline = [
    {
      $match: {
        $and: [
          // 2.1 match the videos based on title and description
          {
            $or: [
              {
                title: {
                  $regex: query,
                  $options: "i",
                },
              },
              {
                description: {
                  $regex: query,
                  $options: "i",
                },
              },
            ],
          },
          // 2.2 match the videos based on userId=Owner
          ...(userId ? [{ owner: new mongoose.Types.ObjectId(userId) }] : []),
        ],
      },
    },
    { $match: { isPublished: true } },
    {
      // from user it match the _id of user with Owner field of video and saved as Owner
      $lookup: {
        from: "users",
        localField: "owner",
        foreignField: "_id",
        as: "owner",
        pipeline: [
          {
            // project the fields of user in Owner
            $project: {
              _id: 1,
              fullName: 1,
              avatar: "$avatar.url",
              username: 1,
            },
          },
        ],
      },
    },
    {
      $addFields: {
        // 4. addFields just add the Owner field to the video document
        owner: {
          $first: "$owner", // $first: is used to get the first element of Owner array
        },
      },
    },
    {
      $sort: {
        [sortBy]: sortType === "desc" ? -1 : 1, // convert string to number for MongoDB sort
      },
    },
  ];

  try {
    // 5. set options for pagination
    const options = {
      // options for pagination
      page: parseInt(page),
      limit: parseInt(limit),
      customLabels: {
        totalDocs: "totalVideos",
        docs: "videos",
      },
    };
    // 6. get the videos based on pipeline and options
    const result = await Video.aggregatePaginate(
      Video.aggregate(pipeline),
      options
    );

    if (result?.videos?.length === 0) {
      return res.status(404).json(new apiResponse(404, {}, "no video found"));
    }

    return res
      .status(200)
      .json(new apiResponse(200, result, "Video fetched successfully"));
  } catch (error) {
    console.error(error.message);
    return res
      .status(500)
      .json(
        new apiResponse(500, {}, "Internal server error in video aggregation")
      );
  }
});

////////// Publish a video (async HLS pipeline) //////////
// 1. Validate title + description
// 2. Upload thumbnail to Cloudinary (sync — gives the video an immediate cover image)
// 3. Save raw video file path from Multer (NOT uploaded to Cloudinary)
// 4. Create Video document in MongoDB with status: "processing"
// 5. Dispatch BullMQ job → worker handles ffmpeg HLS transcoding in background
// 6. Return 202 Accepted immediately — user doesn't wait for transcoding
const publishAVideo = asyncHandler(async (req, res) => {
  try {
    const { title, description } = req.body;
    if (
      !title ||
      !description ||
      title.trim() === "" ||
      description.trim() === ""
    ) {
      throw new apiError(400, "title and description are required");
    }

    // Multer saves files to public/temp/ — get local paths
    const videoLocalPath = req.files?.videoFile?.[0]?.path;
    const thumbnailLocalPath = req.files?.thumbnail?.[0]?.path;

    if (!videoLocalPath) {
      throw new apiError(400, "Please upload a video file");
    }
    if (!thumbnailLocalPath) {
      throw new apiError(400, "Please upload a thumbnail");
    }

    // Upload ONLY the thumbnail to Cloudinary synchronously
    // (gives the video an immediate cover while transcoding happens in background)
    const thumbnailOnCloudinary = await uploadOnCloudinary(
      thumbnailLocalPath,
      "myTube/thumbnail"
    );
    if (!thumbnailOnCloudinary) {
      throw new apiError(400, "Thumbnail upload to Cloudinary failed");
    }

    // Create Video document — videoFile and duration will be set by the worker
    const video = await Video.create({
      title,
      description,
      thumbnail: thumbnailOnCloudinary.url,
      owner: req.user?._id,
      isPublished: true,
      status: "processing", // Worker will update to "ready" or "failed"
    });

    if (!video) {
      throw new apiError(500, "Failed to create video record in database");
    }

    // Dispatch transcoding job to BullMQ — worker picks this up asynchronously
    await videoTranscodeQueue.add("transcode-hls", {
      videoId: video._id.toString(),
      videoLocalPath, // Multer temp path: public/temp/<filename>
    });

    console.log(`📤 Transcoding job queued for video ${video._id}`);

    // Return 202 Accepted — processing is happening in the background
    return res.status(202).json(
      new apiResponse(
        202,
        {
          videoId: video._id,
          status: "processing",
          message:
            "Video upload accepted. Transcoding is in progress in the background.",
        },
        "Video queued for processing"
      )
    );
  } catch (error) {
    console.error("UPLOAD ERROR:", error);
    return res
      .status(500)
      .json(
        new apiResponse(
          500,
          { error: error.message },
          "Problem in uploading video"
        )
      );
  }
});

////////// Get a video by id //////////
// 1. Get the video id from the request params(frontend)  [http://localhost:8000/api/v1/video/get-video/:videoId]
// 2. Check if the videoId id is valid
// 3. Find the video in the database
const getVideoById = asyncHandler(async (req, res) => {
  try {
    const { videoId } = req.params;

    if (!isValidObjectId(videoId)) {
      throw new apiError(400, "Enter a valid videoId");
    }

    const cacheKey = `video:${videoId}`;

    // Step 1: Check Redis cache
    const cachedVideo = await redis.get(cacheKey);

    if (cachedVideo) {
      console.log("⚡ Serving from Cache");
      const data =
        typeof cachedVideo === "string" ? JSON.parse(cachedVideo) : cachedVideo;
      return res
        .status(200)
        .json(
          new apiResponse(200, data, "video fetched successfully (from cache)")
        );
    }

    // Step 2: If cache miss, fetch from MongoDB
    console.log("🐢 Cache Miss - Fetching from DB");
    const video = await Video.findById(videoId);

    if (!video) {
      throw new apiError(404, "failed to fetch video details");
    }

    // Step 3: Store in Redis for 5 minutes (300 seconds)
    await redis.set(cacheKey, JSON.stringify(video), { ex: 300 });

    return res
      .status(200)
      .json(new apiResponse(200, video, "video fetched successfully"));
  } catch (error) {
    res.status(501).json(new apiResponse(501, {}, "video not found"));
  }
});

const updateVideo = asyncHandler(async (req, res) => {
  try {
    const { videoId } = req.params;
    //TODO: update video details like title, description, thumbnail
    if (!isValidObjectId(videoId)) {
      throw new apiError(400, "Invaalid videoId");
    }

    const { title, description } = req.body;
    if ([title, description].some((field) => field.trim() === "")) {
      throw new apiError(400, "please provider all given details");
    }

    const video = await Video.findById(videoId);
    if (!video) {
      throw apiError(400, "videoId not found");
    }

    // 3.3 Check if the video is owned by the user [video.Owner.equals(req.user._id)] only owner can update the video
    if (!video.owner.equals(req.user?._id)) {
      throw new apiError(400, "user not allowed to update");
    }

    const thumbnailLocalPath = req.file?.path;
    if (!thumbnailLocalPath) {
      throw new apiError(400, "thumbnail not found");
    }

    const thumbnailOnCloudinary = await uploadOnCloudinary(
      thumbnailLocalPath,
      "myTube/thumbnail"
    );
    if (!thumbnailOnCloudinary) {
      throw new apiError(400, "error while uploading on cloudinary");
    }

    //delete
    const thumbnailOldUrl = video?.thumbnail;
    const deleteThumbnail = await deleteFromCloudinary(
      thumbnailOldUrl,
      "image"
    );
    if (!deleteThumbnail) {
      throw new apiError(400, "thumbnail not deleted");
    }

    (video.title = title),
      (video.description = description),
      (video.thumbnail = thumbnailOnCloudinary.url);
    await video.save();

    // Invalidate cache
    await redis.del(`video:${videoId}`);

    return res
      .status(200)
      .json(new apiResponse(200, video, "video details updated successfuly"));
  } catch (error) {
    console.log(error.stack);
    return res
      .status(500)
      .json(new apiResponse(500, {}, "video details not updated"));
  }
});

////////// Delete a video //////////
// 1. Get the videoId from the request params(frontend)  [http://localhost:8000/api/v1/video/delete-video/:videoId]
// 2. find the video in the database by videoId and delete it
// 2.2. Check if the video is owned by the user [video.Owner.equals(req.user._id)] only owner can delete the video
// 3. delete the videoFile and thumbnail from cloudinary
// 4. Delete the video document from the database

const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;
  //TODO: delete video
  if (!isValidObjectId(videoId)) {
    throw new apiError(400, "invalid videoId");
  }

  const video = await Video.findById(videoId);
  if (!video) {
    throw new apiError(400, "videoId not found");
  }

  if (!video.owner.equals(req.user?._id)) {
    throw new apiError(400, "user not allowed to delete");
  }

  const videoFile = await deleteFromCloudinary(video.videoFile, "video");
  const thumbnailFile = await deleteFromCloudinary(video.thumbnail, "image");

  if (!videoFile && !thumbnailFile) {
    throw new apiError(
      400,
      "thumbnail or videoFile is not deleted from cloudinary"
    );
  }

  // 4. Delete the video document from the database
  await video.deleteOne(); // .remove dont work with findOne it only works with findById

  // Invalidate cache
  await redis.del(`video:${videoId}`);

  return res
    .status(200)
    .json(new apiResponse(200, {}, "video deleted successfully"));
});

const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new apiError(400, "invalid videoId");
  }

  const video = await Video.findById(videoId);
  if (!video) {
    throw new apiError(404, "Video not found");
  }

  if (!video.owner.equals(req.user?._id)) {
    throw new apiError(
      403,
      "You are not allowed to toggle publish status of this video"
    );
  }

  video.isPublished = !video.isPublished;
  await video.save();

  // Invalidate Redis cache so getVideoById reflects the new state
  await redis.del(`video:${videoId}`);

  return res
    .status(200)
    .json(
      new apiResponse(
        200,
        { isPublished: video.isPublished },
        "Publish status toggled successfully"
      )
    );
});

export {
  getAllVideos,
  publishAVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
};
