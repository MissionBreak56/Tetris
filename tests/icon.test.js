'use strict';
// Ícone do app: PNGs em todas as densidades (legado, redondo e primeiro plano adaptativo) + ícone adaptativo (API 26+).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const RES = path.join(__dirname, '..', 'app', 'src', 'main', 'res');
const png = (f) => { const b = fs.readFileSync(f); assert.equal(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', f + ': assinatura PNG'); assert.equal(b.subarray(12, 16).toString(), 'IHDR'); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25], bytes: b.length }; };

test('ícone: PNGs legado/redondo (48 dp) e primeiro plano adaptativo (108 dp) em mdpi…xxxhdpi, com transparência', () => {
  const dens = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [d, k] of Object.entries(dens)) {
    for (const n of ['ic_launcher', 'ic_launcher_round']) { const i = png(path.join(RES, 'mipmap-' + d, n + '.png')); assert.deepEqual([i.w, i.h], [48 * k, 48 * k], d + ' ' + n); assert.equal(i.type, 6, n + ' tem canal alfa (RGBA)'); assert.ok(i.bytes > 1000); }
    const f = png(path.join(RES, 'mipmap-' + d, 'ic_launcher_foreground.png')); assert.deepEqual([f.w, f.h], [108 * k, 108 * k], d + ' primeiro plano'); assert.equal(f.type, 6);
  }
});
test('ícone adaptativo (API 26+) aponta para fundo em cor e primeiro plano PNG; manifesto usa ícone e ícone redondo; recursos antigos removidos', () => {
  for (const n of ['ic_launcher', 'ic_launcher_round']) {
    const x = fs.readFileSync(path.join(RES, 'mipmap-anydpi-v26', n + '.xml'), 'utf8');
    assert.match(x, /<adaptive-icon/); assert.match(x, /<background android:drawable="@color\/ic_launcher_background"\/>/); assert.match(x, /<foreground android:drawable="@mipmap\/ic_launcher_foreground"\/>/);
  }
  assert.match(fs.readFileSync(path.join(RES, 'values', 'ic_launcher_background.xml'), 'utf8'), /<color name="ic_launcher_background">#[0-9a-fA-F]{6}<\/color>/);
  const man = fs.readFileSync(path.join(__dirname, '..', 'app', 'src', 'main', 'AndroidManifest.xml'), 'utf8'); assert.match(man, /android:icon="@mipmap\/ic_launcher"/); assert.match(man, /android:roundIcon="@mipmap\/ic_launcher_round"/);
  for (const old of ['drawable/ic_bg.xml', 'drawable/ic_fg.xml', 'mipmap-anydpi/ic_launcher.xml']) assert.equal(fs.existsSync(path.join(RES, old)), false, old + ' (ícone antigo) removido');
  const all = []; const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : all.push(path.join(d, e.name)))); walk(RES);
  for (const f of all.filter((x) => x.endsWith('.xml'))) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), /@drawable\/ic_(bg|fg)/, f);
});
