'use strict';
// Biblioteca de músicas de fundo e andamento por nível.
const test = require('node:test');
const assert = require('node:assert/strict');
const { load } = require('./harness');

const M = (h) => h.get('Music');

test('biblioteca: 8 músicas (a original + 7 novas), todas com notas válidas na faixa do estilo (≈ 85–1200 Hz)', () => {
  const m = M(load(1));
  assert.ok(m.tracks.length >= 8);
  assert.equal(m.tracks[0].name, 'Clássica');
  assert.equal(new Set(m.tracks.map((t) => t.name)).size, m.tracks.length, 'nomes únicos');
  for (const t of m.tracks) {
    assert.ok(t.mel.length >= 32 && t.bass.length >= 16, t.name);
    for (const f of [...t.mel, ...t.bass]) assert.ok(f === 0 || (f > 85 && f < 1200), t.name + ' ' + f);
    assert.ok(t.mel.some((f) => f > 0) && t.bass.some((f) => f > 0), t.name);
  }
});
test('a música original continua idêntica (mesma melodia e baixo de antes)', () => {
  const t = M(load(1)).tracks[0];
  assert.deepEqual(Array.from(t.mel), [440, 0, 523, 0, 659, 0, 523, 0, 440, 0, 392, 0, 330, 0, 392, 0, 440, 0, 523, 0, 659, 0, 784, 0, 659, 0, 523, 0, 440, 0, 0, 0]);
  assert.deepEqual(Array.from(t.bass), [110, 0, 0, 0, 131, 0, 0, 0, 110, 0, 0, 0, 98, 0, 131, 0]);
});
test('compilação: notas, bemóis/sustenidos e compassos inválidos', () => {
  const m = M(load(1));
  assert.ok(Math.abs(m.freq('A4') - 440) < 1e-9); assert.ok(Math.abs(m.freq('A5') - 880) < 1e-9);
  assert.ok(Math.abs(m.freq('C#5') - m.freq('Db5')) < 1e-9); assert.equal(m.freq('.'), 0);
  assert.throws(() => m.freq('H4')); assert.throws(() => m.bar('C3 G2|C5 E5 G5'));
  const b = m.bar('D3 A2 F3|D5 . A5 F5');
  assert.equal(b.mel[2], 0); assert.ok(b.mel[0] > 0 && b.mel[4] > 0 && b.mel[6] > 0); assert.ok(b.bass[0] > 0 && b.bass[4] > 0 && b.bass[6] > 0 && b.bass[2] === 0);
});
test('andamento: sobe um pouco a cada nível (160 ms no nível 1), nunca para trás e com teto', () => {
  const m = M(load(1));
  assert.equal(m.stepMs(1), 160);
  let prev = 161; for (let lv = 1; lv <= 30; lv++) { const v = m.stepMs(lv); assert.ok(v <= prev, 'nível ' + lv); prev = v; }
  assert.ok(m.stepMs(5) < 160 && m.stepMs(5) > 140, 'nível 5 só um pouco mais rápido');
  assert.ok(m.stepMs(15) > 160 / 1.4 - 1e-9 && m.stepMs(15) < 125);
  assert.ok(Math.abs(m.stepMs(99) - 160 / 1.4) < 1e-9, 'teto de 1,4×'); assert.equal(m.stepMs(undefined), 160); assert.equal(m.stepMs(0), 160);
});
test('rodízio: todas as músicas tocam antes de repetir e nunca a mesma duas vezes seguidas', () => {
  const m = M(load(1)), n = m.tracks.length, seq = [];
  for (let i = 0; i < n * 6; i++) seq.push(m.tracks.indexOf(m.begin()));
  for (let k = 0; k < 6; k++) assert.equal(new Set(seq.slice(k * n, (k + 1) * n)).size, n, 'rodada ' + k);
  for (let i = 1; i < seq.length; i++) assert.notEqual(seq[i], seq[i - 1], 'posição ' + i);
});
test('step(): avança pelos passos, repete a original 4× e passa à próxima música ao terminar', () => {
  const m = M(load(1)); m.cur = m.tracks[0]; m.pos = 0; m.bag = []; m.last = 0;
  const first = m.step(); assert.equal(first.m, 440); assert.equal(first.b, 110);
  const total = m.total(m.tracks[0]); assert.equal(total, 128);
  for (let i = 1; i < total - 1; i++) m.step();
  assert.equal(m.cur, m.tracks[0], 'ainda na mesma'); m.step();
  assert.notEqual(m.cur, m.tracks[0], 'trocou de música'); assert.equal(m.pos, 0);
});
test('motor: startMusic(true) escolhe música, retomar (sem argumento) mantém a posição; musicTick toca sem erro e agenda o próximo passo', () => {
  const h = load(1); h.run("settings.music = true; settings.musicVol = 0.5; state = 'PLAY'; G = { level: 9 }; startMusic(true);");
  const m = M(h); assert.ok(m.cur); const name = m.cur.name;
  h.run('musicTick(); musicTick(); musicTick();'); assert.equal(m.pos, 3);
  h.run('stopMusic(); startMusic();'); assert.equal(m.cur.name, name); assert.equal(m.pos, 3, 'pausa/retomada não reinicia');
  h.run("state = 'PAUSED'; musicTick();"); assert.equal(m.pos, 3, 'em pausa não avança');
  h.run('settings.music = false; stopMusic(); startMusic(true);'); assert.equal(m.pos, 3, 'música desligada não escolhe/avança');
});
