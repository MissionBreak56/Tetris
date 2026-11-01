'use strict';
/* Motor do jogo: estado G, peças, movimento, rotação, trava, pontuação, T-Spin, habilidades do modo Estratégia. */
/* ================= ESTADO ================= */
let state='MENU', G=null, CELL=40, W=0, H=0, dpr=1;
const canvas=$('cv'), ctx=canvas.getContext('2d');
const L={};   // layout
const FX={parts:[],flash:[],lock:[],trail:null,shake:0,pulse:0,screen:null,t:0};
const BG={stars:[],fall:[]};

function gravFrames(lv){ if(lv<=10) return GRAV[lv-1]; if(lv<=13) return 5;
  if(lv<=16) return 4; if(lv<=19) return 3; if(lv<=29) return 2; return 1; }
function newGrid(){ return Array.from({length:ROWS},()=>Array(COLS).fill(null)); }
const rnd=()=>(G&&G.rng)?G.rng():Math.random();   // aleatoriedade de JOGO (determinística por semente); efeitos visuais usam Math.random
function shuffle(a){ for(let i=a.length-1;i>0;i--){const j=(rnd()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]];} return a; }
function refill(q){ q.push(...shuffle(['I','J','L','O','S','T','Z'])); }
function cells(p,rot,x,y){
  if(typeof p==='object'){ const o=p; p=o.t; rot=rot??o.rot; x=x??o.x; y=y??o.y; }
  return SHAPES[p].rot[rot].map(([cx,cy])=>[cx+x,cy+y]);
}
function collides(cs,grid){ return cs.some(([x,y])=> x<0||x>=COLS||y>=ROWS||(y>=0&&grid[y][x])); }
function makePiece(t){ return {t,rot:0,x:3,y:t==='I'?-1:0,dx:3,age:0}; }
function interval(){ return gravFrames(G.level)/FPS*G.speed; }

function newGame(mode,opts){
  opts=opts||{};
  const seed=opts.seed!=null?(opts.seed>>>0):((Math.random()*4294967296)>>>0);
  const rules=rulesFor(mode,opts);
  G={ mode, opts, rules, seed, rng:mkRng(seed), grid:newGrid(), queue:[], active:null, held:null, canHold:true,
      level:rules.fixedLevel||settings.startLevel, sl:settings.startLevel, replay:false, lines:0, score:0, disp:0, mult:1,
      fallAcc:0, lockT:0, soft:false, lastRot:false,
      speed:1, speedT:0, blurT:0, qBlock:null, qCounter:0, qThreshold:10,
      timeLeft:rules.timeLimit||120, timeAcc:0, b2b:false, over:false, rowOff:Array(ROWS).fill(0), overT:0,
      combo:0, maxCombo:0, tetrises:0, tspins:0, perfect:0, pieces:0, actions:0, ms:0, tick:0, rec:rules.tutorial?null:[] };
  refill(G.queue); refill(G.queue);
  FX.parts.length=0; FX.flash.length=0; FX.lock.length=0; FX.trail=null; FX.shake=0; FX.pulse=0; FX.screen=null;
  spawn();
}
function spawn(){
  const t=G.queue.shift(); if(G.queue.length<7) refill(G.queue);
  G.active=makePiece(t);
  G.canHold=true; G.lastRot=false; G.fallAcc=0; G.lockT=0;
  if(collides(cells(G.active),G.grid)){
    if(G.rules.topout==='reset'){ G.grid=newGrid(); G.rowOff.fill(0); FX.pulse=1; if(!G.rules.tutorial) showMsg2('ZEN RESET'); }
    else { G.over=true; gameOver(); }
  }
}
function move(dx){
  const p=G.active; if(!p) return false;
  if(!collides(cells(p.t,p.rot,p.x+dx,p.y),G.grid)){ p.x+=dx; sfx.move(); G.lockT=0; tutEv('move'); return true; }
  return false;
}
function rotate(dir){
  const p=G.active; if(!p) return false;
  const nr=(p.rot+dir+4)%4;
  for(const [kx,ky] of KICKS){
    if(!collides(cells(p.t,nr,p.x+kx,p.y+ky),G.grid)){
      p.rot=nr; p.x+=kx; p.y+=ky; sfx.rotate(); G.lastRot=true; G.lockT=0; tutEv('rotate'); return true;
    }
  }
  return false;
}
function hardDrop(){
  const p=G.active; if(!p) return;
  tutEv('hard');
  const start=cells(p);
  let d=0; while(!collides(cells(p.t,p.rot,p.x,p.y+1),G.grid)){ p.y++; d++; }
  const end=cells(p);
  G.score+=d*2*G.level;
  const cols={};
  start.forEach(([x,y])=>{ cols[x]=Math.min(cols[x]??99,y); });
  const bottoms={}; end.forEach(([x,y])=>{ bottoms[x]=Math.max(bottoms[x]??-99,y); });
  FX.trail={cols:Object.keys(cols).map(x=>({x:+x,y0:cols[x],y1:bottoms[x]})),color:COLORS[p.t],t:.25,max:.25};
  FX.shake=Math.max(FX.shake,CELL*0.1);
  sfx.dropFast(); vib(30); lockPiece();
}
function hold(){
  const p=G.active; if(!p||!G.canHold||G.rules.noHold) return;
  tutEv('hold');
  sfx.putBack();
  const cur=p.t;
  if(G.held){ G.active=makePiece(G.held);
    if(collides(cells(G.active),G.grid)){ gameOver(); return; } }
  else spawn();
  G.held=cur; G.canHold=false; G.lastRot=false; G.fallAcc=0; G.lockT=0;
}
function ghostY(){
  const p=G.active; let y=p.y;
  while(!collides(cells(p.t,p.rot,p.x,y+1),G.grid)) y++;
  return y;
}
function isTSpin(p,grid){
  if(p.t!=='T'||!G.lastRot) return false;
  const cx=p.x+1, cy=p.y+1; let n=0;
  [[-1,-1],[1,-1],[-1,1],[1,1]].forEach(([dx,dy])=>{
    const x=cx+dx,y=cy+dy;
    if(x<0||x>=COLS||y>=ROWS||(y>=0&&grid[y][x])) n++;
  });
  return n>=3;
}
function burst(c,r,color,count){
  if(!color) return;
  const px=L.bx+(c+.5)*CELL, py=L.by+(r+.5)*CELL;
  for(let i=0;i<count;i++){
    const a=Math.random()*Math.PI*2, sp=CELL*(2+Math.random()*7);
    FX.parts.push({x:px,y:py,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-CELL*3,
      life:.6+Math.random()*.4,max:1,size:CELL*(.12+Math.random()*.16),color});
  }
}
function lockPiece(){
  const p=G.active;
  const cs=cells(p);
  if(cs.some(([,y])=>y<0)){
    if(G.rules.topout==='reset'){ G.grid=newGrid(); G.rowOff.fill(0); FX.pulse=1; if(!G.rules.tutorial) showMsg2('ZEN RESET'); spawn(); return; }
    gameOver(); return; }
  cs.forEach(([x,y])=>{ G.grid[y][x]=COLORS[p.t]; FX.lock.push({x,y,t:.28}); });
  const tspin=isTSpin(p,G.grid);
  sfx.drop();
  const cleared=[];
  for(let r=0;r<ROWS;r++) if(G.grid[r].every(c=>c)) cleared.push(r);
  const n=cleared.length;
  G.pieces++;
  if(n>0){ G.combo++; if(G.combo>G.maxCombo) G.maxCombo=G.combo; } else G.combo=0;
  if(n===4) G.tetrises++;
  if(tspin) G.tspins++;
  const skill=!!(G.qBlock&&cleared.includes(G.qBlock.r));
  if(n){
    cleared.forEach(r=>{ FX.flash.push({r,t:.34});
      for(let c=0;c<COLS;c++) burst(c,r,G.grid[r][c],n>=4?4:2); });
    const keep=[]; for(let r=0;r<ROWS;r++) if(!cleared.includes(r)) keep.push(r);
    const ng=newGrid(), off=Array(ROWS).fill(0);
    keep.forEach((orig,i)=>{ const nr=n+i; ng[nr]=G.grid[orig]; off[nr]=nr-orig; });
    if(G.qBlock&&!skill) G.qBlock.r+=cleared.filter(r=>r>G.qBlock.r).length;
    G.grid=ng; G.rowOff=off;
    FX.shake=Math.max(FX.shake,n>=4?CELL*0.5:CELL*0.2);
    if(n>=4) FX.screen={c:'255,255,255',t:.4,max:.4};
  }
  const pcl=n>0&&G.grid.every(row=>row.every(c=>!c));
  if(pcl) G.perfect++;
  if(skill){ G.qBlock=null; triggerSkill(); }
  let base=0,name='';
  if(tspin&&n===0){base=400;name='T-SPIN';}
  else if(tspin){base=[0,800,1200,1600][n];name='T-SPIN '+['','SINGLE','DOUBLE','TRIPLE'][n];}
  else if(n>0){base=POINTS[n];name=['','SINGLE','DOUBLE','TRIPLE','TETRIS'][n];}
  let pts=base*G.level*G.mult;
  const special=(n===4)||tspin;
  if(special&&n>0&&G.b2b){pts*=1.5;name='BACK TO BACK '+name;}
  if(special) G.b2b=true; else if(n>0) G.b2b=false;
  if(n>0||tspin){ G.score+=Math.round(pts); showMsg(name); (n>=4?sfx.tetris:sfx.line)(); vib(40); }
  if(pcl) showMsg2('PERFECT CLEAR'); else if(G.combo>=2) showMsg2('COMBO x'+G.combo);
  if(G.rules.skills){
    G.qCounter+=n;
    if(!G.qBlock&&G.qCounter>=G.qThreshold) placeQuestion();
  }
  G.lines+=n;
  while(G.rules.levelUps&&G.lines>=10*G.level&&G.level<30){ G.level++; showMsg('LEVEL '+G.level); FX.pulse=1; }
  if(n>0) tutEv('line');
  if(checkGoal()) return;
  if(!G.over) spawn();
}
function checkGoal(){
  const g=G.rules.goal; if(!g||G.overDone) return false;
  const v=g.type==='lines'?G.lines:g.type==='score'?G.score:0;
  if((g.type==='lines'||g.type==='score')&&v>=g.target){ G.won=true; gameOver('goal'); return true; }
  return false;
}
function placeQuestion(){
  for(let t=0;t<25;t++){
    const c=(rnd()*COLS)|0;
    for(let r=0;r<ROWS;r++){ if(G.grid[r][c]){ G.qBlock={r,c}; G.qCounter=0; return; } }
  }
}
function triggerSkill(){
  const s=SKILLS[(rnd()*SKILLS.length)|0];
  const g=G.grid, g0=G;
  const shift=(cols,dx)=>{ cols.forEach(c=>{
    const order=dx>0?[...Array(ROWS).keys()]:[...Array(ROWS).keys()].reverse();
    order.forEach(r=>{ if(g[r][c]&&c+dx>=0&&c+dx<COLS&&!g[r][c+dx]){g[r][c+dx]=g[r][c];g[r][c]=null;} });
  });};
  if(s==='SPEED_UP'){ G.speed=0.5; G.speedT=10; }
  else if(s==='BLUR'){ canvas.style.filter='blur(3px)'; G.blurT=6; }
  else if(s==='SHIFT') shift([...Array(COLS).keys()],rnd()<0.5?-1:1);
  else if(s==='TURN'){ const o=g.map(r=>r.slice()); for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++) g[r][c]=o[ROWS-1-r][COLS-1-c]; }
  else if(s==='TWIST'){ const o=g.map(r=>r.slice()); for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++) g[r][c]=o[r][COLS-1-c]; }
  else if(s==='EROSION'){ const occ=[]; for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++) if(g[r][c]) occ.push([r,c]);
    shuffle(occ).slice(0,8).forEach(([r,c])=>{ burst(c,r,g[r][c],4); g[r][c]=null; }); }
  else if(s==='FISSION'){ shift([0,1,2,3,4],-1); shift([5,6,7,8,9],1); }
  else if(s==='FUSION'){ shift([0,1,2,3,4],1); shift([5,6,7,8,9],-1); }
  else if(s==='INVASION'){ let n=0,tries=0;
    while(n<6&&tries<200){ tries++; const r=(rnd()*ROWS)|0,c=(rnd()*COLS)|0;
      if(!g[r][c]){ g[r][c]=Object.values(COLORS)[(rnd()*7)|0]; burst(c,r,g[r][c],3); n++; } } }
  if(G.rules.skills){ G.mult+=0.5; G.qThreshold=5; G.qCounter=0; }
  FX.screen={c:SKILL_RGB[s]||'255,255,255',t:.5,max:.5}; FX.shake=Math.max(FX.shake,CELL*0.3); FX.pulse=1;
  showMsg(s); sfx.skill(); vib([40,60,40]);
}
