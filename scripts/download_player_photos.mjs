import fs from 'fs';
import path from 'path';

const data = JSON.parse(fs.readFileSync('scripts/callups_match.json', 'utf8'));
const outDir = 'scripts/player_photos';
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// Filter actual players (not supporters)
const players = data.callups
  .map(c => c.player)
  .filter(p => p && p.role !== 'supporter' && p.position);

console.log(`Found ${players.length} squad players called up:`);

async function downloadPhotos() {
  for (const p of players) {
    const name = (p.shirt_name || p.nickname || p.name).replace(/\s+/g, '_');
    const ext = p.photo_url ? path.extname(new URL(p.photo_url).pathname) || '.jpg' : '.jpg';
    const filename = `${p.jersey_number || '00'}_${name}${ext}`;
    const dest = path.join(outDir, filename);

    if (p.photo_url) {
      try {
        const res = await fetch(p.photo_url);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(dest, buffer);
          console.log(`✓ Saved ${filename} (${buffer.length} bytes)`);
          p.local_photo = dest;
        } else {
          console.log(`✗ Failed to download ${p.photo_url} (${res.status})`);
        }
      } catch (e) {
        console.log(`✗ Error downloading ${p.photo_url}: ${e.message}`);
      }
    } else {
      console.log(`- No photo for ${name}`);
    }
  }

  fs.writeFileSync('scripts/players_with_local_photos.json', JSON.stringify(players, null, 2));
}

downloadPhotos();
