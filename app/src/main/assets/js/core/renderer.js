'use strict';
/* Layout e desenho no Canvas (fundo, moldura, peças, HUD, logo da tela inicial). */
/* ================= LAYOUT / RENDER ================= */
function resize(){
  dpr=Math.min(DPR_MAX,window.devicePixelRatio||1); W=innerWidth; H=innerHeight;
  canvas.width=Math.floor(W*dpr); canvas.height=Math.floor(H*dpr);
  CELL=Math.max(14,Math.floor(Math.min(W/14.4,H/27.5)));
  const pad=CELL*0.5, bw=COLS*CELL, bh=ROWS*CELL;
  L.pad=pad; L.bw=bw; L.bh=bh;
  L.bx=Math.round((W-bw)/2); L.by=Math.round((H-bh)/2+CELL*0.4);
  L.fl=L.bx-pad; L.fr=L.bx+bw+pad; L.ft=L.by-pad; L.fb=L.by+bh+pad;
  L.side=CELL*1.7;
  L.hold={x:L.fl-4-L.side,y:L.ft+CELL*0.95,w:L.side,h:L.side*0.95};
  L.next={x:L.fr+4,y:L.ft+CELL*0.95,w:L.side,h:L.side*0.95*3+CELL*0.1};
  L.hudY=L.ft-CELL*2.0;
  const pr=Controls.pauseRect(L,W,Controls.cfg), pbtn=$('pauseBtn');
  pbtn.style.width=pbtn.style.height=pr.w+'px';
  pbtn.style.left=pr.x+'px'; pbtn.style.top=pr.y+'px'; pbtn.style.opacity=Controls.cfg.opacity;
  layoutMenu();
}
function layoutMenu(){
  const C=CELL, bx=L.bx, by=L.by;
  $('menu').style.setProperty('--cell',C+'px');
  const place=(id,x,y,w,h)=>{ const e=$(id).style; e.left=Math.round(x)+'px'; e.top=Math.round(y)+'px'; e.width=Math.round(w)+'px'; e.height=Math.round(h)+'px'; };
  place('bLevel',bx+7.75*C,by+.45*C,1.85*C,1.85*C);
  const mx=bx+.9*C, mw=8.2*C, mh=2.25*C;
  place('bMarathon',mx,by+9.9*C,mw,mh); place('bTimed',mx,by+13*C,mw,mh); place('bStrategy',mx,by+16.1*C,mw,mh);
  const sz=Math.min(1.7*C,W-L.fr-8), sx=L.fr+Math.max(4,(W-L.fr-sz)/2), gp=.25*C;
  const ySound=L.fb-sz-.35*C, yMusic=ySound-sz-gp, yGhost=yMusic-sz-gp;
  place('tSound',sx,ySound,sz,sz); place('tMusic',sx,yMusic,sz,sz); place('tGhost',sx,yGhost,sz,sz);
  place('bTheme',sx,L.ft+.47*(L.fb-L.ft),sz,sz);
}
function initBG(){
  BG.stars=Array.from({length:44},()=>({x:Math.random(),y:Math.random(),r:.6+Math.random()*1.8,v:.008+Math.random()*.03,a:.2+Math.random()*.55}));
  BG.fall=Array.from({length:9},()=>({t:pickT(),x:Math.random(),y:Math.random()*1.3-.2,r:(Math.random()*4)|0,rs:0,v:.025+Math.random()*.05,k:.55+Math.random()*.7}));
}
function poly(pts){ ctx.beginPath(); ctx.moveTo(pts[0],pts[1]); for(let i=2;i<pts.length;i+=2) ctx.lineTo(pts[i],pts[i+1]); ctx.closePath(); ctx.fill(); }
function drawBlock(x,y,s,color,alpha){ Skins.draw(ctx,x,y,s,color,alpha); }
function rr(x,y,w,h,r){ ctx.beginPath(); if(ctx.roundRect) ctx.roundRect(x,y,w,h,r); else ctx.rect(x,y,w,h); }
function txt(s,x,y,size,color,align,weight){
  ctx.font=(weight||'500')+' '+size+'px "Segoe UI",Roboto,Arial,sans-serif';
  ctx.textAlign=align||'left'; ctx.textBaseline='middle'; ctx.fillStyle=color; ctx.fillText(s,x,y);
}
function neonBox(x,y,w,h){
  ctx.save();
  const g=ctx.createLinearGradient(0,y,0,y+h); const T=TH(); g.addColorStop(0,'rgba('+T[5]+',.85)'); g.addColorStop(1,'rgba('+T[5]+',.95)');
  ctx.fillStyle=g; rr(x,y,w,h,CELL*0.12); ctx.fill();
  ctx.shadowColor='rgb('+T[3]+')'; ctx.shadowBlur=CELL*0.35;
  ctx.strokeStyle=T[2]; ctx.lineWidth=Math.max(2,CELL*0.07); rr(x,y,w,h,CELL*0.12); ctx.stroke();
  ctx.restore();
}
function drawMini(t,bx,by,bw,bh,alpha){
  const cs=SHAPES[t].rot[0];
  const xs=cs.map(c=>c[0]),ys=cs.map(c=>c[1]);
  const minx=Math.min(...xs),maxx=Math.max(...xs),miny=Math.min(...ys),maxy=Math.max(...ys);
  const s=bw*0.19;
  const ox=bx+(bw-(maxx-minx+1)*s)/2-minx*s, oy=by+(bh-(maxy-miny+1)*s)/2-miny*s;
  cs.forEach(([cx,cy])=>drawBlock(ox+cx*s,oy+cy*s,s,COLORS[t],alpha));
}
/* Camadas estáticas em cache (offscreen): só são refeitas quando tema/tamanho mudam. */
const LC={};
function layer(name,key,w,h,paint){
  let l=LC[name];
  if(!l||l.key!==key){
    const cv=(l&&l.cv)||document.createElement('canvas');
    cv.width=Math.max(1,Math.floor(w*dpr)); cv.height=Math.max(1,Math.floor(h*dpr));
    const c=cv.getContext('2d'); c.setTransform(dpr,0,0,dpr,0,0); paint(c);
    l=LC[name]={cv,key};
  }
  return l.cv;
}
function drawBackground(){
  const T=TH();
  const bg=layer('bg',[W,H,dpr,T[0],T[1],T[3]].join('|'),W,H,(c)=>{
    const g=c.createLinearGradient(0,0,0,H); g.addColorStop(0,T[0]); g.addColorStop(1,T[1]);
    c.fillStyle=g; c.fillRect(0,0,W,H);
    const rg=c.createRadialGradient(W/2,H*.38,0,W/2,H*.38,H*.65);
    rg.addColorStop(0,'rgba('+T[3]+',.28)'); rg.addColorStop(1,'rgba('+T[3]+',0)');
    c.fillStyle=rg; c.fillRect(0,0,W,H);
  });
  ctx.drawImage(bg,0,0,W,H);
  BG.fall.forEach(f=>{
    const cs=SHAPES[f.t].rot[f.r%4], s=CELL*f.k, x0=f.x*W, y0=f.y*H;
    cs.forEach(([cx,cy])=>drawBlock(x0+cx*s,y0+cy*s,s,COLORS[f.t],.10));
  });
  // estrelas: 4 níveis de brilho, um único caminho/preenchimento por nível
  const lv=[[],[],[],[]];
  BG.stars.forEach(s=>{ const a=s.a*(.6+.4*Math.sin(FX.t*2+s.x*20)); lv[Math.min(3,(a*5.5)|0)].push(s); });
  ctx.fillStyle='#cfe0ff';
  lv.forEach((arr,i)=>{ if(!arr.length) return; ctx.globalAlpha=(i+.5)/5.5; ctx.beginPath(); arr.forEach(s=>{ const x=s.x*W,y=s.y*H; ctx.moveTo(x+s.r,y); ctx.arc(x,y,s.r,0,6.3); }); ctx.fill(); });
  ctx.globalAlpha=1;
}
function paintFrame(c,pulse){
  const {fl,ft,fr,fb,pad}=L, T=TH(), X=Theme.extras(), rrc=(x,y,w,h,r)=>Skins._rr(c,x,y,w,h,r);
  c.save();
  c.fillStyle='rgba('+T[4]+',.55)'; rrc(fl,ft,fr-fl,fb-ft,CELL*0.2); c.fill();
  c.shadowColor='rgb('+T[3]+')'; c.shadowBlur=CELL*(0.5+pulse*1.6);
  c.strokeStyle=pulse>0?T[2]:'rgb('+T[3]+')'; c.lineWidth=CELL*0.15;
  rrc(fl+CELL*.07,ft+CELL*.07,fr-fl-CELL*.14,fb-ft-CELL*.14,CELL*0.2); c.stroke();
  c.restore();
  c.strokeStyle=T[2]; c.lineWidth=CELL*0.07;
  rrc(fl+pad*.5,ft+pad*.5,fr-fl-pad,fb-ft-pad,CELL*0.1); c.stroke();
  const g=c.createLinearGradient(0,L.by,0,L.by+L.bh); g.addColorStop(0,X.board1); g.addColorStop(1,X.board2);
  c.fillStyle=g; c.fillRect(L.bx,L.by,L.bw,L.bh);
  c.strokeStyle='rgba('+X.grid+',.30)'; c.lineWidth=1; c.beginPath();
  for(let i=1;i<COLS;i++){ c.moveTo(L.bx+i*CELL+.5,L.by); c.lineTo(L.bx+i*CELL+.5,L.by+L.bh); }
  for(let r=1;r<ROWS;r++){ c.moveTo(L.bx,L.by+r*CELL+.5); c.lineTo(L.bx+L.bw,L.by+r*CELL+.5); }
  c.stroke();
}
function drawFrame(name){
  if(FX.pulse>0&&!name){ paintFrame(ctx,FX.pulse); return; }     // durante o pulso o brilho varia a cada quadro
  const T=TH(), X=Theme.extras();
  const cv=layer(name||'frame',[W,H,dpr,CELL,L.fl,L.ft,L.fr,L.fb,T.join(),X.board1,X.board2,X.grid].join('|'),W,H,(c)=>paintFrame(c,0));
  ctx.drawImage(cv,0,0,W,H);
}
function drawLogo(){
  const C=CELL, T=TH(), x=L.bx+.9*C, y=L.by+3.3*C, w=8.2*C, h=2.8*C, gold='#d9ad4f';
  const sx=L.bx+3.55*C, sw=2.9*C, sy=y+h, sh=2.8*C, lw=Math.max(2,C*.05);
  ctx.save();
  // haste do T
  let g=ctx.createLinearGradient(0,sy,0,sy+sh); g.addColorStop(0,'#050b3a'); g.addColorStop(1,'rgba('+T[3]+',.65)');
  ctx.fillStyle=g; ctx.fillRect(sx,sy,sw,sh);
  g=ctx.createLinearGradient(0,sy,0,sy+sh); g.addColorStop(0,'rgba('+T[3]+',0)'); g.addColorStop(1,'rgba('+T[3]+',.5)');
  ctx.fillStyle=g; poly([sx+.3*C,sy,sx+sw-.3*C,sy,sx+sw-.7*C,sy+sh-.15*C,sx+.7*C,sy+sh-.15*C]);
  ctx.strokeStyle=gold; ctx.lineWidth=lw; ctx.beginPath();
  ctx.moveTo(sx,sy); ctx.lineTo(sx,sy+sh); ctx.lineTo(sx+sw,sy+sh); ctx.lineTo(sx+sw,sy); ctx.stroke();
  // caixa do logo
  g=ctx.createLinearGradient(0,y,0,y+h); g.addColorStop(0,'#0a1550'); g.addColorStop(1,'#030828');
  ctx.shadowColor='rgba(217,173,79,'+(.35+.15*Math.sin(FX.t*2.4))+')'; ctx.shadowBlur=C*.5;
  ctx.fillStyle=g; ctx.fillRect(x,y,w,h); ctx.shadowBlur=0;
  ctx.fillStyle=g; ctx.fillRect(sx+lw,y+h-lw,sw-2*lw,lw*2);
  ctx.strokeStyle=gold; ctx.lineWidth=lw;
  ctx.beginPath(); ctx.moveTo(x,y+h); ctx.lineTo(sx,y+h); ctx.moveTo(sx+sw,y+h); ctx.lineTo(x+w,y+h);
  ctx.moveTo(x,y+h); ctx.lineTo(x,y); ctx.lineTo(x+w,y); ctx.lineTo(x+w,y+h); ctx.stroke();
  // letras
  const letters='TETRIS', cols=[['#ff8a4a','#d63a18'],['#ffd650','#f08a1a'],['#eef25a','#a9c82a'],['#86d84e','#2c982a'],['#86d0ff','#2f78d8'],['#dc94ff','#8a3ad0']];
  const fs=h*.9; ctx.font='900 '+fs+'px Impact,"Arial Black",Roboto,sans-serif'; ctx.textBaseline='middle'; ctx.textAlign='left';
  const ws=[...letters].map(l=>ctx.measureText(l).width), gap=fs*.03;
  const total=ws.reduce((a,b)=>a+b,0)+gap*5, sc=(w-.8*C)/total;
  let cx=x+(w-total*sc)/2;
  [...letters].forEach((ch,i)=>{
    ctx.save(); ctx.translate(cx,y+h*.54); ctx.scale(sc,1);
    const gr=ctx.createLinearGradient(0,-fs*.4,0,fs*.4); gr.addColorStop(0,cols[i][0]); gr.addColorStop(1,cols[i][1]);
    ctx.lineJoin='round'; ctx.lineWidth=Math.max(2,fs*.07); ctx.strokeStyle='rgba(0,0,0,.6)'; ctx.strokeText(ch,0,0);
    ctx.fillStyle=gr; ctx.fillText(ch,0,0);
    ctx.restore(); cx+=(ws[i]+gap)*sc; });
  ctx.restore();
}
function drawReplayHud(){ const c=Replay.cur; if(!c) return; txt((c.done?'FIM DO REPLAY':'▶ REPLAY')+(c.paused?' · PAUSADO':' ×'+c.speed),W/2,L.fb+CELL*0.9,CELL*0.55,'#ffd54a','center','700'); }
function drawMenuHud(){
  const y=L.hudY, T=TH();
  ctx.save(); ctx.shadowColor='rgb('+T[3]+')'; ctx.shadowBlur=CELL*0.4;
  txt('SCORE',W/2,y,CELL*1.15,'#fff','center','500'); ctx.restore();
  txt('BEST '+(+(LS('bestScore')||0)),W/2,y+CELL*0.95,CELL*0.5,T[2],'center','600');
  txt(Profile.cur().name,W/2,y+CELL*1.55,CELL*0.4,'rgba(255,255,255,.55)','center','500');
}
function drawHUD(){
  const sz=CELL*0.62, y=L.hudY;
  txt('LEVEL '+G.level,L.fl-CELL*1.05,y,sz,'#fff','left');
  txt('LINES '+G.lines,L.fr+CELL*1.05,y,sz,'#fff','right');
  const pop=1+Math.min(.25,Math.abs(G.score-G.disp)/400);
  ctx.save(); ctx.translate(W/2,y); ctx.scale(pop,pop);
  ctx.shadowColor='#4f8bff'; ctx.shadowBlur=CELL*0.3;
  txt(String(Math.round(G.disp)),0,0,CELL*1.15,'#fff','center','500'); ctx.restore();
  if(G.rules.timeLimit) txt('TIME '+G.timeLeft,W/2,y+CELL*0.95,CELL*0.5,G.timeLeft<=10?'#ff6a6a':'#a9c6ff','center','600');
  else if(G.rules.goal) txt(fmtMsP(G.ms)+'  ·  '+(G.rules.goal.type==='lines'?G.lines+'/'+G.rules.goal.target+' linhas':fmtNum(G.score)+'/'+fmtNum(G.rules.goal.target)),W/2,y+CELL*0.95,CELL*0.5,'#a9c6ff','center','600');
  else if(G.mode===4) txt('ZEN',W/2,y+CELL*0.95,CELL*0.5,'#a9c6ff','center','600');
  if(G.rules.skills) txt('x'+G.mult.toFixed(1)+'  ·  ?'+(G.qBlock?'':' '+G.qCounter+'/'+G.qThreshold),W/2,y+CELL*0.95,CELL*0.5,'#ffd54a','center','600');
  txt('Hold',L.hold.x+CELL*0.25,L.hold.y-CELL*0.5,CELL*0.55,'#fff','left');
  neonBox(L.hold.x,L.hold.y,L.hold.w,L.hold.h);
  if(G.held) drawMini(G.held,L.hold.x,L.hold.y,L.hold.w,L.hold.h,G.canHold?1:.4);
  txt('Next',L.next.x+CELL*0.3,L.next.y-CELL*0.5,CELL*0.55,'#fff','left');
  neonBox(L.next.x,L.next.y,L.next.w,L.next.h);
  const sh=L.next.h/3;
  G.queue.slice(0,3).forEach((t,i)=>drawMini(t,L.next.x,L.next.y+i*sh,L.next.w,sh,1));
}
function drawBoard(){
  ctx.save();
  ctx.beginPath(); ctx.rect(L.bx,L.by,L.bw,L.bh); ctx.clip();
  const gray=G.overT*30;
  // linhas flash
  FX.flash.forEach(f=>{ if(f.b!==G.vi) return; ctx.fillStyle='rgba(255,255,255,'+(f.t/.34*.9)+')'; ctx.fillRect(L.bx,L.by+f.r*CELL-CELL*(1-f.t/.34)*.1,L.bw,CELL); });
  // peças fixas
  for(let r=0;r<ROWS;r++){ const yy=L.by+(r-G.rowOff[r])*CELL;
    for(let c=0;c<COLS;c++){ const col=G.grid[r][c]; if(!col) continue;
      drawBlock(L.bx+c*CELL,yy,CELL,(state==='OVER'&&(ROWS-1-r)<gray)?'#5a6080':col); } }
  // bloco pergunta
  if(G.qBlock&&G.grid[G.qBlock.r]&&G.grid[G.qBlock.r][G.qBlock.c]){
    const qx=L.bx+G.qBlock.c*CELL, qy=L.by+(G.qBlock.r-G.rowOff[G.qBlock.r])*CELL;
    const k=1+.08*Math.sin(FX.t*8);
    ctx.save(); ctx.translate(qx+CELL/2,qy+CELL/2); ctx.scale(k,k);
    ctx.shadowColor='#ffb300'; ctx.shadowBlur=CELL*0.5;
    ctx.fillStyle='rgba(255,213,74,.95)'; ctx.beginPath(); ctx.arc(0,0,CELL*0.34,0,6.3); ctx.fill();
    ctx.shadowBlur=0; txt('?',0,CELL*0.02,CELL*0.52,'#3a2a00','center','800'); ctx.restore();
  }
  const p=G.active;
  if(p&&state!=='OVER'){
    const frac=0; // descida de bloco em bloco, sem interpolação vertical
    if(settings.ghost&&!G.rules.noGhost){
      const gy=ghostY();
      ctx.strokeStyle=Theme.extras().ghost; ctx.lineWidth=Math.max(2,CELL*0.06);
      cells(p.t,p.rot,p.x,gy).forEach(([x,y])=>{ if(y>=0) ctx.strokeRect(L.bx+x*CELL+CELL*.08,L.by+y*CELL+CELL*.08,CELL*.84,CELL*.84); });
    }
    if(FX.trail&&FX.trail.b===G.vi){ const t=FX.trail, a=t.t/t.max;
      t.cols.forEach(c=>{ const x=L.bx+c.x*CELL, y0=L.by+Math.max(0,c.y0)*CELL, y1=L.by+c.y1*CELL;
        const g=ctx.createLinearGradient(0,y0,0,y1); g.addColorStop(0,'rgba(255,255,255,0)'); g.addColorStop(1,t.color);
        ctx.globalAlpha=a*.5; ctx.fillStyle=g; ctx.fillRect(x+CELL*.1,y0,CELL*.8,Math.max(0,y1-y0)); ctx.globalAlpha=1; }); }
    const ox=(p.dx-p.x)*CELL, oy=frac*CELL, al=Math.min(1,.35+p.age*7);
    cells(p).forEach(([x,y])=>{ if(y>=0||oy>0) drawBlock(L.bx+x*CELL+ox,L.by+y*CELL+oy,CELL,COLORS[p.t],al); });
  }
  FX.lock.forEach(l=>{ if(l.b!==G.vi) return; ctx.fillStyle='rgba(255,255,255,'+(l.t/.28*.75)+')'; ctx.fillRect(L.bx+l.x*CELL,L.by+l.y*CELL,CELL,CELL); });
  ctx.restore();
}
function render(){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  drawBackground();
  ctx.save();
  if(FX.shake>0) ctx.translate((Math.random()-.5)*FX.shake*2,(Math.random()-.5)*FX.shake*2);
  if(Versus.active&&state!=='MENU'){ Versus.render(); }
  else if(G&&state!=='MENU'){ drawFrame(); drawBoard(); drawHUD(); if(state==='REPLAY') drawReplayHud(); }
  else if(state==='MENU'){ drawFrame(); drawLogo(); drawMenuHud(); }
  FX.parts.forEach(q=>{ ctx.globalAlpha=Math.max(0,q.life/q.max); ctx.fillStyle=q.color; ctx.fillRect(q.x-q.size/2,q.y-q.size/2,q.size,q.size); });
  ctx.globalAlpha=1;
  ctx.restore();
  if(FX.screen){ ctx.fillStyle='rgba('+FX.screen.c+','+(FX.screen.t/FX.screen.max*.35)+')'; ctx.fillRect(0,0,W,H); }
}
