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

const outDir = 'scripts/tiktok_frames';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Common TikTok Edit Styling
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
    radial-gradient(circle at 50% 10%, rgba(0, 180, 115, 0.45) 0%, transparent 60%),
    radial-gradient(circle at 50% 90%, rgba(227, 192, 77, 0.28) 0%, transparent 55%),
    linear-gradient(180deg, #010402 0%, #051409 50%, #010402 100%);
  font-family: 'Montserrat', sans-serif;
  color: #ffffff;
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

/* Viral edit background elements */
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

function getSlide2Html() {
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

function getSlideKeeperHtml(keeper) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS_COMMON}
    .sector-header {
      text-align: center;
      margin-top: 15px;
      margin-bottom: 25px;
      z-index: 5;
    }
    .sector-tag {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 34px;
      letter-spacing: 6px;
      color: #E3C04D;
      background: rgba(227, 192, 77, 0.15);
      padding: 8px 36px;
      border-radius: 35px;
      display: inline-block;
      border: 1px solid rgba(227, 192, 77, 0.4);
      margin-bottom: 12px;
    }
    .sector-title {
      font-family: 'Anton', sans-serif;
      font-size: 90px;
      letter-spacing: 4px;
      text-transform: uppercase;
    }
    .keeper-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 0 50px;
      z-index: 5;
    }
    .keeper-hero-card {
      width: 800px;
      background: linear-gradient(180deg, rgba(14, 42, 28, 0.96) 0%, rgba(3, 14, 7, 0.98) 100%);
      border: 4px solid #E3C04D;
      border-radius: 42px;
      padding: 45px 40px 55px;
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      box-shadow: 0 0 80px rgba(0, 150, 98, 0.5), 0 30px 65px rgba(0,0,0,0.9);
    }
    .number-badge-large {
      position: absolute;
      top: -42px;
      left: 50%;
      transform: translateX(-50%);
      background: #009662;
      border: 4px solid #E3C04D;
      color: #ffffff;
      font-family: 'Anton', sans-serif;
      font-size: 68px;
      width: 115px;
      height: 115px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 30px rgba(0,0,0,0.75), 0 0 25px rgba(227, 192, 77, 0.5);
      z-index: 5;
    }
    .keeper-photo-frame {
      width: 520px;
      height: 640px;
      border-radius: 32px;
      overflow: hidden;
      margin-top: 35px;
      margin-bottom: 35px;
      border: 3px solid rgba(255,255,255,0.3);
      box-shadow: 0 15px 45px rgba(0,0,0,0.85);
      background: #111;
      position: relative;
    }
    .keeper-photo-frame img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
    }
    .keeper-name {
      font-family: 'Anton', sans-serif;
      font-size: 85px;
      letter-spacing: 3px;
      text-transform: uppercase;
      margin-bottom: 10px;
    }
    .keeper-pos {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 42px;
      letter-spacing: 5px;
      color: #E3C04D;
    }
  </style></head><body>
  <div class="bg-vignette"></div>
  <div class="bg-lines"></div>
  <div class="top-bar">
    <div class="comp-pill">★ CONVOCADOS CSC</div>
    <div class="club-mini">
      <img src="${CREST_CASCAIS}" />
      <span>VETERANOS</span>
    </div>
  </div>

  <div class="sector-header">
    <div class="sector-tag">SEGURANÇA ENTRE OS POSTES</div>
    <div class="sector-title gold-text">GUARDA-REDES</div>
  </div>

  <div class="keeper-content">
    <div class="keeper-hero-card">
      <div class="number-badge-large">#${keeper.jersey_number || 1}</div>
      <div class="keeper-photo-frame">
        <img src="${keeper.b64_photo}" />
      </div>
      <div class="keeper-name">${keeper.shirt_name || keeper.nickname || keeper.name}</div>
      <div class="keeper-pos">GUARDA-REDES</div>
    </div>
  </div>

  <div class="bottom-bar">
    <div class="info-tag">AMORA FC vs GDS CASCAIS</div>
    <div class="social-tag">#FORÇACASCAIS</div>
  </div>
  </body></html>`;
}

function getSlideSectorHtml(sectorTitle, sectorTag, playerList, isDrop) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS_COMMON}
    ${isDrop ? `
      body {
        background-image: 
          radial-gradient(circle at 50% 15%, rgba(0, 255, 157, 0.55) 0%, transparent 65%),
          radial-gradient(circle at 50% 85%, rgba(227, 192, 77, 0.35) 0%, transparent 60%),
          linear-gradient(180deg, #010603 0%, #072210 50%, #010603 100%);
      }
    ` : ''}
    .sector-header {
      text-align: center;
      margin-top: 15px;
      margin-bottom: 25px;
      z-index: 5;
    }
    .sector-tag {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 34px;
      letter-spacing: 5px;
      color: #E3C04D;
      background: rgba(227, 192, 77, 0.15);
      padding: 8px 34px;
      border-radius: 30px;
      display: inline-block;
      border: 1px solid rgba(227, 192, 77, 0.4);
      margin-bottom: 10px;
    }
    .sector-title {
      font-family: 'Anton', sans-serif;
      font-size: 85px;
      letter-spacing: 3px;
      text-transform: uppercase;
    }
    .grid-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: 0 45px;
      gap: 24px;
      z-index: 5;
    }
    .player-row {
      display: flex;
      justify-content: center;
      gap: 24px;
    }
    .player-card {
      width: 470px;
      background: linear-gradient(180deg, rgba(16, 44, 29, 0.95) 0%, rgba(5, 17, 10, 0.98) 100%);
      border: 2px solid ${isDrop ? '#00FF9D' : 'rgba(227, 192, 77, 0.45)'};
      border-radius: 26px;
      padding: 16px 20px;
      display: flex;
      align-items: center;
      gap: 20px;
      box-shadow: 0 12px 35px rgba(0,0,0,0.7), ${isDrop ? '0 0 25px rgba(0, 255, 157, 0.35)' : 'none'};
    }
    .photo-thumb {
      width: 145px;
      height: 165px;
      border-radius: 18px;
      overflow: hidden;
      border: 2px solid ${isDrop ? '#00FF9D' : '#009662'};
      background: #111;
      flex-shrink: 0;
    }
    .photo-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
    }
    .card-info {
      display: flex;
      flex-direction: column;
      justify-content: center;
      flex: 1;
      min-width: 0;
    }
    .card-num {
      font-family: 'Anton', sans-serif;
      font-size: 38px;
      color: #E3C04D;
      display: inline-block;
      margin-bottom: 2px;
    }
    .card-name {
      font-family: 'Anton', sans-serif;
      font-size: 40px;
      letter-spacing: 1px;
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #ffffff;
    }
    .card-pos {
      font-family: 'Montserrat', sans-serif;
      font-size: 17px;
      font-weight: 700;
      color: #7fa88d;
      margin-top: 4px;
      line-height: 1.2;
    }
  </style></head><body>
  <div class="bg-vignette"></div>
  <div class="bg-lines"></div>
  <div class="top-bar">
    <div class="comp-pill">★ CONVOCADOS CSC</div>
    <div class="club-mini">
      <img src="${CREST_CASCAIS}" />
      <span>VETERANOS</span>
    </div>
  </div>

  <div class="sector-header">
    <div class="sector-tag">${sectorTag}</div>
    <div class="sector-title ${isDrop ? 'green-text' : 'gold-text'}">${sectorTitle}</div>
  </div>

  <div class="grid-content">
    ${(() => {
      let rowsHtml = '';
      for (let i = 0; i < playerList.length; i += 2) {
        const chunk = playerList.slice(i, i + 2);
        rowsHtml += '<div class="player-row">';
        chunk.forEach(p => {
          rowsHtml += `
            <div class="player-card">
              <div class="photo-thumb">
                <img src="${p.b64_photo || ''}" />
              </div>
              <div class="card-info">
                <div class="card-num">#${p.jersey_number || '•'}</div>
                <div class="card-name">${p.shirt_name || p.nickname || p.name}</div>
                <div class="card-pos">${p.position.split(',')[0]}</div>
              </div>
            </div>
          `;
        });
        rowsHtml += '</div>';
      }
      return rowsHtml;
    })()}
  </div>

  <div class="bottom-bar">
    <div class="info-tag">AMORA FC vs GDS CASCAIS</div>
    <div class="social-tag">#FORÇACASCAIS</div>
  </div>
  </body></html>`;
}

function getSlideStrikersHtml(strikers) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS_COMMON}
    .sector-header {
      text-align: center;
      margin-top: 15px;
      margin-bottom: 30px;
      z-index: 5;
    }
    .sector-tag {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 34px;
      letter-spacing: 6px;
      color: #E3C04D;
      background: rgba(227, 192, 77, 0.15);
      padding: 8px 36px;
      border-radius: 30px;
      display: inline-block;
      border: 1px solid rgba(227, 192, 77, 0.4);
      margin-bottom: 12px;
    }
    .sector-title {
      font-family: 'Anton', sans-serif;
      font-size: 90px;
      letter-spacing: 4px;
      text-transform: uppercase;
    }
    .strikers-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 0 45px;
      gap: 40px;
      z-index: 5;
    }
    .striker-card {
      width: 100%;
      background: linear-gradient(180deg, rgba(16, 44, 29, 0.96) 0%, rgba(5, 17, 10, 0.98) 100%);
      border: 3px solid #E3C04D;
      border-radius: 32px;
      padding: 30px 40px;
      display: flex;
      align-items: center;
      gap: 35px;
      box-shadow: 0 15px 45px rgba(0,0,0,0.8), 0 0 30px rgba(227, 192, 77, 0.35);
    }
    .striker-thumb {
      width: 220px;
      height: 270px;
      border-radius: 24px;
      overflow: hidden;
      border: 3px solid #00D68B;
      background: #111;
      flex-shrink: 0;
    }
    .striker-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
    }
    .striker-info {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .striker-num {
      font-family: 'Anton', sans-serif;
      font-size: 60px;
      color: #E3C04D;
    }
    .striker-name {
      font-family: 'Anton', sans-serif;
      font-size: 72px;
      letter-spacing: 2px;
      text-transform: uppercase;
      line-height: 1;
      margin: 8px 0 14px;
    }
    .striker-pos {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 36px;
      letter-spacing: 3px;
      color: #00FF9D;
    }
  </style></head><body>
  <div class="bg-vignette"></div>
  <div class="bg-lines"></div>
  <div class="top-bar">
    <div class="comp-pill">★ CONVOCADOS CSC</div>
    <div class="club-mini">
      <img src="${CREST_CASCAIS}" />
      <span>VETERANOS</span>
    </div>
  </div>

  <div class="sector-header">
    <div class="sector-tag">GOLOS E DEFINIÇÃO</div>
    <div class="sector-title gold-text">AVANÇADOS</div>
  </div>

  <div class="strikers-content">
    ${strikers.map(s => `
      <div class="striker-card">
        <div class="striker-thumb">
          <img src="${s.b64_photo || ''}" />
        </div>
        <div class="striker-info">
          <div class="striker-num">#${s.jersey_number || '•'}</div>
          <div class="striker-name">${s.shirt_name || s.nickname || s.name}</div>
          <div class="striker-pos">${s.position.split(',')[0]}</div>
        </div>
      </div>
    `).join('')}
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

function getSlideSpineHtml(keyPlayers) {
  // 4 key pillars: Rocha (#1), PP (#4), Chris (#81), Gui (#9)
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${CSS_COMMON}
    .sector-header {
      text-align: center;
      margin-top: 15px;
      margin-bottom: 25px;
      z-index: 5;
    }
    .sector-tag {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 34px;
      letter-spacing: 6px;
      color: #00FF9D;
      background: rgba(0, 255, 157, 0.15);
      padding: 8px 36px;
      border-radius: 35px;
      display: inline-block;
      border: 1px solid rgba(0, 255, 157, 0.4);
      margin-bottom: 12px;
    }
    .sector-title {
      font-family: 'Anton', sans-serif;
      font-size: 85px;
      letter-spacing: 4px;
      text-transform: uppercase;
    }
    .spine-grid {
      flex: 1;
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 25px;
      padding: 0 50px;
      align-content: center;
      z-index: 5;
    }
    .spine-card {
      background: linear-gradient(180deg, rgba(16, 44, 29, 0.96) 0%, rgba(4, 15, 8, 0.98) 100%);
      border: 3px solid #E3C04D;
      border-radius: 28px;
      padding: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
      box-shadow: 0 15px 40px rgba(0,0,0,0.8), 0 0 25px rgba(227, 192, 77, 0.3);
    }
    .spine-thumb {
      width: 220px;
      height: 260px;
      border-radius: 20px;
      overflow: hidden;
      border: 2px solid #00D68B;
      background: #111;
      margin-bottom: 15px;
    }
    .spine-thumb img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
    }
    .spine-num {
      position: absolute;
      top: 10px;
      left: 15px;
      font-family: 'Anton', sans-serif;
      font-size: 42px;
      color: #E3C04D;
      text-shadow: 0 4px 10px rgba(0,0,0,0.8);
    }
    .spine-name {
      font-family: 'Anton', sans-serif;
      font-size: 42px;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: #ffffff;
    }
    .spine-pos {
      font-family: 'Bebas Neue', sans-serif;
      font-size: 26px;
      letter-spacing: 3px;
      color: #00FF9D;
      margin-top: 4px;
    }
  </style></head><body>
  <div class="bg-vignette"></div>
  <div class="bg-lines"></div>
  <div class="top-bar">
    <div class="comp-pill">★ LIDERANÇA EM CAMPO</div>
    <div class="club-mini">
      <img src="${CREST_CASCAIS}" />
      <span>VETERANOS</span>
    </div>
  </div>

  <div class="sector-header">
    <div class="sector-tag">A ESPINHA DORSAL</div>
    <div class="sector-title gold-text">RUMO À VITÓRIA</div>
  </div>

  <div class="spine-grid">
    ${keyPlayers.map(p => `
      <div class="spine-card">
        <div class="spine-num">#${p.jersey_number}</div>
        <div class="spine-thumb">
          <img src="${p.b64_photo || ''}" />
        </div>
        <div class="spine-name">${p.shirt_name || p.nickname || p.name}</div>
        <div class="spine-pos">${p.position.split(',')[0]}</div>
      </div>
    `).join('')}
  </div>

  <div class="bottom-bar">
    <div class="info-tag">AMORA FC vs GDS CASCAIS</div>
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

async function renderAllSlides() {
  const keeper = players.find(p => p.jersey_number === 1);
  const defenderIds = [4, 12, 17, 22, 59];
  const defenders = players.filter(p => defenderIds.includes(p.jersey_number));
  const midIds = [13, 16, 18, 23, 39, 45, 63, 81, 88];
  const midfielders = players.filter(p => midIds.includes(p.jersey_number));
  const strikerIds = [9, 82];
  const attackers = players.filter(p => strikerIds.includes(p.jersey_number));

  const mids1 = midfielders.slice(0, 5); // 5 mids
  const mids2 = midfielders.slice(5);    // 4 mids

  const tacticalSorted = [keeper, ...defenders, ...midfielders, ...attackers].filter(Boolean);

  // 4 spine players: Rocha (1), PP (4), Chris (81), Gui (9)
  const spine = [
    players.find(p => p.jersey_number === 1),
    players.find(p => p.jersey_number === 4),
    players.find(p => p.jersey_number === 81),
    players.find(p => p.jersey_number === 9)
  ].filter(Boolean);

  // Durations aligned to audio milestones:
  // Total: 4.5 + 3.5 + 4.0 + 4.5 + 3.5 + 5.0 (drop at 20.0s) + 5.0 + 6.0 + 6.0 + 7.29 = 49.29s
  const slides = [
    { name: 'tt_slide_01_intro.png', html: getSlide1Html(), duration: 4.5 },
    { name: 'tt_slide_02_convocatoria.png', html: getSlide2Html(), duration: 3.5 },
    { name: 'tt_slide_03_keeper.png', html: getSlideKeeperHtml(keeper), duration: 4.0 },
    { name: 'tt_slide_04_defenders.png', html: getSlideSectorHtml('DEFESAS', 'MURALHA AMARELA E VERDE', defenders, false), duration: 4.5 },
    { name: 'tt_slide_05_midfielders1.png', html: getSlideSectorHtml('MÉDIOS', 'CONTROLO & VISÃO (1/2)', mids1, false), duration: 3.5 },
    { name: 'tt_slide_06_midfielders2.png', html: getSlideSectorHtml('MÉDIOS', 'MAGIA & RITMO (2/2)', mids2, true), duration: 5.0 }, // THE DROP AT 20s!
    { name: 'tt_slide_07_attackers.png', html: getSlideStrikersHtml(attackers), duration: 5.0 },
    { name: 'tt_slide_08_full_roster.png', html: getSlideAllHtml(tacticalSorted), duration: 6.0 },
    { name: 'tt_slide_09_spine.png', html: getSlideSpineHtml(spine), duration: 6.0 },
    { name: 'tt_slide_10_outro.png', html: getSlideOutroHtml(), duration: 7.29 },
  ];

  console.log('Rendering 10 TikTok Edit scenes (1080x1920)...');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1080, height: 1920 });

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];
    console.log(`Rendering [${i+1}/${slides.length}] ${s.name} (${s.duration}s)...`);
    await page.setContent(s.html, { waitUntil: 'load' });
    await page.waitForTimeout(600);
    const dest = path.join(outDir, s.name);
    await page.screenshot({ path: dest, type: 'png' });
    console.log(`✓ Saved ${dest}`);
  }

  await browser.close();
  console.log('All 10 scenes rendered successfully!');

  fs.writeFileSync('scripts/tiktok_slides_meta.json', JSON.stringify(slides.map(s => ({
    name: s.name,
    duration: s.duration,
    path: path.join(outDir, s.name)
  })), null, 2));
}

renderAllSlides();
