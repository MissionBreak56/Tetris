'use strict';
/* Fluxo da partida (início, pausa, fim) e atualização por passo fixo (update). */
/* ================= FLUXO ================= */
function show(id){ $(id).classList.add('on'); }
function hide(id){ $(id).classList.remove('on'); }
function hideAll(){ ['menu','sheet','confirmBox','pausePanel','endPanel'].forEach(hide); }
function restartAnim(el,cls){ el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }

function startGame(mode,opts){
  try{ac();}catch(e){} hideAll(); showTutBanner(false); newGame(mode,opts);
  $('pauseBtn').style.display='flex';
  let n=3; state='COUNT';
  const cd=$('count'); cd.style.display='flex';
  const step=()=>{
    if(n>0){ cd.textContent=n; restartAnim(cd,'cpop'); sfx.tick(); n--; setTimeout(step,650); }
    else { cd.style.display='none'; state='PLAY'; startMusic(); }
  }; step();
}
function gameOver(reason){
  if(!G||G.overDone) return; G.overDone=true;
  if(G.replay) return;                      // reprodução/validação de replay: não grava nada nem mostra painel
  state='OVER'; G.overT=0; stopMusic(); sfx.gameover(); vib([80,60,80]);
  FX.shake=CELL*0.4;
  const res=Results.compile(G,reason), rec=Results.commit(res);
  Results.render(res,rec);
  $('pauseBtn').style.display='none';
  setTimeout(()=>{ if(state==='OVER') show('endPanel'); },1100);
}
function pauseGame(){
  if(state!=='PLAY') return;
  if(G&&G.soft) act(A.SOFT_OFF);
  state='PAUSED'; stopMusic(); if(G) G.soft=false; tS=null;
  try{ if(AC&&AC.suspend) AC.suspend(); }catch(e){}
  renderPause(); show('pausePanel');
}
function resumeGame(){ hide('pausePanel'); hide('confirmBox'); state='PLAY'; try{ac();}catch(e){} startMusic(); }
/** Botão Voltar do Android: fecha confirmação > folha > pausa/retoma > sai do replay. */
function handleBack(){
  if($('confirmBox').classList.contains('on')){ hide('confirmBox'); return; }
  if($('sheet').classList.contains('on')){ Sheet.back(); return; }
  if(state==='PLAY') pauseGame(); else if(state==='PAUSED') resumeGame(); else if(state==='REPLAY') goMenu();
}
function renderPause(){
  const b=$('pauseBody'); clearEl(b);
  if(G){ [kv('Modo',MODE_NAMES[G.mode]||'?'),kv('Score',fmtNum(G.score)),kv('Nível',G.level),kv('Linhas',G.lines),kv('Tempo',fmtMsP(G.ms))].forEach(r=>b.appendChild(r)); }
  b.appendChild(btn('Resume',resumeGame));
  b.appendChild(btn('Restart',()=>Confirm.ask('Reiniciar a partida? O progresso atual será perdido.',()=>startGame(G.mode,G.opts)),''));
  b.appendChild(h('div',{class:'sec',text:'AJUSTES RÁPIDOS'}));
  const row=h('div',{class:'row'});
  row.appendChild(toggleBtn('Sons',()=>settings.sound,v=>{settings.sound=v;saveSettings();refreshMenu();}));
  row.appendChild(toggleBtn('Música',()=>settings.music,v=>{settings.music=v;saveSettings();refreshMenu();}));
  row.appendChild(toggleBtn('Ghost',()=>settings.ghost,v=>{settings.ghost=v;saveSettings();refreshMenu();}));
  b.appendChild(row);
  b.appendChild(slider('Volume música',0,1,0.05,()=>settings.musicVol,v=>{settings.musicVol=v;saveSettings();}));
  b.appendChild(slider('Volume efeitos',0,1,0.05,()=>settings.sfxVol,v=>{settings.sfxVol=v;saveSettings();}));
  b.appendChild(btn('Home',()=>Confirm.ask(G&&G.rules.recordOnExit?'Encerrar a sessão Zen? Ela será salva nas estatísticas.':'Sair para o menu? A partida atual será encerrada sem registro.',leaveGame),'danger'));
}
/** Sair de uma partida em andamento. Zen grava a sessão (sem recorde); outros modos descartam. */
function leaveGame(){
  if(G&&G.rules&&G.rules.recordOnExit&&!G.overDone&&G.ms>3000){ G.overDone=true; Results.commit(Results.compile(G,'exit')); }
  goMenu();
}
function goMenu(){ state='MENU'; stopMusic(); G=null; hideAll(); show('menu'); showTutBanner(false); Replay.stop();
  $('pauseBtn').style.display='none'; canvas.style.filter=''; }

/* ================= UPDATE ================= */
function update(dt){
  if((state!=='PLAY'&&state!=='REPLAY')||!G||G.over) return;
  G.ms+=dt*1000; G.tick++;
  if(G.speedT>0){ G.speedT-=dt; if(G.speedT<=0) G.speed=1; }
  if(G.blurT>0){ G.blurT-=dt; if(G.blurT<=0) canvas.style.filter=''; }
  if(G.rules.tutorial){ Tut.tick(); if(!G) return; }
  if(G.rules.timeLimit){ G.timeAcc+=dt;
    while(G.timeAcc>=1){ G.timeAcc-=1; G.timeLeft--;
      if(G.timeLeft<=0){ G.won=!G.rules.goal||G.rules.goal.type==='time'; gameOver('time'); return; } } }
  const p=G.active; if(!p) return;
  const iv=interval();
  if(G.soft){
    if(!collides(cells(p.t,p.rot,p.x,p.y+1),G.grid)){ p.y++; G.score+=G.level; G.lockT=0; tutEv('soft'); }
  } else if(!G.rules.noGravity){
    G.fallAcc+=dt;
    while(G.fallAcc>=iv){ G.fallAcc-=iv;
      if(!collides(cells(p.t,p.rot,p.x,p.y+1),G.grid)){ p.y++; G.lockT=0; } }
  }
  if(collides(cells(p.t,p.rot,p.x,p.y+1),G.grid)){
    G.lockT+=dt;
    if(G.lockT>=0.5&&!(G.rules.noGravity&&!G.soft)) lockPiece();
  } else G.lockT=0;
}
function updateFx(dt){
  FX.t+=dt;
  if(!settings.fx){ FX.shake=0; FX.parts.length=0; FX.screen=null; FX.pulse=0; }
  for(let i=FX.parts.length-1;i>=0;i--){ const q=FX.parts[i];
    q.life-=dt; if(q.life<=0){FX.parts.splice(i,1);continue;}
    q.vy+=CELL*22*dt; q.x+=q.vx*dt; q.y+=q.vy*dt; }
  for(let i=FX.flash.length-1;i>=0;i--){ FX.flash[i].t-=dt; if(FX.flash[i].t<=0) FX.flash.splice(i,1); }
  for(let i=FX.lock.length-1;i>=0;i--){ FX.lock[i].t-=dt; if(FX.lock[i].t<=0) FX.lock.splice(i,1); }
  if(FX.trail){ FX.trail.t-=dt; if(FX.trail.t<=0) FX.trail=null; }
  if(FX.screen){ FX.screen.t-=dt; if(FX.screen.t<=0) FX.screen=null; }
  FX.shake*=Math.exp(-dt*9); if(FX.shake<.2) FX.shake=0;
  FX.pulse=Math.max(0,FX.pulse-dt*1.3);
  BG.stars.forEach(s=>{ s.y-=s.v*dt; if(s.y<-.02){ s.y=1.02; s.x=Math.random(); } });
  BG.fall.forEach(f=>{ f.y+=f.v*dt; f.r+=f.rs*dt; if(f.y>1.15){ f.y=-.2; f.x=Math.random(); f.t=pickT(); } });
  if(G){
    G.disp+=(G.score-G.disp)*Math.min(1,dt*9); if(Math.abs(G.score-G.disp)<1) G.disp=G.score;
    for(let r=0;r<ROWS;r++){ if(G.rowOff[r]){ G.rowOff[r]-=G.rowOff[r]*Math.min(1,dt*16); if(Math.abs(G.rowOff[r])<.02) G.rowOff[r]=0; } }
    if(G.active){ const p=G.active; p.age+=dt; p.dx+=(p.x-p.dx)*Math.min(1,dt*30); if(Math.abs(p.x-p.dx)<.01) p.dx=p.x; }
    if(state==='OVER') G.overT+=dt;
  }
}
const pickT=()=>'IJLOSTZ'[(Math.random()*7)|0];
