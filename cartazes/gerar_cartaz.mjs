// Gera o cartaz GDS Cascais vs AFD Torre (Veteranos) de raiz, em HTML/SVG.
// Uso: node cartazes/gerar_cartaz.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const b64 = (p) => 'data:image/png;base64,' + fs.readFileSync(p).toString('base64');

const CREST = b64(path.join(dir, 'crest_cascais.png'));
const TORRE = b64(path.join(root, 'public', 'emblemas', 'afd-torre.png'));

// Paleta oficial (manual de normas GDSC)
const C = {
  verdeEsc: '#164F16', verde: '#009662', ouro: '#E3C04D', azul: '#005296',
  vermelho: '#EF3223', castanho: '#3C3008',
};

const W = 1080, H = 1620;

const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Permanent+Marker&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;background:#03110a;position:relative;font-family:'Bebas Neue',sans-serif;color:#fff}
.abs{position:absolute}
svg.abs{left:0;top:0}
.brush{font-family:'Permanent Marker',cursive;text-transform:uppercase;filter:url(#rough)}
.title1{left:0;right:0;top:34px;text-align:center;font-size:132px;line-height:1;color:#fff;
  text-shadow:0 6px 0 #000,0 10px 30px rgba(0,0,0,.8);transform:rotate(-3deg)}
.title2{left:0;right:0;top:150px;text-align:center;font-size:178px;line-height:1;transform:rotate(-3deg);
  background:linear-gradient(180deg,#fff2b0 0%,${C.ouro} 45%,#b8901f 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;
  filter:url(#rough) drop-shadow(0 7px 0 ${C.verdeEsc}) drop-shadow(0 12px 22px rgba(0,0,0,.9))}
.escalao{left:50%;top:352px;transform:translateX(-50%) rotate(-3deg);background:${C.verde};border:3px solid ${C.ouro};
  border-radius:8px;padding:6px 26px 2px;font-family:'Anton';font-size:30px;letter-spacing:6px;white-space:nowrap;
  box-shadow:0 8px 24px rgba(0,0,0,.7)}
.home{left:70px;top:418px;width:430px;text-align:center}
.home .glow{position:absolute;left:50%;top:140px;width:520px;height:520px;transform:translate(-50%,-50%);
  background:radial-gradient(circle,rgba(227,192,77,.55) 0%,rgba(0,150,98,.35) 38%,transparent 68%)}
.home img{position:relative;height:282px;filter:drop-shadow(0 0 18px rgba(227,192,77,.9)) drop-shadow(0 14px 18px rgba(0,0,0,.85))}
.desde{position:relative;display:inline-block;margin-top:6px;font-family:'Anton';font-size:26px;letter-spacing:5px;color:${C.verdeEsc};
  background:linear-gradient(90deg,#c9a233,${C.ouro},#f4dc85,${C.ouro},#c9a233);padding:4px 22px 0;clip-path:polygon(4% 0,96% 0,100% 50%,96% 100%,4% 100%,0 50%)}
.name{font-family:'Anton';text-shadow:0 4px 0 #000,0 6px 16px rgba(0,0,0,.9)}
.home .name{position:relative;font-size:54px;margin-top:0;letter-spacing:2px}
.vs{left:470px;top:505px;width:140px;text-align:center;font-size:150px;color:#fff;transform:rotate(-8deg);
  text-shadow:6px 6px 0 ${C.verde},0 10px 30px rgba(0,0,0,.9)}
.away{left:640px;top:500px;width:380px;text-align:center}
.away img{height:190px;filter:drop-shadow(0 10px 14px rgba(0,0,0,.8))}
.away .name{font-size:28px;line-height:1.05;margin-top:10px;color:#e8efe9}
.info{left:50px;right:50px;top:862px;height:96px;display:flex;align-items:center;justify-content:space-around;
  background:linear-gradient(90deg,rgba(3,20,11,.2),rgba(3,20,11,.85) 15%,rgba(3,20,11,.85) 85%,rgba(3,20,11,.2));
  border-top:3px solid ${C.ouro};border-bottom:3px solid ${C.ouro}}
.it{display:flex;align-items:center;gap:14px}
.it svg{width:46px;height:46px}
.it .t{font-family:'Anton';font-size:26px;line-height:1.1;letter-spacing:1px}
.it .big{font-size:52px}
.sep{width:3px;height:60px;background:${C.verde}}
.bottom{left:0;right:0;bottom:30px;text-align:center}
.slogan1{font-size:150px;line-height:.95;transform:rotate(-3deg);
  background:linear-gradient(180deg,#7dffb9 0%,#00c27e 45%,${C.verde} 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;
  filter:url(#rough) drop-shadow(0 6px 0 #02180c) drop-shadow(0 0 30px rgba(0,230,118,.55)) drop-shadow(0 10px 20px #000)}
.stripe{display:inline-block;margin-top:2px;transform:rotate(-2deg);background:#fff;padding:2px 40px 0;
  clip-path:polygon(2% 8%,99% 0,97% 92%,0 100%);box-shadow:0 10px 30px rgba(0,0,0,.6)}
.stripe span{font-size:84px;color:${C.verdeEsc};line-height:1.1}
.banner{display:inline-flex;align-items:center;gap:16px;margin-top:16px;transform:rotate(-1deg);
  background:${C.verde};border:3px solid ${C.ouro};padding:8px 34px 6px 22px;box-shadow:0 10px 30px rgba(0,0,0,.7)}
.banner span{font-family:'Permanent Marker';font-size:40px;color:#fff;text-shadow:0 3px 6px rgba(0,0,0,.5)}
</style></head><body>

<svg width="0" height="0" style="position:absolute"><defs>
  <filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="5"/></filter>
  <filter id="brushEdge"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.25" numOctaves="3" seed="8"/><feDisplacementMap in="SourceGraphic" scale="40"/></filter>
  <filter id="blur40"><feGaussianBlur stdDeviation="40"/></filter>
  <filter id="blur18"><feGaussianBlur stdDeviation="18"/></filter>
  <filter id="smoke"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="4" seed="11"/><feDisplacementMap in="SourceGraphic" scale="120"/><feGaussianBlur stdDeviation="14"/></filter>
</defs></svg>

<!-- CENA DE FUNDO -->
<svg class="abs" id="scene" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#020d07"/><stop offset=".35" stop-color="#0a2d1b"/>
      <stop offset=".52" stop-color="#1d4a2c"/><stop offset=".6" stop-color="#7a6a2a"/>
      <stop offset=".66" stop-color="#1a3a24"/><stop offset="1" stop-color="#020a05"/>
    </linearGradient>
    <linearGradient id="concrete" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#cfd3cc"/><stop offset=".5" stop-color="#aeb3ab"/><stop offset="1" stop-color="#7d837b"/>
    </linearGradient>
    <radialGradient id="lamp"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#fffbe0" stop-opacity=".9"/><stop offset="1" stop-color="#fff6c0" stop-opacity="0"/></radialGradient>
    <linearGradient id="fadeBottom" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#02100a" stop-opacity="0"/><stop offset=".45" stop-color="#02100a" stop-opacity=".75"/><stop offset="1" stop-color="#010805" stop-opacity=".97"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  <g id="lights"></g>
  <g id="stand"></g>
  <g id="smokeG" filter="url(#smoke)" opacity=".85"></g>
  <g id="flags"></g>
  <g id="crowdFront"></g>
  <rect y="1230" width="${W}" height="440" fill="url(#fadeBottom)"/>
  <!-- pinceladas do topo -->
  <g filter="url(#brushEdge)">
    <path d="M-40 20 L1120 -30 L1120 330 L-40 400 Z" fill="#020604" opacity=".92"/>
    <path d="M-40 360 L700 300 L690 318 L-40 384 Z" fill="${C.verde}"/>
    <path d="M380 395 L1120 330 L1120 344 L385 410 Z" fill="${C.ouro}"/>
    <path d="M-40 60 L180 -20 L200 0 L-40 120 Z" fill="${C.verde}" opacity=".9"/>
    <path d="M900 -20 L1120 -40 L1120 80 Z" fill="${C.verde}" opacity=".9"/>
  </g>
</svg>

<div class="abs brush title1">Futebol</div>
<div class="abs brush title2">Veteranos</div>
<div class="abs escalao">★ ESCALÃO DE VETERANOS ★</div>

<div class="abs home">
  <div class="glow"></div>
  <img src="${CREST}">
  <div class="name">GDS CASCAIS</div>
  <div class="desde">DESDE 1915</div>
</div>
<div class="abs brush vs">VS</div>
<div class="abs away">
  <img src="${TORRE}">
  <div class="name">ASSOCIAÇÃO FAMILIAR<br>E DESPORTIVA DA TORRE</div>
</div>

<div class="abs info">
  <div class="it">
    <svg viewBox="0 0 24 24" fill="none" stroke="${C.ouro}" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/><path d="M7 14h2M11 14h2M15 14h2M7 17h2M11 17h2" stroke-linecap="round"/></svg>
    <div class="t">DOMINGO<br>18 DE OUTUBRO DE 2026</div>
  </div>
  <div class="sep"></div>
  <div class="it">
    <svg viewBox="0 0 24 24" fill="none" stroke="${C.ouro}" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2" stroke-linecap="round"/></svg>
    <div class="t big">18H</div>
  </div>
  <div class="sep"></div>
  <div class="it">
    <svg viewBox="0 0 24 24" fill="${C.ouro}"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>
    <div class="t">CAMPO DO<br>CASCAIS</div>
  </div>
</div>

<div class="abs bottom">
  <div class="brush slogan1">O Cascais</div>
  <div class="stripe"><span class="brush">Na Bancada Central!</span></div><br>
  <div class="banner">
    <svg width="46" height="46" viewBox="0 0 64 64" fill="none"><path d="M12 24H20L38 12V52L20 40H12a4 4 0 0 1-4-4V28a4 4 0 0 1 4-4Z" fill="${C.ouro}" stroke="#fff" stroke-width="2.5"/><path d="M44 22c5 6 5 14 0 20M50 16c8 9 8 23 0 32" stroke="#fff" stroke-width="3" stroke-linecap="round"/></svg>
    <span>VEM APOIAR O DRAMÁTICO!</span>
  </div>
</div>

<script>
const NS='http://www.w3.org/2000/svg';
const W=${W}, H=${H};
const C=${JSON.stringify(C)};
const CREST='${CREST}';
let seed=7; const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
const el=(tag,attrs,parent)=>{const e=document.createElementNS(NS,tag);for(const k in attrs)e.setAttribute(k,attrs[k]);parent&&parent.appendChild(e);return e;};

// Torres de iluminação
const L=document.getElementById('lights');
[[40,560],[1010,540]].forEach(([x,y])=>{
  el('rect',{x:x-6,y:y+60,width:12,height:420,fill:'#0b1a12'},L);
  el('circle',{cx:x,cy:y+20,r:170,fill:'url(#lamp)',opacity:.55},L);
  for(let r=0;r<3;r++)for(let c=0;c<4;c++)el('circle',{cx:x-36+c*24,cy:y+r*22,r:9,fill:'#fffef2'},L);
});

// Bancada central (frontal)
const S=document.getElementById('stand');
const beamY=1020;
el('polygon',{points:\`0,\${beamY-40} \${W},\${beamY-40} \${W},\${beamY-20} 0,\${beamY-20}\`,fill:'#0d1f15'},S); // cobertura
el('rect',{x:0,y:beamY-20,width:W,height:78,fill:'url(#concrete)'},S);
el('rect',{x:0,y:beamY+58,width:W,height:6,fill:'#4d544c'},S);
// luzes sob a cobertura
for(let x=40;x<W;x+=70)el('rect',{x,y:beamY+66,width:30,height:5,rx:2,fill:'#fff8d8',opacity:.9},S);
const t=el('text',{x:W/2,y:beamY+40,'text-anchor':'middle','font-family':'Anton','font-size':52,'letter-spacing':10,fill:'#15231a'},S);
t.textContent='BANCADA CENTRAL';
// emblemas na viga
[150,W-150].forEach(cx=>el('image',{href:CREST,x:cx-20,y:beamY-14,width:40,height:65},S));
// degraus com público
for(let row=0;row<7;row++){
  const y=beamY+80+row*30;
  el('rect',{x:0,y,width:W,height:30,fill:row%2?'#0a1a10':'#0c2014'},S);
  for(let x=4;x<W;x+=11+rnd()*5){
    const lit=rnd();
    const col=lit>.75?C.verde:lit>.62?'#e8e8e0':lit>.55?C.ouro:'#050d08';
    el('circle',{cx:x,cy:y+8,r:4.2,fill:'#050c07'},S);
    el('rect',{x:x-6,y:y+11,width:12,height:18,rx:5,fill:col,opacity:.9},S);
  }
}

// Fumo verde e dourado
const SM=document.getElementById('smokeG');
[[100,1200,240,C.verde,.75],[960,1190,240,C.verde,.7],[540,1260,220,C.ouro,.4],[300,1320,240,'#00b874',.55],[780,1310,250,C.ouro,.35],[30,1000,120,C.verde,.45],[1050,1000,130,C.verde,.45]]
  .forEach(([cx,cy,r,f,o])=>el('ellipse',{cx,cy,rx:r,ry:r*.7,fill:f,opacity:o},SM));

// Bandeiras do Cascais com 1915
const F=document.getElementById('flags');
let fid=0;
function flag(x,y,w,h,rot){
  const id='f'+(fid++);
  const g=el('g',{transform:\`translate(\${x},\${y}) rotate(\${rot})\`},F);
  el('line',{x1:0,y1:-10,x2:0,y2:h*2.6,stroke:'#2a2a22','stroke-width':Math.max(3,w*.025)},g);
  const d=\`M0,0 C\${w*.33},\${-h*.14} \${w*.66},\${h*.14} \${w},0 L\${w},\${h} C\${w*.66},\${h*1.14} \${w*.33},\${h*.86} 0,\${h} Z\`;
  const cp=el('clipPath',{id},g); el('path',{d},cp);
  const inner=el('g',{'clip-path':\`url(#\${id})\`},g);
  el('rect',{x:0,y:-h*.3,width:w,height:h*1.6,fill:C.verde},inner);
  el('rect',{x:w*.34,y:-h*.3,width:w*.32,height:h*1.6,fill:'#f4f6f2'},inner);
  el('rect',{x:0,y:-h*.3,width:w*.06,height:h*1.6,fill:C.ouro},inner);
  // sombreado da ondulação
  el('path',{d:\`M\${w*.25},-50 C\${w*.35},\${h*.5} \${w*.3},\${h} \${w*.25},\${h+50} L\${w*.45},\${h+50} C\${w*.5},\${h} \${w*.55},\${h*.5} \${w*.45},-50Z\`,fill:'#000',opacity:.18},inner);
  el('image',{href:CREST,x:w*.5-h*.22,y:h*.08,width:h*.44,height:h*.72},inner);
  const tx=el('text',{x:w*.5,y:h*.97,'text-anchor':'middle','font-family':'Anton','font-size':h*.2,fill:C.verdeEsc,'letter-spacing':2},inner);
  tx.textContent='1915';
  el('path',{d,fill:'none',stroke:'#000','stroke-opacity':.25,'stroke-width':2},g);
}
flag(30,1130,250,165,-12);
flag(285,1165,170,112,-6);
flag(610,1150,160,105,8);
flag(800,1150,220,145,-10);
flag(990,1195,150,100,6);
flag(170,1290,140,92,10);
flag(660,1285,140,92,-12);

// "1915" em faixa na bancada
const ban=el('g',{},F);
el('rect',{x:415,y:beamY+92,width:250,height:60,fill:C.verde,stroke:C.ouro,'stroke-width':4},ban);
const bt=el('text',{x:540,y:beamY+139,'text-anchor':'middle','font-family':'Anton','font-size':44,fill:'#fff','letter-spacing':6},ban);
bt.textContent='DESDE 1915';

// Público em primeiro plano (silhuetas)
const CF=document.getElementById('crowdFront');
for(let layer=0;layer<3;layer++){
  const baseY=1300+layer*90, s=1+layer*.45;
  for(let x=-20;x<W+20;x+=26*s+rnd()*14){
    const y=baseY+rnd()*20;
    const col=layer===2?'#010503':layer===1?'#03100a':'#061a10';
    el('ellipse',{cx:x,cy:y+40*s,rx:24*s,ry:34*s,fill:col},CF);
    el('circle',{cx:x,cy:y,r:13*s,fill:col},CF);
    if(rnd()>.55){
      const side=rnd()>.5?1:-1;
      el('path',{d:\`M\${x+side*14*s},\${y+20*s} L\${x+side*24*s},\${y-30*s} L\${x+side*20*s},\${y-60*s}\`,stroke:col,'stroke-width':9*s,'stroke-linecap':'round',fill:'none'},CF);
      el('circle',{cx:x+side*20*s,cy:y-64*s,r:7*s,fill:col},CF);
    }
  }
}
</script>
</body></html>`;

fs.writeFileSync(path.join(dir, 'cartaz.html'), html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
const out = path.join(dir, 'cartaz_cascais_veteranos.png');
await page.screenshot({ path: out });
await browser.close();
console.log('OK ->', out);
