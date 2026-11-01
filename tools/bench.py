# Benchmark de renderização (opcional): python3 tools/bench.py /caminho/index.html RÓTULO  (requer: pip install playwright && playwright install chromium)
import sys, json
from playwright.sync_api import sync_playwright
path=sys.argv[1]; label=sys.argv[2] if len(sys.argv)>2 else ''
JS_SETUP="""
window.__ops={}; const P=CanvasRenderingContext2D.prototype;
['fillRect','strokeRect','fill','stroke','drawImage','createLinearGradient','createRadialGradient','arc','fillText','beginPath'].forEach(n=>{const o=P[n]; window.__ops[n]=0; P[n]=function(){window.__ops[n]++; return o.apply(this,arguments);};});
"""
JS_FILL="""(()=>{ startGame(1,{seed:11}); state='PLAY'; const r=(()=>{let x=3;return()=>(x=(Math.imul(x,1664525)+1013904223)>>>0)/4294967296})();
 for(let rw=8;rw<20;rw++) for(let c=0;c<10;c++) if(r()<.85) G.grid[rw][c]=Object.values(COLORS)[(r()*7)|0]; })()"""
def measure(pg,setup,n=300):
    pg.evaluate(setup); pg.wait_for_timeout(200)
    return pg.evaluate("""(n)=>{ for(const k in window.__ops) window.__ops[k]=0; for(let i=0;i<20;i++) render(); for(const k in window.__ops) window.__ops[k]=0;
      const t0=performance.now(); for(let i=0;i<n;i++){ updateFx(0.016); render(); } const dt=(performance.now()-t0)/n;
      const ops={}; let tot=0; for(const k in window.__ops){ops[k]=Math.round(window.__ops[k]/n); tot+=window.__ops[k]/n;} return {ms:+dt.toFixed(3),ops_total:Math.round(tot),ops}; }""",n)
with sync_playwright() as p:
    b=p.chromium.launch(); res={}
    for rep in range(3):
        pg=b.new_page(viewport={'width':411,'height':890},device_scale_factor=3)
        pg.add_init_script(JS_SETUP); pg.goto('file://'+path); pg.wait_for_timeout(500)
        r={}
        r['menu']=measure(pg,"state='MENU'; G=null;")
        r['play_full']=measure(pg,JS_FILL)
        r['paused']=measure(pg,"state='PAUSED'")
        for k,v in r.items(): res.setdefault(k,[]).append(v)
        pg.close()
    b.close()
for k,v in res.items():
    ms=sorted(x['ms'] for x in v)[1]
    print(f"{label:10} {k:10} median {ms:6.3f} ms/frame   ops/frame {v[0]['ops_total']:5d}  (fillRect {v[0]['ops']['fillRect']}, fill {v[0]['ops']['fill']}, stroke {v[0]['ops']['stroke']}, drawImage {v[0]['ops']['drawImage']}, gradients {v[0]['ops']['createLinearGradient']+v[0]['ops']['createRadialGradient']})")
