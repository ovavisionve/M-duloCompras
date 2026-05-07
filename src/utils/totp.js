const crypto = require('crypto');

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Decode(encoded) {
  const str = encoded.replace(/=/g, '').toUpperCase();
  const bytes = [];
  let bits = 0, value = 0;
  for (const char of str) {
    const idx = BASE32_CHARS.indexOf(char);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function base32Encode(buf) {
  let bits = 0, value = 0, output = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_CHARS[(value << (5 - bits)) & 31];
  return output;
}

function hotp(secretBase32, counter) {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  const hi = Math.floor(counter / 0x100000000);
  buf.writeUInt32BE(hi >>> 0, 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[19] & 0xf;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return String(code).padStart(6, '0');
}

function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function verifyTotp(secret, code) {
  if (!secret || !code || !/^\d{6}$/.test(String(code))) return false;
  const t = Math.floor(Date.now() / 1000 / 30);
  // Accept 1 window of drift in either direction
  for (const delta of [-1, 0, 1]) {
    if (hotp(secret, t + delta) === String(code)) return true;
  }
  return false;
}

function getTotpUri(secret, email, issuer = 'Comprar-IA Portal') {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}

module.exports = { generateSecret, verifyTotp, getTotpUri };
