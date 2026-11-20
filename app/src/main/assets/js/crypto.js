'use strict';
/* CryptoManager — primitivas de criptografia do app, sem dependências.
   - SHA-256, HMAC-SHA-256 e PBKDF2-HMAC-SHA-256 SÍNCRONOS em JavaScript puro (usados no PIN dos perfis, onde a interface é síncrona).
   - AES-256-GCM e PBKDF2 assíncrono via WebCrypto (crypto.subtle) para os backups protegidos (.tmb).
   - Base64 e UTF-8 próprios (não dependem de atob/btoa/TextEncoder), comparação em tempo constante e bytes aleatórios seguros. */
const CryptoManager = (() => {
  const K = new Int32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2]);
  const IV = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const W = new Int32Array(64);

  /** Uma rodada de compressão do SHA-256: H (Int32Array[8], alterado no lugar) com 16 palavras de 32 bits. */
  function compress(H, w) {
    for (let i = 0; i < 16; i++) W[i] = w[i];
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], b = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (h + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }

  /** Continua um hash a partir de um estado já processado (prefixLen bytes) e termina com o preenchimento padrão. Devolve 32 bytes. */
  function finish(state, prefixLen, msg) {
    const H = Int32Array.from(state), n = msg.length, total = prefixLen + n;
    const padded = new Uint8Array(((n + 9 + 63) >> 6) << 6);
    padded.set(msg); padded[n] = 0x80;
    const bits = total * 8, view = padded.length;
    padded[view - 4] = (bits >>> 24) & 255; padded[view - 3] = (bits >>> 16) & 255; padded[view - 2] = (bits >>> 8) & 255; padded[view - 1] = bits & 255;
    padded[view - 8] = Math.floor(bits / 4294967296 / 16777216) & 255; padded[view - 7] = (Math.floor(bits / 4294967296) >>> 16) & 255; padded[view - 6] = (Math.floor(bits / 4294967296) >>> 8) & 255; padded[view - 5] = Math.floor(bits / 4294967296) & 255;
    const w = new Int32Array(16);
    for (let off = 0; off < padded.length; off += 64) {
      for (let i = 0; i < 16; i++) w[i] = (padded[off + 4 * i] << 24) | (padded[off + 4 * i + 1] << 16) | (padded[off + 4 * i + 2] << 8) | padded[off + 4 * i + 3];
      compress(H, w);
    }
    return wordsToBytes(H);
  }
  function wordsToBytes(H) {
    const o = new Uint8Array(32);
    for (let i = 0; i < 8; i++) { o[4 * i] = H[i] >>> 24; o[4 * i + 1] = (H[i] >>> 16) & 255; o[4 * i + 2] = (H[i] >>> 8) & 255; o[4 * i + 3] = H[i] & 255; }
    return o;
  }
  function sha256(bytes) { return finish(Int32Array.from(IV), 0, bytes); }

  /** Estados interno/externo do HMAC (chave processada uma vez só: o PBKDF2 reaproveita nas iterações). */
  function hmacStates(key) {
    if (key.length > 64) key = sha256(key);
    const ip = new Uint8Array(64), op = new Uint8Array(64);
    for (let i = 0; i < 64; i++) { const k = i < key.length ? key[i] : 0; ip[i] = k ^ 0x36; op[i] = k ^ 0x5c; }
    const w = new Int32Array(16), inner = Int32Array.from(IV), outer = Int32Array.from(IV);
    for (let i = 0; i < 16; i++) w[i] = (ip[4 * i] << 24) | (ip[4 * i + 1] << 16) | (ip[4 * i + 2] << 8) | ip[4 * i + 3]; compress(inner, w);
    for (let i = 0; i < 16; i++) w[i] = (op[4 * i] << 24) | (op[4 * i + 1] << 16) | (op[4 * i + 2] << 8) | op[4 * i + 3]; compress(outer, w);
    return { inner, outer };
  }
  function hmacSha256(key, msg) { const s = hmacStates(key); return finish(s.outer, 64, finish(s.inner, 64, msg)); }

  /** PBKDF2-HMAC-SHA-256 síncrono (RFC 8018). */
  function pbkdf2Sync(pw, salt, iter, dkLen) {
    const s = hmacStates(pw), out = new Uint8Array(dkLen), blocks = Math.ceil(dkLen / 32);
    const Hin = new Int32Array(8), Hout = new Int32Array(8), w = new Int32Array(16), t = new Int32Array(8);
    for (let b = 1; b <= blocks; b++) {
      const m = new Uint8Array(salt.length + 4); m.set(salt); m[salt.length] = b >>> 24; m[salt.length + 1] = (b >>> 16) & 255; m[salt.length + 2] = (b >>> 8) & 255; m[salt.length + 3] = b & 255;
      let u = finish(s.outer, 64, finish(s.inner, 64, m));
      for (let i = 0; i < 8; i++) t[i] = (u[4 * i] << 24) | (u[4 * i + 1] << 16) | (u[4 * i + 2] << 8) | u[4 * i + 3];
      const acc = Int32Array.from(t);
      for (let it = 1; it < iter; it++) {
        // U_n = HMAC(P, U_{n-1}): mensagem de 32 bytes => 1 bloco (com preenchimento fixo) no hash interno e 1 no externo
        for (let i = 0; i < 8; i++) w[i] = t[i];
        w[8] = 0x80000000; w[9] = 0; w[10] = 0; w[11] = 0; w[12] = 0; w[13] = 0; w[14] = 0; w[15] = (64 + 32) * 8;
        for (let i = 0; i < 8; i++) Hin[i] = s.inner[i]; compress(Hin, w);
        for (let i = 0; i < 8; i++) w[i] = Hin[i];
        for (let i = 0; i < 8; i++) Hout[i] = s.outer[i]; compress(Hout, w);
        for (let i = 0; i < 8; i++) { t[i] = Hout[i]; acc[i] ^= Hout[i]; }
      }
      out.set(wordsToBytes(acc).subarray(0, Math.min(32, dkLen - (b - 1) * 32)), (b - 1) * 32);
    }
    return out;
  }

  // ---------- texto / bytes ----------
  function utf8(str) {
    const out = []; str = String(str);
    for (let i = 0; i < str.length; i++) {
      let c = str.charCodeAt(i);
      if (c >= 0xd800 && c < 0xdc00 && i + 1 < str.length) { const d = str.charCodeAt(i + 1); if (d >= 0xdc00 && d < 0xe000) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; } }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return Uint8Array.from(out);
  }
  /** UTF-8 -> texto. Bytes inválidos viram U+FFFD (nunca lança). */
  function unutf8(u) {
    let s = '', i = 0;
    while (i < u.length) {
      const b = u[i++]; let c;
      if (b < 0x80) c = b;
      else if (b >= 0xc2 && b < 0xe0 && i < u.length && (u[i] & 0xc0) === 0x80) c = ((b & 31) << 6) | (u[i++] & 63);
      else if (b >= 0xe0 && b < 0xf0 && i + 1 < u.length && (u[i] & 0xc0) === 0x80 && (u[i + 1] & 0xc0) === 0x80) { c = ((b & 15) << 12) | ((u[i] & 63) << 6) | (u[i + 1] & 63); i += 2; }
      else if (b >= 0xf0 && b < 0xf5 && i + 2 < u.length && (u[i] & 0xc0) === 0x80 && (u[i + 1] & 0xc0) === 0x80 && (u[i + 2] & 0xc0) === 0x80) { c = ((b & 7) << 18) | ((u[i] & 63) << 12) | ((u[i + 1] & 63) << 6) | (u[i + 2] & 63); i += 3; }
      else c = 0xfffd;
      if (c >= 0x10000) { c -= 0x10000; s += String.fromCharCode(0xd800 + (c >> 10), 0xdc00 + (c & 1023)); } else s += String.fromCharCode(c);
    }
    return s;
  }
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  function b64e(u) {
    let s = '';
    for (let i = 0; i < u.length; i += 3) {
      const n = (u[i] << 16) | ((i + 1 < u.length ? u[i + 1] : 0) << 8) | (i + 2 < u.length ? u[i + 2] : 0);
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < u.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < u.length ? B64[n & 63] : '=');
    }
    return s;
  }
  /** Base64 padrão estrito -> bytes, ou null se inválido. */
  function b64d(str) {
    if (typeof str !== 'string' || str.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(str)) return null;
    const pad = str.endsWith('==') ? 2 : str.endsWith('=') ? 1 : 0, out = new Uint8Array((str.length / 4) * 3 - pad);
    let o = 0;
    for (let i = 0; i < str.length; i += 4) {
      const n = (B64.indexOf(str[i]) << 18) | (B64.indexOf(str[i + 1]) << 12) | ((str[i + 2] === '=' ? 0 : B64.indexOf(str[i + 2])) << 6) | (str[i + 3] === '=' ? 0 : B64.indexOf(str[i + 3]));
      if (o < out.length) out[o++] = (n >> 16) & 255; if (o < out.length) out[o++] = (n >> 8) & 255; if (o < out.length) out[o++] = n & 255;
    }
    return out;
  }
  function hex(u) { let s = ''; for (let i = 0; i < u.length; i++) s += (u[i] < 16 ? '0' : '') + u[i].toString(16); return s; }
  function unhex(s) { if (typeof s !== 'string' || s.length % 2 || !/^[0-9a-f]*$/i.test(s)) return null; const o = new Uint8Array(s.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(s.substr(2 * i, 2), 16); return o; }
  /** Comparação em tempo constante (não termina no primeiro byte diferente). Aceita strings ou Uint8Array. */
  function ctEqual(a, b) {
    if (typeof a === 'string') a = utf8(a); if (typeof b === 'string') b = utf8(b);
    let d = a.length ^ b.length;
    const n = Math.max(a.length, b.length);
    for (let i = 0; i < n; i++) d |= (i < a.length ? a[i] : 0) ^ (i < b.length ? b[i] : 0);
    return d === 0;
  }
  function cryptoObj() { try { return typeof crypto !== 'undefined' ? crypto : (typeof self !== 'undefined' && self.crypto) || null; } catch (e) { return null; } }
  /** Bytes aleatórios seguros (crypto.getRandomValues). Lança se não houver fonte segura: nunca usa Math.random para chaves/nonces. */
  function randomBytes(n) {
    const c = cryptoObj(), u = new Uint8Array(n);
    if (!c || typeof c.getRandomValues !== 'function') throw new Error('Sem gerador aleatório seguro');
    for (let off = 0; off < n; off += 65536) c.getRandomValues(u.subarray(off, Math.min(n, off + 65536)));
    return u;
  }
  function subtle() { const c = cryptoObj(); return c && c.subtle ? c.subtle : null; }

  // ---------- AES-256-GCM / PBKDF2 (WebCrypto, assíncrono) ----------
  const api = {
    sha256, hmacSha256, pbkdf2Sync, utf8, unutf8, b64e, b64d, hex, unhex, ctEqual, randomBytes,
    sha256Hex: (s) => hex(sha256(typeof s === 'string' ? utf8(s) : s)),
    /** WebCrypto disponível (AES-GCM e PBKDF2 nativo)? */
    available() { return !!subtle(); },
    /** Deriva 32 bytes de uma senha (PBKDF2-HMAC-SHA-256, nativo). */
    async deriveKey(password, salt, iter) {
      const s = subtle(); if (!s) throw new Error('WebCrypto indisponível');
      const base = await s.importKey('raw', utf8(password), 'PBKDF2', false, ['deriveBits']);
      return new Uint8Array(await s.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, 256));
    },
    /** Cifra com AES-256-GCM. key: 32 bytes; iv: 12 bytes ÚNICOS por chave; aad: dados autenticados (cabeçalho). Devolve ciphertext||tag(16). */
    async encrypt(key, iv, plain, aad) {
      const s = subtle(); if (!s) throw new Error('WebCrypto indisponível');
      const k = await s.importKey('raw', key, { name: 'AES-GCM' }, false, ['encrypt']);
      return new Uint8Array(await s.encrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, k, plain));
    },
    /** Decifra e autentica. Lança se a chave/dados/cabeçalho não conferem. */
    async decrypt(key, iv, data, aad) {
      const s = subtle(); if (!s) throw new Error('WebCrypto indisponível');
      const k = await s.importKey('raw', key, { name: 'AES-GCM' }, false, ['decrypt']);
      return new Uint8Array(await s.decrypt({ name: 'AES-GCM', iv, additionalData: aad, tagLength: 128 }, k, data));
    },
  };
  return api;
})();
