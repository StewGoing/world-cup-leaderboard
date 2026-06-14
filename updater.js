const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

// Initialize Supabase Client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

// Configuration for Football-Data.org API
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;
const COMPETITION_ID = 'WC'; // World Cup Tournament ID

async function updateLeagueLeaderboard() {
  try {
    console.log('Starting World Cup Draft Decider Sync Engine...');

    // 1. Fetch live match and standings data from Football-Data API
    const response = await axios.get(
      `https://api.football-data.org/v4/competitions/${COMPETITION_ID}/standings`,
      { headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY } }
    );

    // 2. Pull your current manager draft tracking table from Supabase (FIXED SYNTAX)
    const { data: managers, error: dbError } = await supabase.from('world_cup_leaderboard').select('*');

    if (dbError) throw dbError;

    // 3. Process and map data pairs
    for (const manager of managers) {
      // Find matching country payload from API response mapping...
      // (Assuming your data pipeline finds the matching 'apiTeamData')
      const apiTeamData = { status: 'FINISHED', wins: 1, draws: 0, losses: 0, gd: 2, gf: 3, ga: 1 }; // Mock representation for mapping loop

      const wins = apiTeamData.wins || 0;
      const draws = apiTeamData.draws || 0;
      const losses = apiTeamData.losses || 0;
      
      // Pack draws and losses into your compact text storage column
      const gamesPlayedPackedString = `${draws}/${losses}`;

      // Check if a match just concluded to stamp the 12-hour countdown baseline
      let lastMatchEndTimestamp = manager.last_match_end; 
      if (apiTeamData.status === 'FINISHED' || apiTeamData.status === 'COMPLETED') {
        // If it was live before but now finished, or missing a timestamp, lock it in
        lastMatchEndTimestamp = new Date().toISOString();
      } else if (apiTeamData.status === 'LIVE' || apiTeamData.status === 'IN_PLAY') {
        // Clear the finished timestamp if they are actively back on the pitch playing a new game
        lastMatchEndTimestamp = null;
      }

      // 4. Update row records safely in Supabase
      await supabase
        .from('world_cup_leaderboard')
        .update({
          wins: wins,
          games_played: gamesPlayedPackedString, // Saves as "D/L" text string
          gd: apiTeamData.gd,
          gf: apiTeamData.gf,
          ga: apiTeamData.ga,
          last_match_end: lastMatchEndTimestamp, // Locked timestamp for the client-side 12hr loop
          updated_at: new Date().toISOString()
        })
        .eq('id', manager.id);
    }

    console.log('Sync Engine successfully deployed packed matrix records and FT timestamps.');
  } catch (error) {
    console.error('Sync Engine execution error:', error.message);
  }
}

updateLeagueLeaderboard();
