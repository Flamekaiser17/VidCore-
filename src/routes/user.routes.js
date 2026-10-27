import { Router } from "express";
import {
  logoutUser,
  loginUser,
  registerUser,
  refreshingAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  getUserChannelProfile,
  getWatchHistory,
} from "../controllers/user.controllers.js";
import { upload } from "../middlewares/multer.middlewares.js";
import { verifyJWT } from "../middlewares/auth.middlewares.js";

import { authLimiter } from "../middlewares/rateLimiter.js";

const router = Router();

router.route("/register").post(
  authLimiter,
  upload.fields([
    {
      name: "avatar",
      maxCount: 1,
    },
    {
      name: "coverImage",
      maxCount: 1,
    },
  ]),
  registerUser
);

router.route("/login").post(authLimiter, loginUser);
router.route("/refresh-token").post(refreshingAccessToken);

//secure routes

router.use(verifyJWT);

router.route("/logout").post(logoutUser);

router.route("/change-password").patch(changeCurrentPassword);

router.route("/get-current-user").get(getCurrentUser);

router.route("/update-user-details").patch(updateAccountDetails);

router.route("/update-avatar").patch(upload.single("avatar"), updateUserAvatar);

router.route("/c/:username").get(getUserChannelProfile);

router.route("/history").get(getWatchHistory);

export default router;
