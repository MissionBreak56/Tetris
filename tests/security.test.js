'use strict';
// Assinatura: nenhuma chave privada no repositório e workflow exige os secrets em releases por tag.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['.git', 'node_modules', 'build', '.gradle'].includes(e.name)) continue;
    const f = path.join(dir, e.name); if (e.isDirectory()) walk(f, out); else out.push(f);
  }
  return out;
}
test('repositório não contém keystores nem chaves privadas', () => {
  for (const f of walk(ROOT)) {
    assert.equal(/\.(jks|keystore|p12|pfx|pem|key)$/i.test(f), false, 'arquivo de chave: ' + f);
    if (/\.(png|jpg|apk|zip)$/i.test(f)) continue;
    assert.equal(/BEGIN (RSA |EC )?PRIVATE KEY/.test(fs.readFileSync(f, 'utf8')), false, 'chave privada em ' + f);
  }
});
test('.gitignore bloqueia keystores', () => {
  const g = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8'); assert.match(g, /\*\.jks/); assert.match(g, /\*\.keystore/);
});
test('workflow usa secrets, falha em release por tag sem a chave e não tem senha embutida', () => {
  const w = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(w, /secrets\.KEYSTORE_BASE64/); assert.match(w, /secrets\.KEYSTORE_PASSWORD/);
  assert.match(w, /refs\/tags\/\*[\s\S]*exit 1/); assert.match(w, /printcert -jarfile/);
  assert.doesNotMatch(w, /storepass\s+["']?[A-Za-z0-9]{8,}["']?\s/, 'senha fixa no workflow');
});
test('build.gradle lê a assinatura do ambiente (sem caminho/senha fixos)', () => {
  const g = fs.readFileSync(path.join(ROOT, 'app', 'build.gradle'), 'utf8');
  assert.match(g, /System\.getenv\(['"]KEYSTORE_PATH['"]\)/); assert.match(g, /KEYSTORE_PASSWORD/);
});
test('docs/SIGNING.md documenta a impressão digital SHA-256 e o aviso de backup', () => {
  const d = fs.readFileSync(path.join(ROOT, 'docs', 'SIGNING.md'), 'utf8'); assert.match(d, /([0-9A-F]{2}:){31}[0-9A-F]{2}/); assert.match(d, /cópia/);
});
