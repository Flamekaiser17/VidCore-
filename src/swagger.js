import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title:
        "🎬 VidVore API - Distributed Video Streaming & Transcoding Engine",
      version: "2.0.0",
      description: `
## 🚀 VidVore - Production-Grade Video Platform Architecture

VidVore is a high-throughput, distributed backend engineered for asynchronous media ingestion and adaptive bitrate streaming.

### 🏗️ Architectural Highlights:
- **Asynchronous Non-Blocking Transcoding Pipeline**: Video uploads return **HTTP 202 Accepted** instantly. Jobs are dispatched to a **BullMQ** queue backed by **Upstash Redis**.
- **Adaptive Bitrate HLS Streaming**: An isolated background worker leverages **fluent-ffmpeg** to transcode videos into multi-bitrate HLS streams (**360p, 480p, 720p, 1080p**) with dynamic master playlist generation (\`master.m3u8\`).
- **High-Performance Caching Layer**: Video metadata and views are cached in **Redis** with TTL and write-through cache invalidation.
- **Enterprise Security**: Dual-token authentication (Access + Refresh JWTs) with bcrypt hashing, HTTP-only cookies, and MongoDB aggregation pipelines.

---

### 🧪 Live Interview Demo Workflow:
1. **Health Verification**: Execute \`GET /healthcheck\` to view real-time MongoDB cluster and Redis connectivity.
2. **Authentication**: Call \`POST /users/login\` (or register), copy the \`accessToken\`, click the **Authorize (🔒)** button at the top right, and enter \`Bearer <token>\`.
3. **Async Upload & Enqueue**: Call \`POST /videos\` with your video and thumbnail. Notice the instant **202 Accepted** response and enqueued job status!
4. **Inspect Transcoding Status**: Call \`GET /videos/{videoId}\`. Observe the state transition from \`status: "processing"\` to \`status: "ready"\`, revealing the \`hlsUrl\` for streaming.
            `,
      contact: {
        name: "Shivansh Rajput",
      },
    },
    servers: [
      {
        url: "http://localhost:3000/api/v1",
        description: "Local Development Server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your JWT access token here",
        },
      },
      schemas: {
        User: {
          type: "object",
          properties: {
            _id: { type: "string" },
            username: { type: "string" },
            email: { type: "string" },
            fullName: { type: "string" },
            avatar: { type: "string" },
            coverImage: { type: "string" },
          },
        },
        Video: {
          type: "object",
          properties: {
            _id: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            thumbnail: {
              type: "string",
              description: "Cloudinary CDN image URL",
            },
            videoFile: {
              type: "string",
              description: "HLS master playlist or raw video file URL",
            },
            hlsUrl: {
              type: "string",
              description:
                "Relative HLS path (e.g. /hls/<videoId>/master.m3u8)",
              example: "/hls/67bf.../master.m3u8",
            },
            duration: {
              type: "number",
              description: "Duration in seconds (extracted via ffprobe)",
            },
            views: { type: "integer", default: 0 },
            isPublished: { type: "boolean", default: true },
            status: {
              type: "string",
              enum: ["processing", "ready", "failed"],
              description: "Transcoding state",
            },
            transcodeError: { type: "string" },
            owner: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        VideoUploadAccepted: {
          type: "object",
          properties: {
            statusCode: { type: "integer", example: 202 },
            data: {
              type: "object",
              properties: {
                videoId: { type: "string", example: "67bf09a12c8b74..." },
                status: { type: "string", example: "processing" },
                message: {
                  type: "string",
                  example:
                    "Video upload accepted. Transcoding is in progress in the background.",
                },
              },
            },
            message: { type: "string", example: "Video queued for processing" },
            success: { type: "boolean", example: true },
          },
        },
        ApiResponse: {
          type: "object",
          properties: {
            statusCode: { type: "integer" },
            data: { type: "object" },
            message: { type: "string" },
            success: { type: "boolean" },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      {
        name: "🏥 Infrastructure Health",
        description:
          "MongoDB persistent storage & Redis connectivity health status",
      },
      {
        name: "👤 Identity & Auth",
        description:
          "User registration, login, token rotation, and profile management",
      },
      {
        name: "🎬 Video Processing Pipeline",
        description:
          "Non-blocking upload, BullMQ worker queue, and HLS streaming",
      },
      { name: "🐦 Tweets", description: "Short-form community posts" },
      { name: "💬 Comments", description: "Video comment threading" },
      {
        name: "❤️ Likes",
        description: "Like/unlike toggle for videos, comments, and tweets",
      },
      {
        name: "🔔 Subscriptions",
        description: "Channel subscription management",
      },
      { name: "📋 Playlists", description: "Curated playlist management" },
      {
        name: "📊 Creator Dashboard",
        description: "Channel performance and video metrics",
      },
    ],
    paths: {
      "/healthcheck": {
        get: {
          tags: ["🏥 Infrastructure Health"],
          summary: "Inspect server, MongoDB, and Redis connectivity",
          security: [],
          responses: {
            200: {
              description: "All services operational ✅",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      statusCode: { type: "integer", example: 200 },
                      data: {
                        type: "object",
                        properties: {
                          checks: {
                            type: "object",
                            properties: {
                              database: {
                                type: "string",
                                example: "connected",
                              },
                              redis: { type: "string", example: "connected" },
                            },
                          },
                        },
                      },
                      message: { type: "string", example: "OK" },
                      success: { type: "boolean", example: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/users/register": {
        post: {
          tags: ["👤 Users"],
          summary: "Register a new user",
          security: [],
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: [
                    "username",
                    "email",
                    "fullName",
                    "password",
                    "avatar",
                  ],
                  properties: {
                    username: { type: "string", example: "shivansh123" },
                    email: { type: "string", example: "shivansh@test.com" },
                    fullName: { type: "string", example: "Shivansh Rajput" },
                    password: { type: "string", example: "Password@123" },
                    avatar: {
                      type: "string",
                      format: "binary",
                      description: "Profile image (required)",
                    },
                    coverImage: {
                      type: "string",
                      format: "binary",
                      description: "Cover image (optional)",
                    },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: "User registered successfully ✅" },
            400: { description: "Missing fields or avatar" },
            409: { description: "User already exists" },
          },
        },
      },
      "/users/login": {
        post: {
          tags: ["👤 Users"],
          summary: "Login and get JWT tokens",
          security: [],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    username: { type: "string", example: "shivansh123" },
                    email: { type: "string", example: "shivansh@test.com" },
                    password: { type: "string", example: "Password@123" },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: "Login successful, returns accessToken ✅" },
            401: { description: "Invalid password" },
            404: { description: "User not found" },
          },
        },
      },
      "/users/logout": {
        post: {
          tags: ["👤 Users"],
          summary: "Logout current user",
          responses: { 200: { description: "Logged out ✅" } },
        },
      },
      "/users/get-current-user": {
        get: {
          tags: ["👤 Users"],
          summary: "Get logged-in user profile",
          responses: { 200: { description: "User profile ✅" } },
        },
      },
      "/users/update-user-details": {
        post: {
          tags: ["👤 Users"],
          summary: "Update fullName and email",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    fullName: { type: "string" },
                    email: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Details updated ✅" } },
        },
      },
      "/users/change-password": {
        post: {
          tags: ["👤 Users"],
          summary: "Change current password",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    oldPassword: { type: "string" },
                    newPassword: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Password changed ✅" } },
        },
      },
      "/users/c/{username}": {
        get: {
          tags: ["👤 Users"],
          summary: "Get channel profile by username",
          parameters: [
            {
              name: "username",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: { description: "Channel profile with subscriber count ✅" },
          },
        },
      },
      "/users/history": {
        get: {
          tags: ["👤 Users"],
          summary: "Get watch history of logged-in user",
          responses: { 200: { description: "Watch history ✅" } },
        },
      },
      "/videos": {
        get: {
          tags: ["🎬 Video Processing Pipeline"],
          summary: "Get all published videos (paginated)",
          parameters: [
            {
              name: "page",
              in: "query",
              schema: { type: "integer", default: 1 },
            },
            {
              name: "limit",
              in: "query",
              schema: { type: "integer", default: 10 },
            },
            { name: "query", in: "query", schema: { type: "string" } },
            {
              name: "sortBy",
              in: "query",
              schema: { type: "string", default: "createdAt" },
            },
            {
              name: "sortType",
              in: "query",
              schema: {
                type: "string",
                enum: ["asc", "desc"],
                default: "desc",
              },
            },
          ],
          responses: {
            200: { description: "Videos fetched ✅" },
            404: { description: "No videos found" },
          },
        },
        post: {
          tags: ["🎬 Video Processing Pipeline"],
          summary: "Upload video & enqueue async HLS transcoding job (BullMQ)",
          description:
            "Uploads raw video and thumbnail. Immediately returns **202 Accepted** and enqueues a transcoding job to the BullMQ worker queue. The worker converts the video into multi-bitrate HLS (360p, 480p, 720p, 1080p).",
          requestBody: {
            required: true,
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  required: ["title", "description", "videoFile", "thumbnail"],
                  properties: {
                    title: {
                      type: "string",
                      example: "Mastering Distributed Video Pipelines",
                    },
                    description: {
                      type: "string",
                      example:
                        "Deep dive into async transcoding using BullMQ, Redis, and FFmpeg HLS.",
                    },
                    videoFile: {
                      type: "string",
                      format: "binary",
                      description: "Raw video file (mp4, mkv, mov)",
                    },
                    thumbnail: {
                      type: "string",
                      format: "binary",
                      description: "Cover thumbnail (png, jpg)",
                    },
                  },
                },
              },
            },
          },
          responses: {
            202: {
              description:
                "Video accepted & queued for background transcoding 🚀",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/VideoUploadAccepted" },
                },
              },
            },
            400: {
              description:
                "Validation error - title, description, videoFile, and thumbnail are required",
            },
            401: { description: "Unauthorized - Bearer token required" },
          },
        },
      },
      "/videos/{videoId}": {
        get: {
          tags: ["🎬 Video Processing Pipeline"],
          summary: "Get video details, transcoding status & HLS stream URL",
          description:
            "Fetches video details. If cached, serves from Redis in sub-milliseconds. Returns transcoding `status` ('processing', 'ready', 'failed') and `hlsUrl` for adaptive bitrate playback.",
          parameters: [
            {
              name: "videoId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            200: {
              description: "Video details retrieved ✅",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      statusCode: { type: "integer", example: 200 },
                      data: { $ref: "#/components/schemas/Video" },
                      message: {
                        type: "string",
                        example: "video fetched successfully",
                      },
                      success: { type: "boolean", example: true },
                    },
                  },
                },
              },
            },
            400: { description: "Invalid videoId format" },
            404: { description: "Video not found" },
          },
        },
        delete: {
          tags: ["🎬 Video Processing Pipeline"],
          summary: "Delete a video",
          parameters: [
            {
              name: "videoId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Video deleted ✅" } },
        },
        patch: {
          tags: ["🎬 Video Processing Pipeline"],
          summary: "Update video title, description or thumbnail",
          parameters: [
            {
              name: "videoId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            content: {
              "multipart/form-data": {
                schema: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    thumbnail: { type: "string", format: "binary" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Video updated ✅" } },
        },
      },
      "/videos/toggle/publish/{videoId}": {
        patch: {
          tags: ["🎬 Video Processing Pipeline"],
          summary: "Toggle video publish/unpublish status",
          parameters: [
            {
              name: "videoId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Status toggled ✅" } },
        },
      },
      "/tweets": {
        post: {
          tags: ["🐦 Tweets"],
          summary: "Create a new tweet",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["content"],
                  properties: {
                    content: {
                      type: "string",
                      example: "My first VidVore tweet! 🚀",
                    },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Tweet created ✅" } },
        },
      },
      "/tweets/user/{userId}": {
        get: {
          tags: ["🐦 Tweets"],
          summary: "Get all tweets by a user",
          parameters: [
            {
              name: "userId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "User tweets ✅" } },
        },
      },
      "/tweets/{tweetId}": {
        patch: {
          tags: ["🐦 Tweets"],
          summary: "Update a tweet",
          parameters: [
            {
              name: "tweetId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { content: { type: "string" } },
                },
              },
            },
          },
          responses: { 200: { description: "Tweet updated ✅" } },
        },
        delete: {
          tags: ["🐦 Tweets"],
          summary: "Delete a tweet",
          parameters: [
            {
              name: "tweetId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Tweet deleted ✅" } },
        },
      },
      "/comments/{videoId}": {
        get: {
          tags: ["💬 Comments"],
          summary: "Get all comments for a video",
          parameters: [
            {
              name: "videoId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Comments list ✅" } },
        },
        post: {
          tags: ["💬 Comments"],
          summary: "Add a comment to a video",
          parameters: [
            {
              name: "videoId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { content: { type: "string" } },
                },
              },
            },
          },
          responses: { 200: { description: "Comment added ✅" } },
        },
      },
      "/comments/c/{commentId}": {
        patch: {
          tags: ["💬 Comments"],
          summary: "Update a comment",
          parameters: [
            {
              name: "commentId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: { content: { type: "string" } },
                },
              },
            },
          },
          responses: { 200: { description: "Comment updated ✅" } },
        },
        delete: {
          tags: ["💬 Comments"],
          summary: "Delete a comment",
          parameters: [
            {
              name: "commentId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Comment deleted ✅" } },
        },
      },
      "/likes/toggle/v/{videoId}": {
        post: {
          tags: ["❤️ Likes"],
          summary: "Toggle like on a video",
          parameters: [
            {
              name: "videoId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Like toggled ✅" } },
        },
      },
      "/likes/toggle/c/{commentId}": {
        post: {
          tags: ["❤️ Likes"],
          summary: "Toggle like on a comment",
          parameters: [
            {
              name: "commentId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Like toggled ✅" } },
        },
      },
      "/likes/toggle/t/{tweetId}": {
        post: {
          tags: ["❤️ Likes"],
          summary: "Toggle like on a tweet",
          parameters: [
            {
              name: "tweetId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Like toggled ✅" } },
        },
      },
      "/likes/videos": {
        get: {
          tags: ["❤️ Likes"],
          summary: "Get all videos liked by current user",
          responses: { 200: { description: "Liked videos ✅" } },
        },
      },
      "/subscriptions/c/{channelId}": {
        post: {
          tags: ["🔔 Subscriptions"],
          summary: "Subscribe / Unsubscribe from a channel",
          parameters: [
            {
              name: "channelId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Subscription toggled ✅" } },
        },
        get: {
          tags: ["🔔 Subscriptions"],
          summary: "Get channels subscribed to by user",
          parameters: [
            {
              name: "channelId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Subscribed channels ✅" } },
        },
      },
      "/subscriptions/u/{subscriberId}": {
        get: {
          tags: ["🔔 Subscriptions"],
          summary: "Get all subscribers of a channel",
          parameters: [
            {
              name: "subscriberId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Subscribers list ✅" } },
        },
      },
      "/playlist": {
        post: {
          tags: ["📋 Playlists"],
          summary: "Create a new playlist",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string", example: "My Favourites" },
                    description: { type: "string", example: "Best videos" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Playlist created ✅" } },
        },
      },
      "/playlist/{playlistId}": {
        get: {
          tags: ["📋 Playlists"],
          summary: "Get playlist by ID",
          parameters: [
            {
              name: "playlistId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Playlist details ✅" } },
        },
        patch: {
          tags: ["📋 Playlists"],
          summary: "Update playlist name/description",
          parameters: [
            {
              name: "playlistId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    description: { type: "string" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Playlist updated ✅" } },
        },
        delete: {
          tags: ["📋 Playlists"],
          summary: "Delete a playlist",
          parameters: [
            {
              name: "playlistId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Playlist deleted ✅" } },
        },
      },
      "/playlist/add/{videoId}/{playlistId}": {
        patch: {
          tags: ["📋 Playlists"],
          summary: "Add a video to a playlist",
          parameters: [
            {
              name: "videoId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "playlistId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Video added to playlist ✅" } },
        },
      },
      "/playlist/remove/{videoId}/{playlistId}": {
        patch: {
          tags: ["📋 Playlists"],
          summary: "Remove a video from a playlist",
          parameters: [
            {
              name: "videoId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "playlistId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "Video removed from playlist ✅" } },
        },
      },
      "/playlist/user/{userId}": {
        get: {
          tags: ["📋 Playlists"],
          summary: "Get all playlists of a user",
          parameters: [
            {
              name: "userId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: { 200: { description: "User playlists ✅" } },
        },
      },
      "/dashboard/stats": {
        get: {
          tags: ["📊 Dashboard"],
          summary: "Get channel stats (views, subs, likes etc.)",
          requestBody: {
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    channel: { type: "string", example: "shivansh123" },
                  },
                },
              },
            },
          },
          responses: { 200: { description: "Channel stats ✅" } },
        },
      },
      "/dashboard/videos": {
        get: {
          tags: ["📊 Dashboard"],
          summary: "Get all videos uploaded by logged-in user",
          responses: { 200: { description: "Channel videos ✅" } },
        },
      },
    },
  },
  apis: [],
};

const swaggerSpec = swaggerJsdoc(options);

const setupSwagger = (app) => {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: `
                .swagger-ui .topbar { background-color: #1a1a2e; }
                .swagger-ui .topbar-wrapper img { content: url(''); }
                .swagger-ui .topbar-wrapper::after { content: "🎬 VidVore API"; color: white; font-size: 20px; font-weight: bold; }
                .swagger-ui .info h2 { color: #e94560; }
            `,
      customSiteTitle: "VidVore API Docs",
      swaggerOptions: {
        persistAuthorization: true, // token save rehta hai page refresh ke baad bhi
      },
    })
  );
  console.log("📚 Swagger Docs available at: http://localhost:3000/api-docs");
};

export { setupSwagger };
