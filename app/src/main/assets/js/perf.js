'use strict';
/* Modo economia / desempenho. Preferência: 0 = Normal, 1 = Economia, 2 = Automático (economia só com bateria ≤ 20% sem carregar, ou economia de bateria do Android).
   Economia: 30 quadros por segundo (a simulação segue a 60 ticks/s), sem partículas/tremor/clarão, fundo estático e peças neon sem brilho (sombra é o efeito mais caro no Canvas). */
const Perf = {
  low: false, lastCheck: -1e9, n: 0, CHECK_MS: 30000, LOW_LEVEL: 20,
  /** Economia ativa agora? */
  save() { return settings.perf === 1 || (settings.perf === 2 && this.low); },
  /** Reavalia a bateria (no máximo a cada 30 s e só no modo Automático). */
  check(nowMs) {
    if (settings.perf !== 2) { this.low = false; return; }
    if (nowMs - this.lastCheck < this.CHECK_MS) return; this.lastCheck = nowMs;
    const b = Native.battery(); this.low = !!b && (b.saver || (b.level <= this.LOW_LEVEL && !b.charging));
  },
  /** Em economia, pula um quadro de desenho a cada dois (o laço principal ainda roda os ticks atrasados). */
  skipFrame() { if (!this.save()) return false; return (this.n++ & 1) === 1; },
  label(v) { return ['Normal', 'Economia', 'Automático'][v] || 'Normal'; },
};
