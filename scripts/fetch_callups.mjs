import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const session = JSON.parse(fs.readFileSync('scripts/.active_session.json', 'utf8'));
const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => {
    const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
  })
);
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: 'Bearer ' + session.access_token } }
});

async function run() {
  const eventId = '16617b01-8989-4015-bace-32582fd7903b';
  const { data: callups, error } = await supabase
    .from('callups')
    .select(`
      id,
      event_id,
      player_id,
      status,
      notes,
      responded_at,
      player:profiles(
        id,
        name,
        nickname,
        shirt_name,
        jersey_number,
        position,
        photo_url,
        role,
        roles
      )
    `)
    .eq('event_id', eventId);

  console.log('Callups for match:', callups?.length, error);

  // Also fetch all profiles so we have everyone's info and photos
  const { data: profiles } = await supabase.from('profiles').select('*');
  console.log('Total profiles:', profiles?.length);

  fs.writeFileSync('scripts/callups_match.json', JSON.stringify({ callups, profiles }, null, 2));

  console.log('\n--- CONVOCADOS (status in callups) ---');
  for (const c of callups || []) {
    const p = c.player;
    console.log(`[${c.status}] #${p?.jersey_number ?? '-'} ${p?.shirt_name || p?.name} (${p?.position}) - photo: ${p?.photo_url}`);
  }
}
run();
