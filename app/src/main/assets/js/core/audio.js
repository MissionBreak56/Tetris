'use strict';
/* Áudio (WebAudio): efeitos e música procedural, volumes por categoria. */
/* ================= ÁUDIO (WebAudio) ================= */
let AC=null, musicTimer=null, musicStep=0;
function ac(){ if(!AC) AC=new (window.AudioContext||window.webkitAudioContext)(); if(AC.state==='suspended'&&AC.resume) AC.resume(); return AC; }
function tone(f,d,type,vol,slide,cat){
  const music=cat==='music';
  if(SIM) return;
  if(music?!settings.music:!settings.sound) return;
  const vv=(vol||0.12)*(music?settings.musicVol:settings.sfxVol);
  if(vv<0.0005) return;
  try{
    const a=ac(),o=a.createOscillator(),g=a.createGain(),t=a.currentTime;
    o.type=type||'square'; o.frequency.setValueAtTime(f,t);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(30,slide),t+d);
    g.gain.setValueAtTime(vv,t); g.gain.exponentialRampToValueAtTime(0.001,t+d);
    o.connect(g).connect(a.destination); o.start(t); o.stop(t+d+0.02);
  }catch(e){}
}
const sfx={
  click:()=>tone(600,.05),
  move:()=>tone(220,.04,'square',.08),
  rotate:()=>tone(330,.07,'square',.1),
  drop:()=>tone(110,.1,'sawtooth',.12),
  dropFast:()=>{tone(160,.1,'sawtooth',.14,60);tone(90,.14,'square',.1,50);},
  line:()=>{tone(523,.09,'square',.12);setTimeout(()=>tone(659,.09,'square',.12),70);setTimeout(()=>tone(784,.12,'square',.12),140);},
  tetris:()=>{[523,659,784,1046].forEach((f,i)=>setTimeout(()=>tone(f,.14,'square',.13),i*70));},
  putBack:()=>tone(440,.08,'triangle',.12),
  gameover:()=>{[392,330,262,196].forEach((f,i)=>setTimeout(()=>tone(f,.22,'sawtooth',.12),i*180));},
  tick:()=>tone(880,.1,'square',.12),
  skill:()=>{[660,880,1100].forEach((f,i)=>setTimeout(()=>tone(f,.1,'triangle',.12),i*80));}
};
const MELODY=[440,0,523,0,659,0,523,0,440,0,392,0,330,0,392,0,
              440,0,523,0,659,0,784,0,659,0,523,0,440,0,0,0];
const BASS=[110,0,0,0,131,0,0,0,110,0,0,0,98,0,131,0];
function startMusic(){
  stopMusic(); if(!settings.music) return;
  musicTimer=setInterval(()=>{
    if(state!=='PLAY') return;
    const m=MELODY[musicStep%MELODY.length], b=BASS[musicStep%BASS.length];
    if(m) tone(m,.15,'square',.05,0,'music');
    if(b) tone(b,.15,'triangle',.06,0,'music');
    musicStep++;
  },160);
}
function stopMusic(){ if(musicTimer){clearInterval(musicTimer);musicTimer=null;} }
function vib(ms){ if(settings.vib && navigator.vibrate) navigator.vibrate(ms); }
