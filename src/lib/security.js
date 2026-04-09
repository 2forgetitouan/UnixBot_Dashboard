const crypto = require('crypto');

const HASH_ALGO = 'sha256';

function hashPassword(password) {
  return crypto.createHash(HASH_ALGO).update(String(password)).digest('hex');
}

function safeEqual(a, b) {
  const ab = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

module.exports = {
  hashPassword,
  safeEqual,
};
