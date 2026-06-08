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
    
    if (!groups) throw new Error("API data format error or tournament not live yet.");

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
        await supabase.from('world_cup_leaderboard').update({
          wins: live.wins,
          gd: live.gd,
          eliminated: live.eliminated
        }).eq('id', team.id);
        console.log(`Updated ${team.country}`);
      }
    }
    console.log("Sync successfully complete!");
  } catch (err) {
    console.error("Error running update:", err.message);
  }
}
sync();
