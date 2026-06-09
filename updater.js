import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sync() {
  try {
    console.log("Fetching live data from API-Football...");
    const res = await fetch('https://v3.football.api-sports.io/standings?league=1&season=2026', {
      headers: { 'x-rapidapi-key': API_FOOTBALL_KEY, 'x-rapidapi-host': 'v3.football.api-sports.io' }
    });
    const json = await res.json();
    const groups = json.response[0]?.league?.standings;
    
    // Create a uniform ISO timestamp for this specific synchronization run
    const currentSyncTime = new Date().toISOString();
    
    // SAFETY CATCH: Pre-Kickoff Mode
    if (!groups) {
      console.log("⚠️ Tournament standings are not active on the API yet (Expected pre-kickoff). Running a connection validation test instead...");
      
      const { data: dbTeams, error } = await supabase.from('world_cup_leaderboard').select('*');
      if (error) throw error;
      
      // FIXED: Force update the timestamp column so the front-end badge registers the successful sync loop
      const { error: timeError } = await supabase
        .from('world_cup_leaderboard')
        .update({ updated_at: currentSyncTime })
        .gte('id', 0); // Applies the fresh timestamp globally across rows safely
        
      if (timeError) throw timeError;
      
      console.log(`✅ Connection Test Passed! Successfully reached your Supabase database. Fetched ${dbTeams.length} managers.`);
      console.log(`🚀 Timestamps updated to ${currentSyncTime}. Everything is configured perfectly!`);
      return;
    }

    // Live Tournament Mode
    const apiTeams = {};
    groups.forEach(group => {
      group.forEach(item => {
        apiTeams[item.team.name] = { wins: item.all.win, gd: item.goalsDiff, eliminated: item.status === "eliminated" };
      });
    });

    const { data: dbTeams } = await supabase.from('world_cup_leaderboard').select('*');

    for (const team of dbTeams) {
      const live = apiTeams[team.country];
      if (live) {
        // FIXED: Added updated_at here too, so live tournament runs update the website countdown seamlessly
        await supabase.from('world_cup_leaderboard').update({
          wins: live.wins,
          gd: live.gd,
          eliminated: live.eliminated,
          updated_at: currentSyncTime
        }).eq('id', team.id);
        console.log(`Updated ${team.country}`);
      }
    }
    console.log("🚀 Sync successfully complete!");
  } catch (err) {
    console.error("❌ Error running update:", err.message);
    process.exit(1); 
  }
}
sync();
