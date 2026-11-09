import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const b64 = (p) => {
  if (!fs.existsSync(p)) return '';
  const ext = path.extname(p).replace('.', '').toLowerCase();
  const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${fs.readFileSync(p).toString('base64')}`;
};

const CREST_CASCAIS = b64('cartazes/crest_cascais.png');
const CREST_AMORA = b64('public/emblemas/amora.png');

const players = JSON.parse(fs.readFileSync('scripts/players_with_local_photos.json', 'utf8'));

// Attach base64 photos
players.forEach(p => {
  if (p.local_photo && fs.existsSync(p.local_photo)) {
    p.b64_photo = b64(p.local_photo);
  }
});

const outDir = 'scripts/individual_slides';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Common CSS styling
const CSS_COMMON = `
@import url('https://fonts.googleapis.com/css2?family=Anton&family=Bebas+Neue&family=Montserrat:ital,wght@0,400;0,700;0,800;0,900;1,900&display=swap');

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 1080px;
  height: 1920px;
  overflow: hidden;
  background-color: #020603;
  background-image: 
    radial-gradient(circle at 50% 12%, rgba(0, 200, 125, 0.45) 0%, transparent 65%),
    radial-gradient(circle at 50% 88%, rgba(227, 192, 77, 0.28) 0%, transparent 60%),
    linear-gradient(180deg, #010402 0%, #06180b 45%, #010402 100%);
  font-family: 'Montserrat', sans-serif;
  color: #ffffff;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.bg-vignette {
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 160px rgba(0,0,0,0.95);
  pointer-events: none;
  z-index: 2;
}

.bg-lines {
  position: absolute;
  inset: 0;
  background-image: 
    radial-gradient(rgba(227, 192, 77, 0.15) 1.5px, transparent 1.5px),
    repeating-linear-gradient(45deg, rgba(255,255,255,0.018) 0px, rgba(255,255,255,0.018) 2px, transparent 2px, transparent 36px);
  background-size: 32px 32px, 100% 100%;
  pointer-events: none;
  z-index: 1;
}

.top-bar {
  padding: 70px 60px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 10;
}

.comp-pill {
  background: rgba(0, 150, 98, 0.3);
  border: 2px solid #00D68B;
  color: #FFF099;
  padding: 12px 32px;
  border-radius: 40px;
  font-family: 'Bebas Neue', sans-serif;
  font-size: 36px;
  letter-spacing: 3px;
  text-transform: uppercase;
  display: inline-flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 0 30px rgba(0, 214, 139, 0.45);
}

.club-mini {
  display: flex;
  align-items: center;
  gap: 16px;
}
.club-mini img {
  width: 64px;
  height: 64px;
  object-fit: contain;
  filter: drop-shadow(0 0 15px rgba(227, 192, 77, 0.8));
}
.club-mini span {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 40px;
  letter-spacing: 2px;
  color: #E3C04D;
}

.bottom-bar {
  padding: 35px 60px 60px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid rgba(227, 192, 77, 0.3);
  background: rgba(2, 7, 4, 0.9);
  backdrop-filter: blur(14px);
  z-index: 10;
}

.bottom-bar .info-tag {
  font-family: 'Bebas Neue', sans-serif;
  font-size: 32px;
  letter-spacing: 3px;
  color: #9cbca7;
}

.bottom-bar .social-tag {
  font-family: 'Montserrat', sans-serif;
  font-weight: 900;
  font-size: 26px;
  color: #E3C04D;
  letter-spacing: 2px;
  text-shadow: 0 0 15px rgba(227, 192, 77, 0.6);
}

.gold-text {
  background: linear-gradient(180deg, #FFFFFF 0%, #FFF4B0 25%, #E3C04D 65%, #9E7A13 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  filter: drop-shadow(0 0 20px rgba(227, 192, 77, 0.5));
}

.green-text {
  color: #00FF9D;
  text-shadow: 0 0 25px rgba(0, 255, 157, 0.6);
}
`;

function getSlide1Html() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS_COMMON}
    .main-content {
      padding: 0 50px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      flex: 1;
      text-align: center;
      z-index: 5;
    }
    .matchday-title {
      font-family: 'Anton', sans-serif;
      font-size: 125px;
      line-height: 0.9;
      letter-spacing: 6px;
      text-transform: uppercase;
      margin-bottom: 25px;
    }
    .matchday-sub {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 44px;
      letter-spacing: 7px;
      color: #E3C04D;
      margin-bottom: 55px;
      background: rgba(227, 192, 77, 0.15);
      padding: 10px 40px;
      border-radius: 40px;
      border: 1px solid rgba(227, 192, 77, 0.4);
      box-shadow: 0 0 30px rgba(227, 192, 77, 0.3);
    }
    .versus-container {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: space-around;
      position: relative;
      margin-bottom: 55px;
    }
    .team-box {
      width: 390px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .team-crest-wrap {
      width: 270px;
      height: 270px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;
      margin-bottom: 25px;
    }
    .team-crest-wrap .glow {
      position: absolute;
      width: 320px;
      height: 320px;
      border-radius: 50%;
      filter: blur(50px);
      z-index: 1;
    }
    .glow-amora { background: rgba(0, 102, 204, 0.7); }
    .glow-cascais { background: rgba(0, 200, 120, 0.8); }
    .team-crest-wrap img {
      width: 230px;
      height: 230px;
      object-fit: contain;
      position: relative;
      z-index: 2;
      filter: drop-shadow(0 15px 35px rgba(0,0,0,0.95));
    }
    .team-name {
      font-family: 'Anton', sans-serif;
      font-size: 54px;
      letter-spacing: 2px;
      text-transform: uppercase;
    }
    .team-role {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 30px;
      letter-spacing: 5px;
      color: #9cbca4;
      margin-top: 6px;
    }
    .vs-badge {
      font-family: 'Anton', sans-serif;
      font-size: 90px;
      color: #ffffff;
      background: linear-gradient(135deg, #009662, #0f4023);
      border: 4px solid #E3C04D;
      width: 150px;
      height: 150px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 0 45px rgba(227, 192, 77, 0.7);
      transform: rotate(-6deg);
    }
    .details-card {
      width: 100%;
      background: rgba(8, 24, 15, 0.92);
      border: 2px solid rgba(227, 192, 77, 0.5);
      border-radius: 28px;
      padding: 38px 45px;
      display: flex;
      flex-direction: column;
      gap: 22px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.8), 0 0 30px rgba(0, 150, 98, 0.3);
      backdrop-filter: blur(16px);
    }
    .detail-row {
      display: flex;
      align-items: center;
      gap: 26px;
      text-align: left;
    }
    .detail-icon {
      width: 72px;
      height: 72px;
      border-radius: 20px;
      background: rgba(0, 150, 98, 0.3);
      border: 2px solid #00D68B;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 36px;
      flex-shrink: 0;
      color: #FFF099;
    }
    .detail-text .label {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 28px;
      letter-spacing: 2px;
      color: #9db2a5;
    }
    .detail-text .val {
      font-family: 'Anton', sans-serif;
      font-size: 42px;
      letter-spacing: 1px;
      color: #ffffff;
    }
  </style></head><body>
  <div class="bg-vignette"></div>
  <div class="bg-lines"></div>
  <div class="top-bar">
    <div class="comp-pill">★ LIGA MASTERS +35 • 4ª JORNADA</div>
    <div class="club-mini">
      <img src="${CREST_CASCAIS}" />
      <span>VETERANOS</span>
    </div>
  </div>

  <div class="main-content">
    <div class="matchday-title gold-text">PRÓXIMO JOGO</div>
    <div class="matchday-sub">SÁBADO • 7 DE NOVEMBRO 2026</div>

    <div class="versus-container">
      <div class="team-box">
        <div class="team-crest-wrap">
          <div class="glow glow-amora"></div>
          <img src="${CREST_AMORA}" />
        </div>
        <div class="team-name">AMORA FC</div>
        <div class="team-role">VISITADO</div>
      </div>

      <div class="vs-badge">VS</div>

      <div class="team-box">
        <div class="team-crest-wrap">
          <div class="glow glow-cascais"></div>
          <img src="${CREST_CASCAIS}" />
        </div>
        <div class="team-name green-text">GDS CASCAIS</div>
        <div class="team-role">VISITANTE</div>
      </div>
    </div>

    <div class="details-card">
      <div class="detail-row">
        <div class="detail-icon">⏰</div>
        <div class="detail-text">
          <div class="label">HORÁRIO DO JOGO</div>
          <div class="val">19:30 <span style="font-size:24px; color:#E3C04D; font-family:'Montserrat'">(Concentração 18:00)</span></div>
        </div>
      </div>
      <div class="detail-row">
        <div class="detail-icon">📍</div>
        <div class="detail-text">
          <div class="label">ESTÁDIO / LOCAL</div>
          <div class="val">Estádio da Medideira – Campo Nº 2 • Amora</div>
        </div>
      </div>
    </div>
  </div>

  <div class="bottom-bar">
    <div class="info-tag">GDS CASCAIS VETERANOS • ÉPOCA 2026/27</div>
    <div class="social-tag">#FORÇACASCAIS</div>
  </div>
  </body></html>`;
}

function getSlideTitleHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS_COMMON}
    .intro-box {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0 50px;
      z-index: 5;
    }
    .badge-17 {
      width: 250px;
      height: 250px;
      border-radius: 50%;
      background: linear-gradient(135deg, #009662, #042516);
      border: 6px solid #E3C04D;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: 'Anton', sans-serif;
      font-size: 145px;
      color: #FFF4BD;
      box-shadow: 0 0 80px rgba(227, 192, 77, 0.65), 0 25px 50px rgba(0,0,0,0.9);
      margin-bottom: 45px;
    }
    .title-main {
      font-family: 'Anton', sans-serif;
      font-size: 125px;
      line-height: 0.95;
      letter-spacing: 5px;
      text-transform: uppercase;
      margin-bottom: 25px;
    }
    .subtitle {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 55px;
      letter-spacing: 8px;
      color: #ffffff;
      margin-bottom: 55px;
    }
    .clash-pill {
      background: rgba(0, 150, 98, 0.25);
      border: 2px solid #E3C04D;
      padding: 20px 48px;
      border-radius: 50px;
      font-family: 'Anton', sans-serif;
      font-size: 44px;
      letter-spacing: 3px;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 24px;
      box-shadow: 0 15px 40px rgba(0,0,0,0.7), 0 0 30px rgba(227, 192, 77, 0.35);
    }
    .clash-pill img {
      width: 52px;
      height: 52px;
      object-fit: contain;
    }
  </style></head><body>
  <div class="bg-vignette"></div>
  <div class="bg-lines"></div>
  <div class="top-bar">
    <div class="comp-pill">★ LIGA MASTERS +35</div>
    <div class="club-mini">
      <img src="${CREST_CASCAIS}" />
      <span>VETERANOS</span>
    </div>
  </div>

  <div class="intro-box">
    <div class="badge-17">17</div>
    <div class="title-main gold-text">CONVOCATÓRIA<br/>OFICIAL</div>
    <div class="subtitle">17 ATLETAS CONVOCADOS</div>
    
    <div class="clash-pill">
      <img src="${CREST_AMORA}" />
      <span>AMORA FC vs GDS CASCAIS</span>
      <img src="${CREST_CASCAIS}" />
    </div>
  </div>

  <div class="bottom-bar">
    <div class="info-tag">SÁBADO • 19:30 • CAMPO DA MEDIDEIRA</div>
    <div class="social-tag">#VAMOSCASCAIS</div>
  </div>
  </body></html>`;
}

// INDIVIDUAL PLAYER CARD
function getPlayerCardHtml(player, isDrop) {
  const name = player.shirt_name || player.nickname || player.name;
  const num = player.jersey_number || '•';
  const pos = player.position ? player.position.split(',')[0].toUpperCase() : 'ATLETA';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS_COMMON}
    ${isDrop ? `
      body {
        background-image: 
          radial-gradient(circle at 50% 20%, rgba(0, 255, 157, 0.6) 0%, transparent 65%),
          radial-gradient(circle at 50% 85%, rgba(227, 192, 77, 0.4) 0%, transparent 60%),
          linear-gradient(180deg, #010603 0%, #082813 50%, #010603 100%);
      }
    ` : ''}
    .card-wrap {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 0 50px;
      z-index: 5;
    }
    .hero-card {
      width: 820px;
      background: linear-gradient(180deg, rgba(14, 44, 28, 0.96) 0%, rgba(3, 14, 7, 0.98) 100%);
      border: 4px solid ${isDrop ? '#00FF9D' : '#E3C04D'};
      border-radius: 44px;
      padding: 50px 40px 55px;
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      box-shadow: 0 0 80px ${isDrop ? 'rgba(0, 255, 157, 0.55)' : 'rgba(0, 150, 98, 0.45)'}, 0 30px 70px rgba(0,0,0,0.9);
    }
    .number-tag {
      position: absolute;
      top: -46px;
      left: 50%;
      transform: translateX(-50%);
      background: ${isDrop ? '#00D68B' : '#009662'};
      border: 4px solid #E3C04D;
      color: #ffffff;
      font-family: 'Anton', sans-serif;
      font-size: 70px;
      min-width: 120px;
      height: 120px;
      border-radius: 60px;
      padding: 0 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 10px 30px rgba(0,0,0,0.8), 0 0 30px rgba(227, 192, 77, 0.6);
      z-index: 5;
    }
    .photo-frame {
      width: 540px;
      height: 660px;
      border-radius: 32px;
      overflow: hidden;
      margin-top: 38px;
      margin-bottom: 35px;
      border: 3px solid rgba(255,255,255,0.3);
      box-shadow: 0 20px 50px rgba(0,0,0,0.9);
      background: #111;
      position: relative;
    }
    .photo-frame img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
    }
    .player-name-big {
      font-family: 'Anton', sans-serif;
      font-size: 88px;
      letter-spacing: 4px;
      text-transform: uppercase;
      margin-bottom: 12px;
      text-align: center;
      line-height: 1;
    }
    .pos-pill {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 40px;
      letter-spacing: 5px;
      color: ${isDrop ? '#00FF9D' : '#E3C04D'};
      background: rgba(0, 0, 0, 0.4);
      padding: 6px 36px;
      border-radius: 30px;
      border: 1px solid ${isDrop ? 'rgba(0, 255, 157, 0.4)' : 'rgba(227, 192, 77, 0.4)'};
      display: inline-block;
    }
  </style></head><body>
  <div class="bg-vignette"></div>
  <div class="bg-lines"></div>
  <div class="top-bar">
    <div class="comp-pill">★ CONVOCADO CSC</div>
    <div class="club-mini">
      <img src="${CREST_CASCAIS}" />
      <span>VETERANOS</span>
    </div>
  </div>

  <div class="card-wrap">
    <div class="hero-card">
      <div class="number-tag">#${num}</div>
      <div class="photo-frame">
        <img src="${player.b64_photo || ''}" />
      </div>
      <div class="player-name-big ${isDrop ? 'green-text' : 'gold-text'}">${name}</div>
      <div class="pos-pill">${pos}</div>
    </div>
  </div>

  <div class="bottom-bar">
    <div class="info-tag">AMORA FC vs GDS CASCAIS</div>
    <div class="social-tag">#FORÇACASCAIS</div>
  </div>
  </body></html>`;
}

function getSlideAllHtml(allPlayers) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS_COMMON}
    .full-header {
      text-align: center;
      margin-top: 5px;
      margin-bottom: 20px;
      z-index: 5;
    }
    .full-title {
      font-family: 'Anton', sans-serif;
      font-size: 70px;
      letter-spacing: 3px;
      text-transform: uppercase;
    }
    .full-sub {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 32px;
      letter-spacing: 5px;
      color: #E3C04D;
    }
    .roster-grid {
      flex: 1;
      padding: 0 45px;
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px 14px;
      align-content: center;
      z-index: 5;
    }
    .mini-card {
      background: rgba(14, 38, 26, 0.92);
      border: 1px solid rgba(227, 192, 77, 0.45);
      border-radius: 18px;
      padding: 10px;
      display: flex;
      align-items: center;
      gap: 12px;
      box-shadow: 0 5px 20px rgba(0,0,0,0.6);
    }
    .mini-photo {
      width: 62px;
      height: 74px;
      border-radius: 12px;
      overflow: hidden;
      border: 1.5px solid #00D68B;
      background: #111;
      flex-shrink: 0;
    }
    .mini-photo img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
    }
    .mini-info {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .mini-num {
      font-family: 'Anton', sans-serif;
      font-size: 24px;
      color: #E3C04D;
      line-height: 1;
    }
    .mini-name {
      font-family: 'Anton', sans-serif;
      font-size: 22px;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #ffffff;
      margin-top: 2px;
    }
    .mini-pos {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 16px;
      letter-spacing: 1px;
      color: #8bb397;
    }
  </style></head><body>
  <div class="bg-vignette"></div>
  <div class="bg-lines"></div>
  <div class="top-bar">
    <div class="comp-pill">★ 17 CONVOCADOS</div>
    <div class="club-mini">
      <img src="${CREST_CASCAIS}" />
      <span>VETERANOS</span>
    </div>
  </div>

  <div class="full-header">
    <div class="full-title gold-text">PLANTEL CONVOCADO</div>
    <div class="full-sub">LIGA MASTERS +35 • 4ª JORNADA</div>
  </div>

  <div class="roster-grid">
    ${allPlayers.map(p => `
      <div class="mini-card">
        <div class="mini-photo">
          <img src="${p.b64_photo || ''}" />
        </div>
        <div class="mini-info">
          <div class="mini-num">#${p.jersey_number || '•'}</div>
          <div class="mini-name">${p.shirt_name || p.nickname || p.name}</div>
          <div class="mini-pos">${p.position.split(',')[0]}</div>
        </div>
      </div>
    `).join('')}
  </div>

  <div class="bottom-bar">
    <div class="info-tag">SÁBADO 19:30 • ESTÁDIO DA MEDIDEIRA</div>
    <div class="social-tag">#FORÇACASCAIS</div>
  </div>
  </body></html>`;
}

function getSlideOutroHtml() {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS_COMMON}
    .outro-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 0 50px;
      z-index: 5;
    }
    .big-crest {
      width: 360px;
      height: 360px;
      object-fit: contain;
      filter: drop-shadow(0 0 70px rgba(0, 255, 157, 0.85)) drop-shadow(0 25px 50px rgba(0,0,0,0.95));
      margin-bottom: 45px;
    }
    .call-title {
      font-family: 'Anton', sans-serif;
      font-size: 120px;
      line-height: 0.95;
      letter-spacing: 6px;
      text-transform: uppercase;
      margin-bottom: 25px;
    }
    .call-sub {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 55px;
      letter-spacing: 8px;
      color: #E3C04D;
      margin-bottom: 50px;
    }
    .match-recap-box {
      background: rgba(0, 150, 98, 0.25);
      border: 2px solid #E3C04D;
      border-radius: 32px;
      padding: 35px 55px;
      width: 100%;
      box-shadow: 0 20px 50px rgba(0,0,0,0.7), 0 0 35px rgba(227, 192, 77, 0.4);
      backdrop-filter: blur(16px);
    }
    .recap-vs {
      font-family: 'Anton', sans-serif;
      font-size: 50px;
      letter-spacing: 2px;
      color: #ffffff;
      margin-bottom: 12px;
    }
    .recap-date {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 38px;
      letter-spacing: 4px;
      color: #FFF4BD;
    }
    .recap-local {
      font-family: 'Montserrat', sans-serif;
      font-size: 22px;
      font-weight: 700;
      color: #a4c9b0;
      margin-top: 10px;
    }
  </style></head><body>
  <div class="bg-vignette"></div>
  <div class="bg-lines"></div>
  <div class="top-bar">
    <div class="comp-pill">★ JUNTOS SOMOS MAIS FORTES</div>
    <div class="club-mini">
      <img src="${CREST_CASCAIS}" />
      <span>VETERANOS</span>
    </div>
  </div>

  <div class="outro-content">
    <img class="big-crest" src="${CREST_CASCAIS}" />
    <div class="call-title gold-text">VAMOS<br/>CASCAIS!</div>
    <div class="call-sub">TODOS JUNTOS NESTA BATALHA</div>

    <div class="match-recap-box">
      <div class="recap-vs">AMORA FC vs GDS CASCAIS</div>
      <div class="recap-date">SÁBADO, 7 NOV • 19:30</div>
      <div class="recap-local">Estádio da Medideira (Campo 2) • Amora</div>
    </div>
  </div>

  <div class="bottom-bar">
    <div class="info-tag">GD SPORT CASCAIS • DESDE 1915</div>
    <div class="social-tag">#FORÇACASCAIS</div>
  </div>
  </body></html>`;
}

async function renderIndividualSlides() {
  // Order of the 17 players matching the audio cues
  const orderedJerseyNumbers = [
    1,   // Rocha
    4,   // PP
    12,  // Duarte
    17,  // Mariano
    22,  // Matuto
    59,  // Talisson
    13,  // Chaveiro
    16,  // J. Costa
    18,  // Natalino
    23,  // Marinho
    39,  // Argolo
    45,  // Albano
    63,  // Rios
    81,  // Chris
    88,  // Marcelo
    9,   // Gui
    82   // Borges
  ];

  const orderedPlayers = orderedJerseyNumbers.map(num => players.find(p => p.jersey_number === num)).filter(Boolean);

  const slides = [];

  // 1. Intro (0s to 4.8s -> duration 4.8s)
  slides.push({ name: 'scene_00_intro.png', html: getSlide1Html(), duration: 4.8 });

  // 2. Convocados title (4.8s to 7.0s -> duration 2.2s)
  slides.push({ name: 'scene_01_title.png', html: getSlideTitleHtml(), duration: 2.2 });

  // 3. 17 Individual player slides (7.0s to 34.2s, each 1.6s)
  orderedPlayers.forEach((p, idx) => {
    // Check if player is during the beat drop (starting at player 9/10 at ~20s)
    const isDrop = idx >= 8;
    const pad = String(idx + 1).padStart(2, '0');
    const filename = `player_${pad}_${(p.shirt_name || p.name).replace(/[^a-zA-Z0-9]/g, '_')}.png`;
    slides.push({
      name: filename,
      html: getPlayerCardHtml(p, isDrop),
      duration: 1.6,
      playerName: p.shirt_name || p.name,
      num: p.jersey_number
    });
  });

  // 4. Full roster (34.2s to 40.0s -> duration 5.8s)
  slides.push({ name: 'scene_19_full_roster.png', html: getSlideAllHtml(orderedPlayers), duration: 5.8 });

  // 5. Outro (40.0s to 49.29s -> duration 9.29s)
  slides.push({ name: 'scene_20_outro.png', html: getSlideOutroHtml(), duration: 9.29 });

  console.log(`Launching Playwright to render ${slides.length} slides...`);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1920 });

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    console.log(`[${i+1}/${slides.length}] Rendering ${s.name} (${s.duration}s)...`);
    await page.setContent(s.html, { waitUntil: 'load' });
    await page.waitForTimeout(400);
    const dest = path.join(outDir, s.name);
    await page.screenshot({ path: dest, type: 'png' });
    console.log(`✓ Saved ${dest}`);
  }

  await browser.close();
  console.log('All individual slides rendered successfully!');

  fs.writeFileSync('scripts/individual_slides_meta.json', JSON.stringify(slides.map(s => ({
    name: s.name,
    duration: s.duration,
    path: path.join(outDir, s.name),
    playerName: s.playerName
  })), null, 2));
}

renderIndividualSlides();
