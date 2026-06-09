import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Formats UTC timestamps to an ultra-compact layout: 'Thu 11/06, 2:00am'
function formatToAEST(utcString) {
  const date = new Date(utcString);
  
  const datePart = date.toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit'
  });

  const timePart = date.toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).toLowerCase().replace(' ', ''); // Removes inner space to save characters

  return `${datePart}, ${timePart}`;
}

async function sync() {
  try {
    const currentSyncTime = new Date().toISOString();

    // 1. BULK FETCH STANDINGS
    console.log("Bulk fetching live standings dataset...");
    const standingsRes = await fetch('https://api.football-data.org/v4/competitions/WC/standings', {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY }
    });
    const standingsJson = await standingsRes.json();
    const groups = standingsJson.standings || [];

    // 2. BULK FETCH ALL FIXTURES
    console.log("Bulk fetching competition fixtures dataset...");
    const fixturesRes = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY }
    });
    const fixturesJson = await fixturesRes.json();
    const allMatches = fixturesJson.matches || [];

    console.log(`BULK AUDIT: Successfully fetched ${allMatches.length} global tournament fixtures.`);

    // Map through the competition calendar to build the 3-letter acronym schedule
    const nextMatchMap = {};
    allMatches.forEach(m => {
      const homeName = m.homeTeam.name;
      const homeTLA = m.homeTeam.tla || homeName.substring(0, 3).toUpperCase();
      const awayName = m.awayTeam.name;
      const awayTLA = m.awayTeam.tla || awayName.substring(0, 3).toUpperCase();
      const aestTime = formatToAEST(m.utcDate);

      if (m.status === "TIMED" || m.status === "SCHEDULED") {
        if (!nextMatchMap[homeName]) {
          nextMatchMap[homeName] = `vs ${awayTLA} • ${aestTime}`;
        }
        if (!nextMatchMap[awayName]) {
          nextMatchMap[awayName] = `vs ${homeTLA} • ${aestTime}`;
        }
      }
    });

    // Extract tournament points metrics
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

    // Pull current database standings from Supabase
    const { data: dbTeams, error: dbError } = await supabase.from('world_cup_leaderboard').select('*');
    if (dbError) throw dbError;

    // PRE-KICKOFF INTERFACE ROUTING
    if (groups.length === 0 || Object.keys(apiTeamsMap).length === 0) {
      console.log("⚠️ Standings processing in pre-kickoff fixture synchronization mode...");
      
      for (const team of dbTeams) {
        const nextMatchText = nextMatchMap[team.country] || "TBD (Check Group Stage)";
        await supabase.from('world_cup_leaderboard').update({
          next_match: nextMatchText,
          updated_at: currentSyncTime
        }).eq('id', team.id);
      }
      console.log(`🚀 Pre-Kickoff Sync Success. Mapped 3-letter schedule values for ${dbTeams.length} managers.`);
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
      } else {
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
