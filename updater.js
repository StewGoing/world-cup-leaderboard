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

    // 2. FETCH BULK UPCOMING FIXTURES DATA (1 Request)
    console.log("Fetching upcoming fixtures dataset...");
    const fixturesRes = await fetch('https://v3.football.api-sports.io/fixtures?league=1&season=2026&next=15', {
      headers: { 'x-rapidapi-key': API_FOOTBALL_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
    });
    const fixturesJson = await fixturesRes.json();
    const upcomingFixtures = fixturesJson.response || [];
      console.log("RAW FIXTURES FROM API:", JSON.stringify(upcomingFixtures, null, 2));
    // Map through the next 15 fixtures to build an upcoming schedule tracker
    const nextMatchMap = {};
    upcomingFixtures.forEach(f => {
      const homeTeam = f.teams.home.name;
      const awayTeam = f.teams.away.name;
      const aestTime = formatToAEST(f.fixture.date);

      // If a country doesn't have a next match mapped yet, log this chronological earliest fixture
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

      // FIXED: Inject the live mapped fixtures and synchronization timestamp even while standings remain inactive
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
