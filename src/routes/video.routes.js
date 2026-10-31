import { Router } from "express";
import { verifyJWT } from "../middlewares/auth.middlewares.js";
import {
  deleteVideo,
  getAllVideos,
  getVideoById,
  getVideoTranscript,
  publishAVideo,
  togglePublishStatus,
  updateVideo,
  askVideoQuery,
  askVideoQueryStream,
} from "../controllers/video.controller.js";
import { upload } from "../middlewares/multer.middlewares.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { uploadLimiter } from "../middlewares/rateLimiter.js";
const router = Router();
router.use(verifyJWT); // Apply verifyJWT middleware to all routes in this file

router
  .route("/")
  .get(getAllVideos)
  .post(
    uploadLimiter,
    upload.fields([
      {
        name: "videoFile",
        maxCount: 1,
      },
      {
        name: "thumbnail",
        maxCount: 1,
      },
    ]),
    publishAVideo
  );

router
  .route("/:videoId")
  .get(getVideoById)
  .delete(deleteVideo)
  .patch(upload.single("thumbnail"), updateVideo);

router.route("/toggle/publish/:videoId").patch(togglePublishStatus);
router.route("/:videoId/ask").post(askVideoQuery);
router.route("/:videoId/ask/stream").post(askVideoQueryStream);
router.route("/:videoId/transcript").get(getVideoTranscript);

export default router;
