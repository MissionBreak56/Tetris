'use strict';
/* Ligação da interface (botões da tela inicial, folhas) e inicialização. */
/* ================= UI ================= */
function refreshMenu(){
  const lb=$('lvBadge'); lb.textContent=settings.startLevel; lb.classList.toggle('on',settings.startLevel>1);
  const tv=$('tVib'); if(tv) tv.textContent='Vibrar: '+(settings.vib?'ON':'OFF');
  $('tGhost').classList.toggle('off',!settings.ghost);
  $('tMusic').classList.toggle('off',!settings.music);
  $('tSound').classList.toggle('off',!settings.sound);
}
$('bMarathon').onclick=()=>{sfx.click();startGame(1);};
$('bTimed').onclick=()=>{sfx.click();startGame(2);};
$('bStrategy').onclick=()=>{sfx.click();startGame(3);};
$('bLevel').onclick=()=>{sfx.click();Hub.open();};
$('sheetBack').onclick=()=>{sfx.click();Sheet.back();};
$('bTheme').onclick=()=>{const ids=Theme.ids(), i=ids.indexOf(settings.theme); settings.theme=ids[(i+1)%ids.length]; saveSettings(); applyTheme(); sfx.click();};
function openLevelSheet(){
  Sheet.push('Nível inicial',(b)=>{
    const g=h('div',{class:'grid'});
    for(let i=1;i<=15;i++) g.appendChild(btn(String(i),()=>{settings.startLevel=i;saveSettings();refreshMenu();Sheet.back();}));
    b.appendChild(g);
  });
}
Hub.add(10,'Nível inicial',openLevelSheet);
$('tGhost').onclick=()=>{settings.ghost=!settings.ghost;saveSettings();refreshMenu();sfx.click();};
$('tMusic').onclick=()=>{settings.music=!settings.music;saveSettings();refreshMenu();sfx.click();if(!settings.music)stopMusic();};
$('tSound').onclick=()=>{settings.sound=!settings.sound;saveSettings();refreshMenu();sfx.click();};
$('rpPlay').onclick=()=>{sfx.click();Replay.toggle();};
$('rpSpeed').onclick=()=>{sfx.click();Replay.speed();};
$('rpExit').onclick=()=>{sfx.click();goMenu();};
$('tutOk').onclick=()=>{sfx.click();Tut.event('ok');};
$('tutSkip').onclick=()=>{sfx.click();Tut.skip();};
$('bRetry').onclick=()=>{sfx.click();startGame(G?G.mode:1,G?G.opts:undefined);};
$('bEndHome').onclick=()=>{sfx.click();goMenu();};
$('pauseBtn').onclick=()=>{ if(state==='PLAY'||state==='VERSUS'){sfx.click();pauseGame();} };
document.addEventListener('visibilitychange',()=>{ if(document.hidden) pauseGame(); });

function msgClass(t){ return /TETRIS/.test(t)&&!/T-SPIN/.test(t)?'m-tetris':/T-SPIN/.test(t)?'m-tspin':/BACK TO BACK/.test(t)?'m-b2b':/^LEVEL/.test(t)?'m-level':/^(SINGLE|DOUBLE|TRIPLE)/.test(t)?'m-lines':SKILLS.includes(t)?'m-skill':''; }
function showMsg(t){ if(SIM) return; if(Versus.attachNote(t)) return; const m=$('msg'); m.textContent=t; m.className=msgClass(t); restartAnim(m,'pop'); }
function showMsg2(t){ if(SIM) return; if(Versus.attachNote(t)) return; const m=$('msg2'); m.textContent=t; m.className=/PERFECT/.test(t)?'m-perfect':''; restartAnim(m,'pop'); }

/* ================= INIT ================= */
applyTheme(); initBG(); resize(); addEventListener('resize',resize);
refreshMenu(); requestAnimationFrame(loop);
