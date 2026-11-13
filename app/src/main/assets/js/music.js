'use strict';
/* Biblioteca de músicas de fundo (procedurais, no mesmo estilo da original: lead "square" + baixo "triangle", 1 passo = 160 ms no nível 1).
   Cada compasso tem 8 passos. Formato de um compasso: 'baixo|lead'.
   - baixo: 2 ou 3 notas, nos passos 0, 4 (e 6); - lead: 4 notas, nos passos 0, 2, 4, 6 (cada nota soa 1 passo e descansa o seguinte); '.' = pausa.
   Forma de cada música: A A' B A (16 compassos ≈ 20 s no nível 1). Uma vez concluída, a próxima música do "baralho" embaralhado entra.
   O andamento sobe um pouco a cada nível (stepMs). Tudo é só áudio: não participa da simulação (replays/online não são afetados). */
const Music = {
  BASE_MS: 160, TEMPO_PER_LEVEL: 0.025, TEMPO_MAX: 1.4,
  SEMI: { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 },
  tracks: [], bag: [], last: -1, cur: null, pos: 0,
  /** 'A4' → 440 Hz; '.' (ou vazio) → 0 (pausa). */
  freq(n) {
    if (!n || n === '.') return 0;
    const m = /^([A-G])([#b]?)(\d)$/.exec(n); if (!m) throw new Error('Nota inválida: ' + n);
    const midi = 12 * (+m[3] + 1) + this.SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return 440 * Math.pow(2, (midi - 69) / 12);
  },
  /** Compasso 'D3 A2|D5 F5 A5 F5' → { mel: [8 passos], bass: [8 passos] }. */
  bar(s) {
    const [b, l] = s.split('|'), bn = b.trim().split(/\s+/), ln = l.trim().split(/\s+/);
    if (ln.length !== 4 || bn.length < 2 || bn.length > 3) throw new Error('Compasso inválido: ' + s);
    const mel = Array(8).fill(0), bass = Array(8).fill(0);
    ln.forEach((n, i) => { mel[i * 2] = this.freq(n); });
    [0, 4, 6].slice(0, bn.length).forEach((st, i) => { bass[st] = this.freq(bn[i]); });
    return { mel, bass };
  },
  /** { name, A:[4 compassos], A2:[4], B:[4] } → trilha de 128 passos (A A' B A). */
  compile(d) {
    const mel = [], bass = [];
    [d.A, d.A2, d.B, d.A].forEach((ph) => ph.forEach((s) => { const x = this.bar(s); mel.push(...x.mel); bass.push(...x.bass); }));
    return { name: d.name, mel, bass, loops: 1 };
  },
  stepMs(level) { const lv = Math.max(1, Math.floor(+level || 1)); return this.BASE_MS / Math.min(this.TEMPO_MAX, 1 + (lv - 1) * this.TEMPO_PER_LEVEL); },
  total(t) { return Math.max(t.mel.length, t.bass.length) * t.loops; },
  /** Próxima música: baralho embaralhado (todas tocam antes de repetir; nunca a mesma duas vezes seguidas). */
  begin(rnd) {
    const r = rnd || Math.random;
    if (!this.bag.length) {
      const a = this.tracks.map((_, i) => i); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      if (a.length > 1 && a[a.length - 1] === this.last) { const k = Math.floor(r() * (a.length - 1)); [a[a.length - 1], a[k]] = [a[k], a[a.length - 1]]; }
      this.bag = a;
    }
    this.last = this.bag.pop(); this.cur = this.tracks[this.last]; this.pos = 0; return this.cur;
  },
  /** Notas do passo atual { m, b } (Hz, 0 = pausa) e avança; ao fim da música entra a próxima. */
  step() {
    if (!this.cur) this.begin();
    const t = this.cur, m = t.mel[this.pos % t.mel.length], b = t.bass[this.pos % t.bass.length];
    if (++this.pos >= this.total(t)) this.begin();
    return { m, b };
  },
};
/* 1) A música original (inalterada: 32 passos de lead, 16 de baixo, repetida 4 vezes). */
Music.tracks.push({
  name: 'Clássica', loops: 4,
  mel: [440, 0, 523, 0, 659, 0, 523, 0, 440, 0, 392, 0, 330, 0, 392, 0, 440, 0, 523, 0, 659, 0, 784, 0, 659, 0, 523, 0, 440, 0, 0, 0],
  bass: [110, 0, 0, 0, 131, 0, 0, 0, 110, 0, 0, 0, 98, 0, 131, 0],
});
/* 2) Novas músicas (originais, arpejos sobre progressões de acordes; cada uma numa tonalidade/clima diferente). */
[
  { name: 'Neve (Ré menor)',
    A: ['D3 A2|D5 F5 A5 F5', 'Bb2 F3|Bb4 D5 F5 D5', 'F3 C3|A4 C5 F5 C5', 'C3 G2|G4 C5 E5 C5'],
    A2: ['D3 A2|D5 F5 A5 F5', 'Bb2 F3|Bb4 D5 F5 D5', 'F3 C3|A4 C5 F5 C5', 'C3 G2 E3|E5 D5 C5 G4'],
    B: ['D3 A2|F5 A5 D6 A5', 'G2 D3|G5 D5 Bb4 D5', 'A2 E3|E5 C#5 A4 C#5', 'A2 E3 G3|E5 G5 A5 .'] },
  { name: 'Marcha (Mi menor)',
    A: ['E3 B2|E5 G5 B5 G5', 'C3 G2|C5 E5 G5 E5', 'G2 D3|B4 D5 G5 D5', 'D3 A2|A4 D5 F#5 D5'],
    A2: ['E3 B2|E5 G5 B5 G5', 'C3 G2|C5 E5 G5 E5', 'G2 D3|B4 D5 G5 D5', 'D3 A2 F#3|F#5 E5 D5 A4'],
    B: ['A2 E3|A4 C5 E5 C5', 'E3 B2|G4 B4 E5 B4', 'C3 G2|E5 G5 C6 G5', 'B2 F#3|D#5 F#5 B5 .'] },
  { name: 'Aurora (Dó maior)',
    A: ['C3 G2|C5 E5 G5 E5', 'G2 D3|B4 D5 G5 D5', 'A2 E3|A4 C5 E5 C5', 'F2 C3|A4 C5 F5 C5'],
    A2: ['C3 G2|C5 E5 G5 E5', 'G2 D3|B4 D5 G5 D5', 'A2 E3|A4 C5 E5 C5', 'F2 C3 G2|F5 E5 D5 B4'],
    B: ['F2 C3|F5 A5 C6 A5', 'C3 G2|E5 G5 C6 G5', 'D3 A2|D5 F5 A5 F5', 'G2 D3|G5 B5 D6 B5'] },
  { name: 'Tensão (Sol menor)',
    A: ['G2 D3|G4 Bb4 D5 Bb4', 'Eb3 Bb2|Eb5 G5 Bb5 G5', 'Bb2 F3|F5 D5 Bb4 D5', 'F3 C3|F5 A5 C6 A5'],
    A2: ['G2 D3|G4 Bb4 D5 Bb4', 'Eb3 Bb2|Eb5 G5 Bb5 G5', 'Bb2 F3|F5 D5 Bb4 D5', 'F3 C3 A2|C6 A5 F5 C5'],
    B: ['C3 G2|C5 Eb5 G5 Eb5', 'G2 D3|Bb4 D5 G5 D5', 'D3 A2|A4 D5 F#5 D5', 'D3 A2 C3|A5 F#5 D5 .'] },
  { name: 'Festa (Fá maior)',
    A: ['F3 C3|F5 A5 C6 A5', 'Bb2 F3|D5 F5 Bb5 F5', 'C3 G2|E5 G5 C6 G5', 'F3 C3|C5 F5 A5 C6'],
    A2: ['F3 C3|F5 A5 C6 A5', 'Bb2 F3|D5 F5 Bb5 F5', 'C3 G2|E5 G5 C6 G5', 'F3 C3 A2|C6 A5 G5 E5'],
    B: ['D3 A2|D5 F5 A5 F5', 'G2 D3|G5 Bb5 D6 Bb5', 'C3 G2|G5 E5 C5 E5', 'C3 G2 B2|E5 G5 C6 .'] },
  { name: 'Noite (Si menor)',
    A: ['B2 F#3|B4 D5 F#5 D5', 'G2 D3|B4 D5 G5 D5', 'D3 A2|A4 D5 F#5 D5', 'A2 E3|E5 C#5 A4 C#5'],
    A2: ['B2 F#3|B4 D5 F#5 D5', 'G2 D3|B4 D5 G5 D5', 'D3 A2|A4 D5 F#5 D5', 'A2 E3 G3|E5 A5 G5 E5'],
    B: ['E3 B2|E5 G5 B5 G5', 'B2 F#3|F#5 D5 B4 D5', 'G2 D3|G5 B5 D6 B5', 'F#2 C#3 A#2|C#5 F#5 A#5 .'] },
  { name: 'Corrida (Lá menor harmônico)',
    A: ['A2 E3|A5 E5 C5 E5', 'D3 A2|D5 F5 A5 F5', 'E3 B2|E5 G#5 B5 G#5', 'A2 E3|A4 C5 E5 A5'],
    A2: ['A2 E3|A5 E5 C5 E5', 'D3 A2|D5 F5 A5 F5', 'E3 B2|E5 G#5 B5 G#5', 'E3 B2 G#3|B5 G#5 E5 B4'],
    B: ['F2 C3|A4 C5 F5 C5', 'D3 A2|F5 D5 A4 D5', 'E3 B2|G#4 B4 E5 B4', 'A2 E3 A2|A5 E5 C5 .'] },
].forEach((d) => Music.tracks.push(Music.compile(d)));
