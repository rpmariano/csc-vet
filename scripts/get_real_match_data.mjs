import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const session = JSON.parse(fs.readFileSync('scripts/.active_session.json', 'utf8'));
const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8')
    .split('\n')
    .filter(line => line.includes('='))
    .map(line => {
      const idx = line.indexOf('=');
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()];
    })
);

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
  global: {
    headers: {
      Authorization: `Bearer ${session.access_token}`
    }
  }
});

async function main() {
  const now = new Date().toISOString();
  console.log('Current time:', now);

  // 1. Fetch upcoming match
  const { data: events, error: errEvents } = await supabase
    .from('events')
    .select(`
      id,
      title,
      type,
      date_time,
      meeting_time,
      location,
      home_away,
      is_friendly,
      field:fields(*),
      opponent:opponents(*),
      tournament:tournaments(*)
    `)
    .gte('date_time', '2026-11-01T00:00:00')
    .eq('type', 'match')
    .order('date_time', { ascending: true });

  console.log('Matches found:', events?.length, 'Error:', errEvents);
  if (!events || events.length === 0) {
    console.log('No matches after 2026-11-01, checking all upcoming matches:');
    const { data: allMatches } = await supabase
      .from('events')
      .select('*, field:fields(*), opponent:opponents(*)')
      .eq('type', 'match')
      .order('date_time', { ascending: true });
    console.log('All matches count:', allMatches?.length);
    allMatches?.slice(-5).forEach(m => console.log(m.id, m.date_time, m.title));
    return;
  }

  const nextMatch = events[0];
  console.log('\n=== NEXT MATCH ===');
  console.log('ID:', nextMatch.id);
  console.log('Title:', nextMatch.title);
  console.log('Date:', nextMatch.date_time);
  console.log('Meeting Time:', nextMatch.meeting_time);
  console.log('Location:', nextMatch.location);
  console.log('Field:', nextMatch.field);
  console.log('Opponent:', nextMatch.opponent);
  console.log('Tournament:', nextMatch.tournament);
  console.log('Home/Away:', nextMatch.home_away);

  // 2. Fetch callups for this match
  const { data: callups, error: errCallups } = await supabase
    .from('callups')
    .select(`
      id,
      event_id,
      player_id,
      response,
      notes,
      player:profiles(
        id,
        name,
        nickname,
        shirt_name,
        jersey_number,
        position,
        photo_url,
        role
      )
    `)
    .eq('event_id', nextMatch.id);

  console.log('\n=== CALLUPS ===');
  console.log('Total callups:', callups?.length, 'Error:', errCallups);

  if (callups) {
    console.log('\nCalled up players:');
    callups.forEach(c => {
      const p = c.player;
      console.log(`- #${p?.jersey_number ?? '?'} ${p?.shirt_name || p?.nickname || p?.name} | Pos: ${p?.position} | Resp: ${c.response} | Photo: ${p?.photo_url}`);
    });

    fs.writeFileSync('scripts/next_match_full.json', JSON.stringify({ nextMatch, callups }, null, 2));
    console.log('\nSaved full data to scripts/next_match_full.json');
  }

  // 3. Club info / settings
  const { data: club } = await supabase.from('club_settings').select('*');
  console.log('\nClub settings:', club);
}

main();
