import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Cleanly transforms UTC timestamps into a short, space-saving format with the day of the week
function formatToAEST(utcString) {
  const date = new Date(utcString);
  
  // Formats date to 'Day DD/MM' (e.g., 'Thu 11/06')
  const datePart = date.toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  });

  // Formats time to 'h:mm am/pm'
  const timePart = date.toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).toLowerCase();

  // Combines them smoothly into 'Thu 11/06 • 2:00 am'
  return `${datePart} • ${timePart}`;
}

async function sync() {
  try {
    const currentSyncTime = new Date().toISOString();

    // 1. BULK FETCH STANDINGS (Exactly 1 API Request)
    console.log("Bulk fetching live standings dataset...");
    const standingsRes = await fetch('https://api.football-data.org/v4/competitions/WC/standings', {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY }
    });
    const standingsJson = await standingsRes.json();
    const groups = standingsJson.standings || [];

    // 2. BULK FETCH ALL FIXTURES (Exactly 1 API Request)
    console.log("Bulk fetching competition fixtures dataset...");
    const fixturesRes = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY }
    });
    const fixturesJson = await fixturesRes.json();
    const allMatches = fixturesJson.matches || [];

    console.log(`BULK AUDIT: Successfully fetched ${allMatches.length} global tournament fixtures.`);

    // Map through the entire competition calendar to find the upcoming games
    const nextMatchMap = {};
    allMatches.forEach(m => {
      const homeTeam = m.homeTeam.name;
      const awayTeam = m.awayTeam.name;
      const aestTime = formatToAEST(m.utcDate);

      // Status "TIMED" or "SCHEDULED" means the game hasn't kicked off yet
      if (m.status === "TIMED" || m.status === "SCHEDULED") {
        if (!nextMatchMap[homeTeam]) {
          nextMatchMap[homeTeam] = `vs ${awayTeam} (${aestTime})`;
        }
        if (!nextMatchMap[awayTeam]) {
          nextMatchMap[awayTeam] = `vs ${homeTeam} (${aestTime})`;
        }
      }
    });

    // Extract stats for every single country into an absolute local lookup object
    const apiTeamsMap = {};
    groups.forEach(g => {
      if (g.table) {
        g.table.forEach(item => {
          apiTeamsMap[item.team.name] = {
            wins: item.won || 0,
            gd: item.goalDifference || 0,
            played: item.playedGames || 0,
            eliminated: false 
          };
        });
      }
    });

    // Pull your current database standings configuration from Supabase
    const { data: dbTeams, error: dbError } = await supabase.from('world_cup_leaderboard').select('*');
    if (dbError) throw dbError;

    // PRE-KICKOFF INTERFACE ROUTING
    if (groups.length === 0 || Object.keys(apiTeamsMap).length === 0) {
      console.log("⚠️ Standings empty or inactive. Processing in pre-kickoff fixture synchronization mode...");
      
      for (const team of dbTeams) {
        const nextMatchText = nextMatchMap[team.country] || "TBD (Check Group Stage)";
        await supabase.from('world_cup_leaderboard').update({
          next_match: nextMatchText,
          updated_at: currentSyncTime
        }).eq('id', team.id);
      }
      console.log(`🚀 Pre-Kickoff Sync Success. Localized schedule generated for all ${dbTeams.length} managers.`);
      return;
    }

    // LIVE TOURNAMENT SYNCHRONIZATION LOOP
    for (const team of dbTeams) {
      const live = apiTeamsMap[team.country];
      const nextMatchText = nextMatchMap[team.country] || (live?.eliminated ? "❌ Eliminated" : "TBD");

      if (live) {
        await supabase.from('world_cup_leaderboard').update({
          wins: live.wins,
          gd: live.gd,
          games_played: live.played,
          next_match: nextMatchText,
          updated_at: currentSyncTime
        }).eq('id', team.id);
        console.log(`✅ Bulk Sync processing active data for country: ${team.country}`);
      } else {
        // Fallback placeholder safety step if text matching fails on a team row
        await supabase.from('world_cup_leaderboard').update({
          next_match: nextMatchText,
          updated_at: currentSyncTime
        }).eq('id', team.id);
      }
    }

    console.log("🚀 Complete Football-Data Bulk Sync finished successfully!");
  } catch (err) {
    console.error("❌ Execution Error detected during data sync pipeline:", err.message);
    process.exit(1);
  }
}
sync();
