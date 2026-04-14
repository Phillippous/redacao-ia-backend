// Multer middleware for accepting a single essay image in memory.
// Rejects anything that isn't a small jpeg/png/webp.
const multer = require('multer');

const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

const uploadSingleImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      return cb(new Error('INVALID_MIME'));
    }
    cb(null, true);
  },
}).single('image');

// Wraps the multer handler so every failure mode responds with the same
// user-facing message. The frontend contract is a flat 400 on any issue.
function handleImageUpload(req, res, next) {
  uploadSingleImage(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: 'Há um erro na imagem anexada' });
    }
    next();
  });
}

module.exports = { handleImageUpload, ALLOWED_MIMES, MAX_BYTES };
