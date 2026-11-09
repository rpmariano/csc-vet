import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const filePath = 'C:\\Users\\rpmar\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Local Storage\\leveldb\\180112.ldb';
const buf = fs.readFileSync(filePath);
const key = Buffer.from('eyJhbGciOiJFUzI1Ni');
const found = buf.indexOf(key);

if (found === -1) {
  console.log('JWT header not found');
  process.exit(1);
}

const endQuote = buf.indexOf(Buffer.from('","token_type"'), found);
const jwt = buf.subarray(found, endQuote).toString('utf8');
console.log('Found JWT, length:', jwt.length);

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
  global: {
    headers: {
      Authorization: `Bearer ${jwt}`
    }
  }
});

async function run() {
  const { data: user, error: errUser } = await supabase.auth.getUser(jwt);
  console.log('Auth user:', user?.user?.email, 'Error:', errUser);

  // Fetch upcoming events
  const { data: events, error: errEv } = await supabase
    .from('events')
    .select(`
      id,
      title,
      type,
      date_time,
      meeting_time,
      location,
      home_away,
      opponent:opponents(*),
      field:fields(*),
      tournament:tournaments(*)
    `)
    .gte('date_time', '2026-11-01T00:00:00')
    .order('date_time', { ascending: true });

  console.log('Upcoming events (>= 2026-11-01):', events?.length, 'Err:', errEv);
  if (events) {
    events.forEach(e => {
      console.log(`[${e.type}] ${e.id} | ${e.date_time} | ${e.title} | Opponent: ${e.opponent?.name} | Field: ${e.field?.name} | H/A: ${e.home_away}`);
    });
  }

  // If there's an upcoming match, let's find the first one
  const nextMatch = events?.find(e => e.type === 'match');
  console.log('\n--- NEXT MATCH ---');
  console.log(JSON.stringify(nextMatch, null, 2));

  if (nextMatch) {
    // Fetch callups for this match
    const { data: callups, error: errCall } = await supabase
      .from('callups')
      .select(`
        id,
        event_id,
        player_id,
        response,
        response_time,
        notes,
        player:profiles(*)
      `)
      .eq('event_id', nextMatch.id);

    console.log('\nCallups count:', callups?.length, 'Err:', errCall);
    if (callups) {
      callups.forEach(c => {
        const p = c.player;
        console.log(`- ${p?.jersey_number || '?'}. ${p?.shirt_name || p?.name} (${p?.position || 'N/A'}) - Resp: ${c.response} - Photo: ${p?.photo_url}`);
      });

      fs.writeFileSync('scripts/next_match_data.json', JSON.stringify({ nextMatch, callups }, null, 2));
      console.log('Saved to scripts/next_match_data.json');
    }
  }
}

run();
