import rateLimit from "express-rate-limit"

const formatErrorMessage = (req, res, options) => {
    res.status(429).json({
        statusCode: 429,
        message: "Too many requests, please try again later.",
        success: false
    });
};

// Global rate limiter - 100 requests per 15 minutes
export const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per `window`
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    handler: formatErrorMessage
});

// Auth rate limiter - 10 requests per 15 minutes
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 requests per `window`
    standardHeaders: true,
    legacyHeaders: false,
    handler: formatErrorMessage
});

// Upload rate limiter - 20 requests per hour
export const uploadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // Limit each IP to 20 requests per `window`
    standardHeaders: true,
    legacyHeaders: false,
    handler: formatErrorMessage
});
