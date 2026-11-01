'use strict';
/* Loop principal (passo fixo) e entrada: teclado e gestos de toque. */
/* ================= LOOP ================= */
let last=0;
let acc=0;
let frameN=0;
/** Economia de bateria: com a partida pausada ou uma folha aberta nada se move rápido, então desenha menos quadros. */
function idleSkip(){
  if(state==='PAUSED') return (frameN++%4)!==0;
  if(state==='MENU'&&typeof $==='function'&&$('sheet').classList.contains('on')) return (frameN++%2)!==0;
  return false;
}
function loop(t){
  requestAnimationFrame(loop);
  if(idleSkip()) return;
  const dt=Math.min(0.1,(t-last)/1000||0); last=t;
  if(state==='REPLAY'){ Replay.frame(dt); updateFx(dt); render(); return; }
  acc+=dt; let n=0;
  while(acc>=STEP&&n<6){ update(STEP); acc-=STEP; n++; }   // passo fixo => simulação determinística (replays)
  if(n===6) acc=0;
  updateFx(dt); render();
}

/* ================= INPUT: TECLADO ================= */
addEventListener('keydown',e=>{
  if(state!=='PLAY'){ if((e.key==='p'||e.key==='P'||e.key==='Escape')&&state==='PAUSED') resumeGame(); return; }
  const k=e.key;
  if(k==='ArrowLeft') act(A.LEFT);
  else if(k==='ArrowRight') act(A.RIGHT);
  else if(k==='ArrowDown'){ if(!G.soft) act(A.SOFT_ON); }
  else if(k==='ArrowUp'||k==='x'||k==='X') act(A.CW);
  else if(k==='z'||k==='Z') act(A.CCW);
  else if(k===' '){ e.preventDefault(); act(A.HARD); }
  else if(k==='c'||k==='C'||k==='Shift') act(A.HOLD);
  else if(k==='p'||k==='P'||k==='Escape') pauseGame();
  if(['ArrowLeft','ArrowRight','ArrowDown','ArrowUp',' '].includes(k)) e.preventDefault();
});
addEventListener('keyup',e=>{ if(e.key==='ArrowDown'&&G&&G.soft) act(A.SOFT_OFF); });

/* ================= INPUT: GESTOS (tela inteira) ================= */
let tS=null;
function onUi(e){ return !!(e.target&&e.target.closest&&e.target.closest('.overlay,#pauseBtn,button')); }
addEventListener('pointerdown',e=>{
  if(onUi(e)||state!=='PLAY'||!G||tS) return;
  tS={id:e.pointerId,x:e.clientX,sx:e.clientX,sy:e.clientY,t:performance.now(),moved:false};
});
addEventListener('pointermove',e=>{
  if(!tS||e.pointerId!==tS.id||state!=='PLAY'||!G) return;
  const step=CELL*0.9/Controls.cfg.sens, sd=1/Controls.cfg.soft;
  let dx=e.clientX-tS.x, guard=0;
  while(Math.abs(dx)>=step&&guard++<6){
    const s=dx>0?1:-1; act(s>0?A.RIGHT:A.LEFT); tS.x+=s*step; dx=e.clientX-tS.x; tS.moved=true;
  }
  if(e.clientY-tS.sy>CELL*1.2*sd){ if(!G.soft) act(A.SOFT_ON); tS.moved=true; }
  else if(G.soft&&e.clientY-tS.sy<CELL*0.6*sd) act(A.SOFT_OFF);
});
function endTouch(e,cancel){
  if(!tS||e.pointerId!==tS.id) return;
  const dx=e.clientX-tS.sx, dy=e.clientY-tS.sy, dt=performance.now()-tS.t;
  const vy=dy/(dt||1);
  if(!cancel&&state==='PLAY'&&G){
    if(!tS.moved&&dt<350&&Math.abs(dx)<CELL*0.8&&Math.abs(dy)<CELL*0.8){
      act(settings.touch&&e.clientX<W/2?A.CCW:A.CW);
    } else if(vy>0.6/Controls.cfg.swipe&&dy>CELL*1.5/Controls.cfg.swipe) act(A.HARD);
    else if(vy<-0.6/Controls.cfg.swipe&&dy<-CELL*1.5/Controls.cfg.swipe) act(A.HOLD);
  }
  if(G&&G.soft) act(A.SOFT_OFF);
  tS=null;
}
addEventListener('pointerup',e=>endTouch(e,false));
addEventListener('pointercancel',e=>endTouch(e,true));
addEventListener('contextmenu',e=>e.preventDefault());
