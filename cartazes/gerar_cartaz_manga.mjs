import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');

const b64 = (p, mime = 'image/png') => `data:${mime};base64,` + fs.readFileSync(p).toString('base64');
const fontB64 = (p) => 'data:font/ttf;base64,' + fs.readFileSync(p).toString('base64');

// Emblemas e imagem tratada da bancada
const CREST_CSC = b64(path.join(dir, 'crest_cascais.png'));
const CREST_TORRE = b64(path.join(root, 'public', 'emblemas', 'afd-torre.png'));
const MANGA_BANCADA = b64(path.join(dir, 'manga_bancada_hd.png'));

// Fontes locais
const FONT_DELA = fontB64(path.join(root, 'fonts', 'DelaGothicOne.ttf'));
const FONT_BANGERS = fontB64(path.join(root, 'fonts', 'Bangers.ttf'));
const FONT_ANTON = fontB64(path.join(root, 'fonts', 'Anton.ttf'));
const FONT_MARKER = fontB64(path.join(root, 'fonts', 'PermanentMarker.ttf'));

const W = 1200;
const H = 1800;

// Paleta oficial do Cascais
const C = {
  verdeEsc: '#0a2e18',
  verdeFundo: '#021008',
  verde: '#009662',
  verdeClaro: '#00d27f',
  verdeAura: '#00ff94',
  ouro: '#E3C04D',
  ouroClaro: '#fff099',
  branco: '#ffffff',
  preto: '#050a06',
};

const html = `<!DOCTYPE html>
<html lang="pt">
<head>
<meta charset="utf-8">
<style>
@font-face {
  font-family: 'DelaGothic';
  src: url('${FONT_DELA}') format('truetype');
}
@font-face {
  font-family: 'Bangers';
  src: url('${FONT_BANGERS}') format('truetype');
}
@font-face {
  font-family: 'Anton';
  src: url('${FONT_ANTON}') format('truetype');
}
@font-face {
  font-family: 'Marker';
  src: url('${FONT_MARKER}') format('truetype');
}

* { margin: 0; padding: 0; box-sizing: border-box; }
body {
  width: ${W}px;
  height: ${H}px;
  overflow: hidden;
  background: ${C.verdeFundo};
  position: relative;
  font-family: 'DelaGothic', sans-serif;
  color: ${C.branco};
  -webkit-font-smoothing: antialiased;
}

/* Fundo Manga com Meios-Tons (Halftone Screentone) e Linhas de Ação */
.manga-bg {
  position: absolute;
  inset: 0;
  background: 
    radial-gradient(circle at 50% 28%, #10522c 0%, #072b17 45%, #021108 80%, #010703 100%);
  z-index: 1;
}

.halftone {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(rgba(0, 210, 127, 0.15) 1.5px, transparent 1.5px);
  background-size: 13px 13px;
  opacity: 0.85;
  z-index: 2;
  mix-blend-mode: screen;
}

/* Speedlines Manga SVG */
.speedlines-svg {
  position: absolute;
  inset: 0;
  width: ${W}px;
  height: ${H}px;
  z-index: 3;
  pointer-events: none;
}

/* Efeito de Vinheta Manga */
.manga-vignette {
  position: absolute;
  inset: 0;
  box-shadow: 
    inset 0 0 160px rgba(0, 0, 0, 0.96),
    inset 0 0 50px rgba(0, 150, 98, 0.4);
  z-index: 4;
  pointer-events: none;
}

/* Moldura Manga */
.manga-border {
  position: absolute;
  inset: 18px;
  border: 4px solid ${C.ouro};
  outline: 3px solid #000;
  z-index: 50;
  pointer-events: none;
}
.manga-border-inner {
  position: absolute;
  inset: 26px;
  border: 1.5px dashed rgba(227, 192, 77, 0.55);
  z-index: 50;
  pointer-events: none;
}

.corner-label {
  position: absolute;
  background: #000;
  color: ${C.ouro};
  font-family: 'Anton';
  font-size: 15px;
  letter-spacing: 3px;
  padding: 4px 16px;
  border: 1.5px solid ${C.ouro};
  box-shadow: 2px 2px 0 #000;
  z-index: 52;
}
.cl-tl { top: 10px; left: 32px; }
.cl-tr { top: 10px; right: 32px; }

/* Content wrapper */
.content {
  position: relative;
  z-index: 10;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  padding: 46px 48px 42px;
}

/* 1. TOPO: Faixa da Competição */
.top-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.comp-badge {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  background: linear-gradient(90deg, transparent, #09371e 15%, #0f582f 50%, #09371e 85%, transparent);
  border-top: 3px solid ${C.ouro};
  border-bottom: 3px solid ${C.ouro};
  padding: 8px 48px;
  transform: skewX(-10deg);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7);
}
.comp-badge span {
  font-family: 'Anton', sans-serif;
  font-size: 28px;
  letter-spacing: 6px;
  color: ${C.ouroClaro};
  text-transform: uppercase;
  text-shadow: 0 2px 4px #000, 0 0 12px rgba(227, 192, 77, 0.8);
  transform: skewX(10deg);
}

.sub-tag {
  display: inline-block;
  background: ${C.ouro};
  color: ${C.preto};
  font-family: 'Anton';
  font-size: 22px;
  letter-spacing: 6px;
  padding: 3px 24px;
  border-radius: 4px;
  transform: rotate(-2deg);
  box-shadow: 3px 3px 0 #000;
  margin-top: 10px;
  margin-bottom: 4px;
  text-transform: uppercase;
}

/* TÍTULO HERO MANGA */
.main-title {
  font-family: 'Bangers', cursive;
  font-size: 116px;
  line-height: 0.95;
  letter-spacing: 5px;
  text-transform: uppercase;
  color: #ffffff;
  transform: rotate(-2deg);
  text-align: center;
  -webkit-text-stroke: 3px #000000;
  text-shadow: 
    0 0 22px rgba(0, 255, 148, 0.85),
    0 0 45px rgba(0, 200, 100, 0.5),
    5px 5px 0 #000000,
    -5px -5px 0 #000000,
    5px -5px 0 #000000,
    -5px 5px 0 #000000,
    0 10px 0 ${C.verdeEsc},
    0 16px 0 #000000,
    0 24px 30px rgba(0, 0, 0, 0.95);
  margin-top: 2px;
}

/* 2. CONFRONTO: GDS CASCAIS vs AFD TORRE */
.matchup-container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 1080px;
  margin-top: 6px;
  margin-bottom: 6px;
  position: relative;
  padding: 0 20px;
}

/* Equipa da Casa (Cascais - DESTAQUE SUPREMO) */
.team-home {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  text-align: center;
}

.home-aura {
  position: absolute;
  width: 360px;
  height: 360px;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  background: radial-gradient(circle, rgba(227, 192, 77, 0.65) 0%, rgba(0, 150, 98, 0.55) 45%, transparent 70%);
  filter: blur(18px);
  z-index: 1;
}

.home-crest-wrap {
  position: relative;
  z-index: 2;
  filter: drop-shadow(0 0 28px rgba(227, 192, 77, 0.95)) drop-shadow(0 14px 22px rgba(0, 0, 0, 0.95));
}
.home-crest-wrap img {
  height: 250px;
  object-fit: contain;
}

.team-name-home {
  font-family: 'DelaGothic', sans-serif;
  font-size: 42px;
  color: #fff;
  letter-spacing: 2px;
  margin-top: 10px;
  text-shadow: 
    3px 3px 0 #000,
    -3px -3px 0 #000,
    3px -3px 0 #000,
    -3px 3px 0 #000,
    0 0 22px rgba(0, 210, 127, 0.85);
  z-index: 2;
}

/* VS Manga Impact */
.vs-wrap {
  width: 150px;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  z-index: 5;
  margin: 0 10px;
}
.vs-spark {
  position: absolute;
  width: 140px;
  height: 140px;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.95) 0%, rgba(227, 192, 77, 0.7) 40%, transparent 70%);
  filter: blur(10px);
}
.vs-text {
  font-family: 'Bangers', cursive;
  font-size: 108px;
  color: #ffffff;
  transform: rotate(-6deg);
  line-height: 1;
  -webkit-text-stroke: 3px #000;
  text-shadow: 
    0 0 15px rgba(255, 220, 100, 0.9),
    4px 4px 0 #000,
    -4px -4px 0 #000,
    0 8px 0 ${C.ouro},
    0 14px 20px rgba(0, 0, 0, 0.95);
  position: relative;
}
.vs-manga-lightning {
  font-family: 'Anton';
  font-size: 15px;
  letter-spacing: 4px;
  color: ${C.ouro};
  background: #000;
  padding: 3px 12px;
  border: 1.5px solid ${C.ouro};
  transform: rotate(3deg);
  margin-top: -6px;
  box-shadow: 2px 2px 0 #000;
}

/* Equipa Visitante (AFD Torre) */
.team-away {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  text-align: center;
}
.away-crest-wrap {
  position: relative;
  z-index: 2;
  filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.9));
}
.away-crest-wrap img {
  height: 205px;
  object-fit: contain;
}
.team-name-away {
  font-family: 'DelaGothic', sans-serif;
  font-size: 36px;
  color: #f0f0f0;
  letter-spacing: 2px;
  margin-top: 14px;
  text-shadow: 
    3px 3px 0 #000,
    -3px -3px 0 #000,
    3px -3px 0 #000,
    -3px 3px 0 #000;
  z-index: 2;
}
.away-sub {
  font-family: 'Anton';
  font-size: 16px;
  color: #ccc;
  letter-spacing: 2px;
  margin-top: 4px;
}

/* 3. PAINEL CENTRAL MANGA: BANCADA CENTRAL (DESTAQUE MÁXIMO E LIMPO) */
.manga-panel-stand {
  width: 100%;
  max-width: 1080px;
  margin: 6px 0;
  position: relative;
  background: #000;
  border: 5px solid ${C.ouro};
  box-shadow: 
    0 0 0 4px #000,
    0 12px 35px rgba(0, 0, 0, 0.95),
    0 0 40px rgba(0, 150, 98, 0.45);
  clip-path: polygon(0 1.5%, 100% 0, 100% 98.5%, 0 100%);
}

.stand-img-box {
  width: 100%;
  height: 500px;
  position: relative;
  overflow: hidden;
}
.stand-img-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center 30%;
  filter: contrast(1.12) brightness(1.02);
}

/* 4. BARRA TÁTICA DE INFORMAÇÕES (DATA, HORA, LOCAL) */
.manga-info-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  width: 100%;
  max-width: 1080px;
  margin: 8px 0;
  background: linear-gradient(90deg, #021208 0%, #08321a 50%, #021208 100%);
  border-top: 3.5px solid ${C.ouro};
  border-bottom: 3.5px solid ${C.ouro};
  padding: 18px 24px;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.85);
  position: relative;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 16px;
}
.info-icon {
  width: 54px;
  height: 54px;
  background: ${C.verde};
  border: 2.5px solid ${C.ouro};
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 3px 3px 0 #000;
  transform: rotate(-3deg);
}
.info-icon svg {
  width: 32px;
  height: 32px;
  fill: #fff;
}
.info-text-group {
  display: flex;
  flex-direction: column;
}
.info-sub {
  font-family: 'Anton';
  font-size: 15px;
  letter-spacing: 3px;
  color: ${C.ouro};
  text-transform: uppercase;
}
.info-main {
  font-family: 'Anton';
  font-size: 34px;
  letter-spacing: 2px;
  color: #fff;
  line-height: 1.1;
  text-shadow: 0 2px 4px #000;
}
.info-highlight {
  font-family: 'Bangers';
  font-size: 54px;
  letter-spacing: 3px;
  color: ${C.ouroClaro};
  line-height: 1;
  text-shadow: 3px 3px 0 #000;
}

.info-divider {
  width: 3.5px;
  height: 64px;
  background: linear-gradient(180deg, transparent, ${C.ouro}, transparent);
}

/* 5. INVOCAÇÃO AOS ADEPTOS (1915 CENTENÁRIO) */
.manga-cta-section {
  width: 100%;
  max-width: 1080px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  position: relative;
  margin-top: 6px;
  margin-bottom: 4px;
}

.cta-hero-text {
  font-family: 'Marker', cursive;
  font-size: 92px;
  line-height: 1.05;
  color: #ffffff;
  transform: rotate(-1.5deg);
  -webkit-text-stroke: 2.5px #000;
  text-shadow: 
    0 0 24px rgba(0, 255, 148, 0.9),
    4px 4px 0 #000,
    -4px -4px 0 #000,
    4px -4px 0 #000,
    -4px 4px 0 #000,
    0 8px 0 ${C.verdeEsc},
    0 16px 28px rgba(0, 0, 0, 0.95);
  margin-bottom: 8px;
}

.cta-history-badge {
  display: inline-flex;
  align-items: center;
  gap: 14px;
  background: ${C.verde};
  border: 3.5px solid ${C.ouro};
  border-radius: 8px;
  padding: 10px 40px;
  margin-top: 6px;
  box-shadow: 5px 5px 0 #000;
}
.cta-history-badge span {
  font-family: 'Anton', sans-serif;
  font-size: 26px;
  letter-spacing: 4px;
  color: #fff;
  text-transform: uppercase;
}
.cta-history-badge strong {
  color: ${C.ouroClaro};
  font-size: 32px;
  text-shadow: 1px 1px 0 #000;
}

.cta-quote {
  font-family: 'Anton', sans-serif;
  font-size: 20px;
  letter-spacing: 3px;
  color: ${C.ouroClaro};
  margin-top: 10px;
  text-transform: uppercase;
  text-shadow: 0 2px 4px #000;
}

</style>
</head>
<body>

<!-- Fundos Manga -->
<div class="manga-bg"></div>
<div class="halftone"></div>
<div class="manga-vignette"></div>

<!-- Speedlines Manga SVG de Fundo -->
<svg class="speedlines-svg" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="sp-fade" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#fff" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0.85"/>
    </radialGradient>
    <mask id="sp-mask">
      <rect width="${W}" height="${H}" fill="url(#sp-fade)"/>
    </mask>
  </defs>
  <g mask="url(#sp-mask)" stroke="${C.verdeClaro}" stroke-width="2" opacity="0.45">
    ${Array.from({ length: 96 }, (_, i) => {
      const angle = (i * 3.75 * Math.PI) / 180;
      const x1 = W / 2 + Math.cos(angle) * 180;
      const y1 = H * 0.44 + Math.sin(angle) * 180;
      const x2 = W / 2 + Math.cos(angle) * 1150;
      const y2 = H * 0.44 + Math.sin(angle) * 1150;
      return `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" />`;
    }).join('\n    ')}
  </g>
</svg>

<!-- Moldura Estilo Manga -->
<div class="manga-border"></div>
<div class="manga-border-inner"></div>
<div class="corner-label cl-tl">GDS CASCAIS · 1915</div>
<div class="corner-label cl-tr">LIGA SIDELINE +35</div>

<!-- Conteúdo Principal -->
<div class="content">

  <!-- 1. TOPO: JORNADA, LIGA E TÍTULO -->
  <div class="top-header">
    <div class="comp-badge">
      <span>★ 2ª JORNADA · LIGA SIDELINE +35 ★</span>
    </div>
    <div class="sub-tag">ESCALÃO DE VETERANOS</div>
    <h1 class="main-title">FUTEBOL DE VETERANOS</h1>
  </div>

  <!-- 2. CONFRONTO: GDS CASCAIS vs AFD TORRE -->
  <div class="matchup-container">
    <!-- CASA: CASCAIS -->
    <div class="team-home">
      <div class="home-aura"></div>
      <div class="home-crest-wrap">
        <img src="${CREST_CSC}" alt="GDS Cascais">
      </div>
      <div class="team-name-home">GDS CASCAIS</div>
    </div>

    <!-- VS CENTRAL MANGA -->
    <div class="vs-wrap">
      <div class="vs-spark"></div>
      <div class="vs-text">VS</div>
    </div>

    <!-- VISITANTE: AFD TORRE -->
    <div class="team-away">
      <div class="away-crest-wrap">
        <img src="${CREST_TORRE}" alt="AFD Torre">
      </div>
      <div class="team-name-away">AFD TORRE</div>
      <div class="away-sub">ASSOCIAÇÃO FAMILIAR E DESPORTIVA</div>
    </div>
  </div>

  <!-- 3. PAINEL CENTRAL MANGA: BANCADA CENTRAL (LIMPO E EM DESTAQUE) -->
  <div class="manga-panel-stand">
    <div class="stand-img-box">
      <img src="${MANGA_BANCADA}" alt="Bancada Central do Cascais">
    </div>
  </div>

  <!-- 4. BARRA TÁTICA DE INFORMAÇÕES -->
  <div class="manga-info-bar">
    <!-- DATA -->
    <div class="info-item">
      <div class="info-icon">
        <svg viewBox="0 0 24 24"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>
      </div>
      <div class="info-text-group">
        <span class="info-sub">DATA DO JOGO</span>
        <span class="info-main">DOMINGO, 18 OUT</span>
      </div>
    </div>

    <div class="info-divider"></div>

    <!-- HORA -->
    <div class="info-item">
      <div class="info-icon">
        <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
      </div>
      <div class="info-text-group">
        <span class="info-sub">HORÁRIO</span>
        <span class="info-highlight">18H00</span>
      </div>
    </div>

    <div class="info-divider"></div>

    <!-- LOCAL -->
    <div class="info-item">
      <div class="info-icon">
        <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
      </div>
      <div class="info-text-group">
        <span class="info-sub">LOCAL DO ENCONTRO</span>
        <span class="info-main">CAMPO DO CASCAIS</span>
      </div>
    </div>
  </div>

  <!-- 5. INVOCAÇÃO AOS ADEPTOS (1915 CENTENÁRIO) -->
  <div class="manga-cta-section">
    <div class="cta-hero-text">VEM APOIAR O CASCAIS!</div>

    <div class="cta-history-badge">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="${C.ouro}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
      <span>FUNDADO EM <strong>1915</strong> · MAIS DE UM SÉCULO DE HISTÓRIA E PAIXÃO!</span>
    </div>

    <div class="cta-quote">"O TEU CLUBE DE SEMPRE · A TUA VOZ FAZ A DIFERENÇA!"</div>
  </div>

</div>

</body>
</html>`;

fs.writeFileSync(path.join(dir, 'cartaz_manga.html'), html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(600);

const outPng = path.join(dir, 'cartaz_cascais_manga_veteranos.png');
const outJpgRoot = path.join(root, 'cartaz_cascais_manga_veteranos.jpg');

await page.screenshot({ path: outPng });
await page.screenshot({ path: outJpgRoot, quality: 96, type: 'jpeg' });
await browser.close();

console.log('SUCCESS: Generated updated clean poster at:', outJpgRoot);
