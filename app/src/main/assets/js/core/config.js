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
 ['#b8601c','#1f0d04','#ffb866','255,140,40','150,70,16','50,22,6','#e8802a','#a04a0c']];
const TH=()=>Theme.arr();
function applyTheme(){ Theme.applyPieces(); const t=TH(), st=document.documentElement.style;
  st.setProperty('--acc',t[2]); st.setProperty('--glow',t[3]); st.setProperty('--dk',t[4]);
  st.setProperty('--btnbg',t[5]); st.setProperty('--b1',t[6]); st.setProperty('--b2',t[7]); }
const COLORS=Object.assign({},DEFAULT_PIECES);
const SHAPES={
 I:{rot:[[[0,1],[1,1],[2,1],[3,1]],[[2,0],[2,1],[2,2],[2,3]],[[0,2],[1,2],[2,2],[3,2]],[[1,0],[1,1],[1,2],[1,3]]]},
 J:{rot:[[[0,0],[0,1],[1,1],[2,1]],[[1,0],[2,0],[1,1],[1,2]],[[0,1],[1,1],[2,1],[2,2]],[[1,0],[1,1],[0,2],[1,2]]]},
 L:{rot:[[[2,0],[0,1],[1,1],[2,1]],[[1,0],[1,1],[1,2],[2,2]],[[0,1],[1,1],[2,1],[0,2]],[[0,0],[1,0],[1,1],[1,2]]]},
 O:{rot:[[[1,0],[2,0],[1,1],[2,1]],[[1,0],[2,0],[1,1],[2,1]],[[1,0],[2,0],[1,1],[2,1]],[[1,0],[2,0],[1,1],[2,1]]]},
 S:{rot:[[[1,0],[2,0],[0,1],[1,1]],[[1,0],[1,1],[2,1],[2,2]],[[0,1],[1,1],[1,2],[2,2]],[[0,0],[0,1],[1,1],[1,2]]]},
 T:{rot:[[[1,0],[0,1],[1,1],[2,1]],[[1,0],[1,1],[2,1],[1,2]],[[0,1],[1,1],[2,1],[1,2]],[[1,0],[0,1],[1,1],[1,2]]]},
 Z:{rot:[[[0,0],[1,0],[1,1],[2,1]],[[2,0],[1,1],[2,1],[1,2]],[[0,1],[1,1],[1,2],[2,2]],[[1,0],[0,1],[1,1],[0,2]]]}};
const KICKS=[[0,0],[-1,0],[1,0],[0,-1],[-1,-1],[1,-1],[0,1],[-2,0],[2,0]];
const SKILLS=['BLUR','EROSION','FISSION','FUSION','INVASION','SHIFT','SPEED_UP','TURN','TWIST'];
const SKILL_RGB={BLUR:'160,200,255',EROSION:'255,140,60',FISSION:'255,80,200',FUSION:'80,255,200',
  INVASION:'255,60,60',SHIFT:'255,230,80',SPEED_UP:'255,120,40',TURN:'120,160,255',TWIST:'200,120,255'};
const POINTS={1:100,2:300,3:500,4:800};

/* ================= PERSISTÊNCIA ================= */
const readVol=k=>{ const v=parseFloat(LS(k)); return isFinite(v)?Math.min(1,Math.max(0,v)):1; };
function readSettings(){ return {
  sound: LS('isSound')!=='0', music: LS('isMusic')!=='0',
  ghost: LS('isShowGhost')!=='0', vib: LS('isVabiration')==='1',
  touch: LS('isTouchControl')!=='0', theme: Theme.parseId(LS('index_bg')), skin: Skins.valid(LS('skin'))?LS('skin'):'classic',
  musicVol: readVol('musicVol'), sfxVol: readVol('sfxVol'), fx: LS('isFx')!=='0',
  startLevel: Math.min(15,Math.max(1,parseInt(LS('startLevel'),10)||1))
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
  SV('startLevel',settings.startLevel); SV('musicVol',settings.musicVol); SV('sfxVol',settings.sfxVol); SV('isFx',settings.fx?1:0);
}
