'use strict';
/* Constantes (grade, formas, temas), configurações do jogador e persistência de preferências. */
const $=id=>document.getElementById(id);
/* ================= CONFIG ================= */
const DPR_MAX=2;   // limita a resolução interna do Canvas (menos pixels preenchidos por quadro; visual praticamente igual)
const COLS=10, ROWS=20, FPS=60;
const GRAV=[48,43,38,33,28,23,18,13,8,6];
// [fundo topo, fundo base, destaque, glow rgb, moldura rgb, botão rgb, grad1, grad2]
const THEMES=[
 ['#2433b8','#04051f','#6aa3ff','61,120,255','18,40,170','8,16,70','#2f58e6','#1a2f9e'],
 ['#5a1fa8','#12041f','#c39bff','150,80,255','70,20,150','28,10,66','#7a3fe0','#4a1a9e'],
 ['#12805a','#031a14','#62f2b8','30,200,140','10,110,80','4,40,30','#1fa070','#0d6a48'],
 ['#b8601c','#1f0d04','#ffb866','255,140,40','150,70,16','50,22,6','#e8802a','#a04a0c'],
 // 4–11: temas que se desbloqueiam com estrelas (nomes e paletas das peças em themes.js: EXTRA_THEMES)
 ['#a3206b','#1a0412','#ff8ccf','255,100,180','140,24,96','58,8,42','#df3f9a','#9a1a66'],
 ['#0e6fa6','#02131f','#6fe0ff','60,190,240','10,100,150','4,36,56','#1f94cf','#0c5f8c'],
 ['#a31e2a','#1a0407','#ff8a8f','255,80,90','140,20,30','56,8,12','#df3a46','#9a1822'],
 ['#9a7a14','#1a1404','#ffe27a','255,210,70','130,100,10','50,38,4','#d7a928','#9a7410'],
 ['#4a4f5c','#08090c','#c9d1e0','170,180,200','60,66,80','20,22,28','#6b7385','#40465a'],
 ['#2b6a22','#050f04','#b7f36a','120,220,60','30,100,24','8,34,6','#46a038','#276820'],
 ['#c2461f','#1f0a14','#ffb07a','255,120,80','150,50,30','56,12,16','#e86a3a','#a83a22'],
 ['#3d7fb8','#04101c','#d6f1ff','140,200,255','40,100,150','8,32,52','#5fa4de','#35709f']];
const TH=()=>Theme.arr();
function applyTheme(){ Theme.invalidate(); Theme.applyPieces(); const t=TH(), u=Theme.ui(), st=document.documentElement.style, rgb=(h)=>hexRgb(h).join(',');
  st.setProperty('--acc',t[2]); st.setProperty('--glow',t[3]); st.setProperty('--dk',t[4]);
  st.setProperty('--bg1',t[0]); st.setProperty('--bg2',t[1]); st.setProperty('--ov',rgb(mixHex(t[1],'#000000',.2)));   // fundo da página e película das janelas seguem o tema (nada de azul fixo)
  st.setProperty('--btnbg',rgb(u.btnSmall)); st.setProperty('--b1',u.btn1); st.setProperty('--b2',u.btn2);
  st.setProperty('--p1',rgb(u.panel1)); st.setProperty('--p2',rgb(u.panel2));                       // janelas/painéis
  st.setProperty('--ink',u.ink); st.setProperty('--dim',u.dim); st.setProperty('--val',u.val); }  // textos e valores
const COLORS=Object.assign({},DEFAULT_PIECES);
const SHAPES={
 I:{rot:[[[0,1],[1,1],[2,1],[3,1]],[[2,0],[2,1],[2,2],[2,3]],[[0,2],[1,2],[2,2],[3,2]],[[1,0],[1,1],[1,2],[1,3]]]},
 J:{rot:[[[0,0],[0,1],[1,1],[2,1]],[[1,0],[2,0],[1,1],[1,2]],[[0,1],[1,1],[2,1],[2,2]],[[1,0],[1,1],[0,2],[1,2]]]},
 L:{rot:[[[2,0],[0,1],[1,1],[2,1]],[[1,0],[1,1],[1,2],[2,2]],[[0,1],[1,1],[2,1],[0,2]],[[0,0],[1,0],[1,1],[1,2]]]},
 O:{rot:[[[1,0],[2,0],[1,1],[2,1]],[[1,0],[2,0],[1,1],[2,1]],[[1,0],[2,0],[1,1],[2,1]],[[1,0],[2,0],[1,1],[2,1]]]},
 S:{rot:[[[1,0],[2,0],[0,1],[1,1]],[[1,0],[1,1],[2,1],[2,2]],[[1,1],[2,1],[0,2],[1,2]],[[0,0],[0,1],[1,1],[1,2]]]},
 T:{rot:[[[1,0],[0,1],[1,1],[2,1]],[[1,0],[1,1],[2,1],[1,2]],[[0,1],[1,1],[2,1],[1,2]],[[1,0],[0,1],[1,1],[1,2]]]},
 Z:{rot:[[[0,0],[1,0],[1,1],[2,1]],[[2,0],[1,1],[2,1],[1,2]],[[0,1],[1,1],[1,2],[2,2]],[[1,0],[0,1],[1,1],[0,2]]]}};
const KICKS=[[0,0],[-1,0],[1,0],[0,-1],[-1,-1],[1,-1],[0,1],[-2,0],[2,0]];
const SKILLS=['BLUR','EROSION','FISSION','FUSION','INVASION','SHIFT','SPEED_UP','TURN','TWIST'];
const SKILL_RGB={BLUR:'160,200,255',EROSION:'255,140,60',FISSION:'255,80,200',FUSION:'80,255,200',
  INVASION:'255,60,60',SHIFT:'255,230,80',SPEED_UP:'255,120,40',TURN:'120,160,255',TWIST:'200,120,255'};
const POINTS={1:100,2:300,3:500,4:800};

/* ================= PERSISTÊNCIA ================= */
/* Vibração por tipo de ação: 0 desligada, 1 leve, 2 normal, 3 forte (vib() fica em core/audio.js). */
const VIB_KINDS=[['hard','Queda rápida'],['clear','Linhas e T-Spin'],['skill','Habilidades'],['over','Fim de jogo'],['lock','Travar a peça'],['rotate','Girar'],['move','Mover']];
const VIB_DEFAULT={hard:2,clear:2,skill:2,over:2,lock:0,rotate:0,move:0};
const VIB_SCALE=[0,0.5,1,1.8], VIB_NAMES=['Desligada','Leve','Normal','Forte'];
function vibMapParse(d){ const o=Object.assign({},VIB_DEFAULT); if(d&&typeof d==='object'&&!Array.isArray(d)) for(const [k] of VIB_KINDS){ const v=d[k]; if(Number.isInteger(v)&&v>=0&&v<=3) o[k]=v; } return o; }
function vibScaled(ms,level){ const k=VIB_SCALE[level]||0; if(!k) return null; return Array.isArray(ms)?ms.map((v,i)=>i%2===0?Math.max(1,Math.round(v*k)):v):Math.max(1,Math.round(ms*k)); }
const readVol=k=>{ const v=parseFloat(LS(k)); return isFinite(v)?Math.min(1,Math.max(0,v)):1; };
function readSettings(){ return {
  sound: LS('isSound')!=='0', music: LS('isMusic')!=='0',
  ghost: LS('isShowGhost')!=='0', vib: LS('isVabiration')==='1',
  touch: LS('isTouchControl')!=='0', theme: Theme.usable(Theme.parseId(LS('index_bg'))), skin: Skins.valid(LS('skin'))&&Skins.usable(LS('skin'))?LS('skin'):'classic', dyn: LS('dynTheme')==='1', ghostRace: LS('ghostRace')!=='0', updAuto: LS('updAuto')!=='0',
  musicVol: readVol('musicVol'), sfxVol: readVol('sfxVol'), fx: LS('isFx')!=='0', oppView: LS('oppView')!=='0',
  startLevel: Math.min(30,Math.max(1,parseInt(LS('startLevel'),10)||1)),
  vibMap: vibMapParse(Store.getJSON('vibMap',null)), perf: ['0','1','2'].includes(LS('isPerf'))?parseInt(LS('isPerf'),10):2
}; }
const settings=readSettings();
/** Recarrega tudo que depende do perfil ativo (chamado ao trocar/excluir perfil). */
function reloadProfileData(){
  Object.assign(settings,readSettings());
  Controls.load(); applyTheme(); refreshMenu(); resize();
}
Profile.onSwitch=()=>reloadProfileData();
function saveSettings(){
  SV('isSound',settings.sound?1:0); SV('isMusic',settings.music?1:0);
  SV('isShowGhost',settings.ghost?1:0); SV('isVabiration',settings.vib?1:0);
  SV('isTouchControl',settings.touch?1:0); SV('index_bg',settings.theme); SV('skin',settings.skin);
  SV('startLevel',settings.startLevel); SV('musicVol',settings.musicVol); SV('sfxVol',settings.sfxVol); SV('isFx',settings.fx?1:0); SV('oppView',settings.oppView?1:0);
  Store.setJSON('vibMap',settings.vibMap); SV('isPerf',settings.perf); SV('dynTheme',settings.dyn?1:0); SV('ghostRace',settings.ghostRace?1:0); SV('updAuto',settings.updAuto?1:0);
}
