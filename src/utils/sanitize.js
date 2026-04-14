// Shared text sanitization helpers used by /submit and /ocr
// Removes null bytes and ASCII control characters (keeps \n, \r, \t)
function sanitizeText(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\uFEFF]/g, '');
}

module.exports = { sanitizeText };
