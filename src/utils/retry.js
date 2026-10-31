/**
 * Resilient Retry Utility with Exponential Backoff and Full Jitter
 */

/**
 * Check if an error is considered transient (e.g. rate limits, 5xx server errors, network drops).
 * @param {Error|any} err
 * @returns {boolean}
 */
export const isTransientError = (err) => {
  if (!err) return false;

  // Check HTTP status code
  const status =
    err.status ||
    err.statusCode ||
    err.response?.status ||
    err.response?.statusCode;

  if (status && [429, 500, 502, 503, 504].includes(Number(status))) {
    return true;
  }

  // Check network/system error codes
  const code = err.code || err.cause?.code;
  if (
    [
      "ETIMEDOUT",
      "ECONNRESET",
      "ECONNREFUSED",
      "EPIPE",
      "ENOTFOUND",
      "EAI_AGAIN",
    ].includes(code)
  ) {
    return true;
  }

  // Inspect message text for rate-limit / timeout signatures
  const message = String(err.message || "").toLowerCase();
  if (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("too many requests") ||
    message.includes("timeout") ||
    message.includes("503") ||
    message.includes("502") ||
    message.includes("504") ||
    message.includes("service unavailable")
  ) {
    return true;
  }

  return false;
};

/**
 * Executes a function with exponential backoff and randomized full jitter.
 * Delay formula: Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt)) * (0.5 + Math.random() * 0.5)
 *
 * @param {Function} fn - Async task to execute
 * @param {object} [options]
 * @param {number} [options.maxRetries=3]
 * @param {number} [options.baseDelayMs=1000]
 * @param {number} [options.maxDelayMs=8000]
 * @returns {Promise<any>}
 */
export const withExponentialBackoff = async (
  fn,
  { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 8000 } = {}
) => {
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= maxRetries || !isTransientError(err)) {
        throw err;
      }

      // Calculate exponential backoff with full jitter
      const exponentialDelay = Math.min(
        maxDelayMs,
        baseDelayMs * Math.pow(2, attempt)
      );
      const jitterMultiplier = 0.5 + Math.random() * 0.5;
      const delay = Math.round(exponentialDelay * jitterMultiplier);

      console.warn(
        `⚠️ Transient error on attempt ${attempt + 1}/${maxRetries} (${err.message}). Retrying in ${delay}ms...`
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
    }
  }
};
