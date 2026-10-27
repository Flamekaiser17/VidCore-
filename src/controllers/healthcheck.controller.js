import mongoose from "mongoose";
import { apiResponse } from "../utils/apiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { redis } from "../redis/index.js";

const healthcheck = asyncHandler(async (req, res) => {
  // MongoDB check
  const dbHealthy = mongoose.connection.readyState === 1;

  // Redis check — ping bhejo, "PONG" aaye toh healthy
  let redisHealthy = false;
  try {
    const redisPing = await redis.ping();
    redisHealthy = redisPing === "PONG";
  } catch (_) {
    redisHealthy = false;
  }

  const allHealthy = dbHealthy && redisHealthy;
  const statusCode = allHealthy ? 200 : 503;

  return res.status(statusCode).json(
    new apiResponse(
      statusCode,
      {
        checks: {
          database: dbHealthy ? "connected" : "disconnected",
          redis: redisHealthy ? "connected" : "disconnected",
        },
      },
      allHealthy ? "OK" : "SERVICE_UNAVAILABLE"
    )
  );
});

export { healthcheck };
