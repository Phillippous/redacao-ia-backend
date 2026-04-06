// Middleware for rate limiting API requests by user_id to prevent abuse
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 3_600_000,
  max: parseInt(process.env.RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.body?.user_id || req.ip,
  handler: (req, res, _next, options) => {
    const resetMs = req.rateLimit?.resetTime
      ? req.rateLimit.resetTime.getTime() - Date.now()
      : options.windowMs;
    const minutes = Math.ceil(resetMs / 60_000);
    res.status(429).json({
      erro: `Limite de submissões atingido. Tente novamente em ${minutes} minuto${minutes !== 1 ? 's' : ''}.`,
    });
  },
});

module.exports = limiter;
