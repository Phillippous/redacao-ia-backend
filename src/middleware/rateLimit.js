// Middleware for rate limiting /submit by authenticated user_id
const rateLimit = require('express-rate-limit');

// Applied inside the /submit route, after requireAuth — so req.user.id is available
const submissionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: parseInt(process.env.RATE_LIMIT_MAX) || 4,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res, _next, options) => {
    const resetMs = req.rateLimit?.resetTime
      ? req.rateLimit.resetTime.getTime() - Date.now()
      : options.windowMs;
    const minutes = Math.ceil(resetMs / 60_000);
    res.set('Retry-After', String(Math.ceil(resetMs / 1000)));
    res.status(429).json({
      erro: `Limite de submissões atingido. Tente novamente em ${minutes} minuto${minutes !== 1 ? 's' : ''}.`,
    });
  },
});

module.exports = submissionLimiter;
