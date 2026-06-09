import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper function to format UTC strings cleanly into Australian Eastern Standard Time (AEST)
function formatToAEST(utcString) {
  const date = new Date(utcString);
  return date.toLocaleString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }) + ' AEST';
}

async function sync() {
  try {
    const currentSyncTime = new Date().toISOString();

    // 1. FETCH STANDINGS DATA (1 Request)
    console.log("Fetching standings dataset...");
    const standingsRes = await fetch('https://v3.football.api-sports.io/standings?league=1&season=2026', {
      headers: { 'x-rapidapi-key': API_FOOTBALL_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
    });
    const standingsJson = await standingsRes.json();
    const groups = standingsJson.response[0]?.league?.standings;

    // 2. FETCH BULK FIXTURES VIA TARGETED DATE RANGE (1 Request)
    // FIXED: Swapped out '&next=15' for a fixed calendar block covering June 2026 matches
    console.log("Fetching upcoming fixtures dataset via calendar query...");
    const fixturesRes = await fetch('https://v3.football.api-sports.io/fixtures?league=1&season=2026&from=2026-06-11&to=2026-06-30', {
      headers: { 'x-rapidapi-key': API_FOOTBALL_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
    });
    const fixturesJson = await fixturesRes.json();
    const upcomingFixtures = fixturesJson.response || [];

    console.log(`RAW API FIXTURES VERIFICATION: Found ${upcomingFixtures.length} matches in scheduled payload.`);

    // Map through the fixtures to build an upcoming schedule tracker
    const nextMatchMap = {};
    upcomingFixtures.forEach(f => {
      const homeTeam = f.teams.home.name;
      const awayTeam = f.teams.away.name;
      const aestTime = formatToAEST(f.fixture.date);

      // Only map the absolute earliest fixture chronologically for each country
      if (!nextMatchMap[homeTeam]) {
        nextMatchMap[homeTeam] = `vs ${awayTeam} (${aestTime})`;
      }
      if (!nextMatchMap[awayTeam]) {
        nextMatchMap[awayTeam] = `vs ${homeTeam} (${aestTime})`;
      }
    });

    // PRE-KICKOFF FALLBACK MODE
    if (!groups) {
      console.log("⚠️ Standings not active yet on API. Running connection validation test...");
      const { data: dbTeams, error } = await supabase.from('world_cup_leaderboard').select('*');
      if (error) throw error;

      // Inject the live date-range fixtures into Supabase rows right now
      for (const team of dbTeams) {
        const nextMatchText = nextMatchMap[team.country] || "TBD (Check Group Stage)";
        await supabase.from('world_cup_leaderboard').update({
          next_match: nextMatchText,
          updated_at: currentSyncTime
        }).eq('id', team.id);
      }
      console.log(`🚀 Validation Success. Initialized AEST fixtures for ${dbTeams.length} teams.`);
      return;
    }

    // LIVE TOURNAMENT MODE MAPPING
    const apiTeams = {};
    groups.forEach(group => {
      group.forEach(item => {
        apiTeams[item.team.name] = { 
          wins: item.all.win, 
          gd: item.goalsDiff, 
          eliminated: item.status === "eliminated",
          played: item.all.played
        };
      });
    });

    const { data: dbTeams } = await supabase.from('world_cup_leaderboard').select('*');

    for (const team of dbTeams) {
      const live = apiTeams[team.country];
      const nextMatchText = nextMatchMap[team.country] || (live?.eliminated ? "❌ Eliminated" : "TBD");

      if (live) {
        await supabase.from('world_cup_leaderboard').update({
          wins: live.wins,
          gd: live.gd,
          eliminated: live.eliminated,
          games_played: live.played,
          next_match: nextMatchText,
          updated_at: currentSyncTime
        }).eq('id', team.id);
        console.log(`Updated data loop for: ${team.country}`);
      }
    }
    console.log("🚀 Custom Bulk-Fixture Sync Complete!");
  } catch (err) {
    console.error("❌ Synchronization Error:", err.message);
    process.exit(1);
  }
}
sync();
