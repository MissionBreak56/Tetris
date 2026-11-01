'use strict';
/* Análises avançadas calculadas a partir do histórico (não duplica dados). Registros sem pc/ac (versões antigas) são ignorados nas razões. */
const Analysis = {
  avg(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null; },
  compute(entries) {
    const e = entries.filter((x) => x && isFinite(x.s));
    const ratio = (f) => this.avg(e.filter((x) => num(x.ms) >= 1000).map(f).filter((v) => v != null && isFinite(v)));
    const out = { n: e.length, avgScore: this.avg(e.map((x) => x.s)), avgLines: this.avg(e.map((x) => num(x.li))), avgMs: this.avg(e.map((x) => num(x.ms))),
      pps: ratio((x) => (x.pc == null ? null : x.pc / (x.ms / 1000))), apm: ratio((x) => (x.ac == null ? null : x.ac / (x.ms / 60000))),
      bestScore: e.length ? Math.max(...e.map((x) => x.s)) : null, worstScore: e.length ? Math.min(...e.map((x) => x.s)) : null, series: e.slice(-20).map((x) => x.s) };
    const rec = e.slice(-10).map((x) => x.s), prev = e.slice(-20, -10).map((x) => x.s);
    out.trend = rec.length >= 3 && prev.length >= 3 ? { recent: this.avg(rec), previous: this.avg(prev), delta: this.avg(rec) - this.avg(prev) } : null;
    return out;
  },
};
function openAnalysis(sel) {
  Sheet.push('Análises', (b) => {
    sel = sel || 'all';
    const all = History.load();
    const row = h('div', { class: 'row wrap' });
    [['all', 'Todos']].concat([1, 2, 3, 4, 5, 6].map((m) => [String(m), MODE_NAMES[m]])).forEach(([k, n]) => row.appendChild(btn(n + (sel === k ? ' ●' : ''), () => { Sheet.back(); openAnalysis(k); })));
    b.appendChild(row);
    const a = Analysis.compute(sel === 'all' ? all : all.filter((x) => String(x.m) === sel));
    const f = (v, d) => (v == null ? '—' : v.toFixed(d == null ? 1 : d));
    b.appendChild(kv('Partidas analisadas', a.n));
    b.appendChild(kv('Pontuação média', a.avgScore == null ? '—' : fmtNum(a.avgScore)));
    b.appendChild(kv('Linhas por partida', f(a.avgLines))); b.appendChild(kv('Duração média', a.avgMs == null ? '—' : fmtMs(a.avgMs)));
    b.appendChild(kv('Peças por segundo (PPS)', f(a.pps, 2))); b.appendChild(kv('Ações por minuto (APM)', f(a.apm, 0)));
    b.appendChild(kv('Melhor / pior', a.n ? fmtNum(a.bestScore) + ' / ' + fmtNum(a.worstScore) : '—'));
    b.appendChild(kv('Tendência (10 últimas × 10 anteriores)', a.trend ? (a.trend.delta > 0 ? '↑ +' : a.trend.delta < 0 ? '↓ ' : '= ') + fmtNum(a.trend.delta) : 'poucos dados'));
    if (a.series.length) {
      b.appendChild(sec('ÚLTIMAS PARTIDAS (pontuação)'));
      const mx = Math.max(...a.series, 1);
      b.appendChild(h('div', { class: 'spark' }, a.series.map((v) => h('i', { style: 'height:' + Math.max(4, Math.round(60 * v / mx)) + 'px' }))));
    }
  });
}
Hub.add(25, 'Análises (PPS/APM)', () => openAnalysis());
