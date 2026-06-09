import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function formatToAEST(utcString) {
  if (!utcString) return '';
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
  }).toLowerCase().replace(' ', '');

  return `${datePart}, ${timePart}`;
}

// Master Weight Calculator for precise sorting hierarchy
function calculateStageWeight(stageString, isEliminated, matchStatus, isWinner) {
  if (!stageString) return 1;
  const stage = stageString.toUpperCase();
  
  if (stage.includes('GROUP')) return 1;
  if (stage.includes('LAST_32') || stage.includes('ROUND_OF_32')) return 3;
  if (stage.includes('LAST_16') || stage.includes('ROUND_OF_16')) return 4;
  if (stage.includes('QUARTER')) return 5;
  
  if (stage.includes('SEMI')) return 6; // Semis bound
  
  if (stage.includes('THIRD') || stage.includes('3RD')) {
    if (matchStatus === 'FINISHED') return isWinner ? 8 : 7; // Locked 3rd or 4th Place
    return 6;
  }
  
  if (stage.includes('FINAL')) {
    if (matchStatus === 'FINISHED') return isWinner ? 10 : 9; // Locked Champion or Runner Up
    return 11; // Active Finalist Contender ("Finals bound")
  }
  return 1;
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

    const nextMatchMap = {};
    const teamLiveStageMap = {};
    const teamMatchStatusMap = {};
    const matchWinnersSet = new Set();

    allMatches.forEach(m => {
      const homeName = m.homeTeam?.name || '';
      const awayName = m.awayTeam?.name || '';
      const homeTLA = m.homeTeam?.tla || (homeName ? homeName.substring(0, 3).toUpperCase() : 'TBD');
      const awayTLA = m.awayTeam?.tla || (awayName ? awayName.substring(0, 3).toUpperCase() : 'TBD');
      const aestTime = formatToAEST(m.utcDate);

      if (homeName) {
        teamLiveStageMap[homeName] = m.stage;
        teamMatchStatusMap[homeName] = m.status;
      }
      if (awayName) {
        teamLiveStageMap[awayName] = m.stage;
        teamMatchStatusMap[awayName] = m.status;
      }

      if (m.status === 'FINISHED') {
        const winner = m.score.winner === 'HOME_TEAM' ? homeName : m.score.winner === 'AWAY_TEAM' ? awayName : null;
        if (winner) matchWinnersSet.add(winner);
      }

      if (m.status === "TIMED" || m.status === "SCHEDULED") {
        if (homeName && !nextMatchMap[homeName]) {
          nextMatchMap[homeName] = `vs ${awayTLA} • ${aestTime}`;
        }
        if (awayName && !nextMatchMap[awayName]) {
          nextMatchMap[awayName] = `vs ${homeTLA} • ${aestTime}`;
        }
      }
    });

    // =========================================================================
    // DYNAMIC METADATA NEWS TICKER ENGINE (ANTI-STALE UPGRADE)
    // =========================================================================
    const headlines = [];
    const todayStr = new Date().toISOString().split('T')[0];

    const todaysMatches = allMatches.filter(m => m.utcDate.startsWith(todayStr));
    const liveMatches = allMatches.filter(m => m.status === 'IN_PLAY' || m.status === 'LIVE');

    if (liveMatches.length > 0) {
      // 1. LIVE SCORES MODE
      liveMatches.forEach(m => {
        const homeTLA = m.homeTeam?.tla || 'TBD';
        const awayTLA = m.awayTeam?.tla || 'TBD';
        const homeScore = m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0;
        const awayScore = m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0;
        headlines.push(`🔥 LIVE NOW: ${homeTLA} ${homeScore} - ${awayScore} ${awayTLA}`);
      });
    } else if (todaysMatches.length > 0) {
      // 2. ACTIVE MATCHDAY PREVIEW MODE
      const matchScheduleText = todaysMatches.map(m => {
        const homeTLA = m.homeTeam?.tla || 'TBD';
        const awayTLA = m.awayTeam?.tla || 'TBD';
        const localTime = new Date(m.utcDate).toLocaleTimeString('en-AU', {
          timeZone: 'Australia/Sydney',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }).toLowerCase().replace(' ', '');
        return `${homeTLA} vs ${awayTLA} (${localTime})`;
      }).join(' | ');
      headlines.push(`📅 TODAY'S FIXTURES (AEST): ${matchScheduleText}`);
    } else {
      // 3. THE PRE-KICKOFF HYPE GENERATOR (Prevents Stale Feeds)
      const openingMatch = allMatches.find(m => m.matchday === 1) || allMatches[0];
      
      if (openingMatch && openingMatch.utcDate) {
        const kickOffTime = new Date(openingMatch.utcDate).getTime();
        const nowTime = new Date().getTime();
        const timeDeltaMs = kickOffTime - nowTime;

        if (timeDeltaMs > 0) {
          const totalMinutesLeft = Math.floor(timeDeltaMs / 1000 / 60);
          const hoursLeft = Math.floor(totalMinutesLeft / 60);
          const minsLeft = totalMinutesLeft % 60;
          headlines.push(`⏳ COUNTDOWN TO WORLD CUP KICKOFF: Exactly ${hoursLeft}h ${minsLeft}m remaining until opening whistle!`);
        }
      }

      const distinctGroupsCount = groups.length || 12;
      headlines.push(`📊 TOURNAMENT SYSTEM INTEL: 48 countries mapped across ${distinctGroupsCount} distinct groups.`);
      headlines.push("🏆 PRE-MATCH RULES BRIEF: The top 2 teams from every single group, alongside the 8 best 3rd-place finishers overall, will surge into the historic Round of 32 brackets.");
      headlines.push("⚽ TRACKER NOTICE: Ranks will re-index instantly every 60 minutes as goals clear the goalmouths.");
    }

    const tickerPayloadString = headlines.join("   •   ");
    // =========================================================================

    const apiTeamsMap = {};
    groups.forEach(g => {
      if (g.table) {
        g.table.forEach(item => {
          if (item.team && item.team.name) {
            const countryName = item.team.name;
            const liveStage = teamLiveStageMap[countryName] || 'GROUP_STAGE';
            const currentStatus = teamMatchStatusMap[countryName] || 'TIMED';
            
            let isEliminated = false;
            if (g.table.indexOf(item) >= 2 && liveStage === 'GROUP_STAGE') {
              isEliminated = true;
            }

            apiTeamsMap[countryName] = {
              wins: item.won || 0,
              gd: item.goalDifference || 0,
              played: item.playedGames || 0,
              stageString: liveStage,
              matchStatus: currentStatus,
              eliminated: isEliminated
            };
          }
        });
      }
    });

    const { data: dbTeams, error: dbError } = await supabase.from('world_cup_leaderboard').select('*');
    if (dbError) throw dbError;

    if (groups.length === 0 || Object.keys(apiTeamsMap).length === 0) {
      console.log("⚠️ Standings empty. Processing pre-kickoff fixture mode...");
      for (const team of dbTeams) {
        const nextMatchText = nextMatchMap[team.country] || "TBD (Check Group Stage)";
        await supabase.from('world_cup_leaderboard').update({
          next_match: nextMatchText,
          notes: tickerPayloadString,
          updated_at: currentSyncTime
        }).eq('id', team.id);
      }
      return;
    }

    for (const team of dbTeams) {
      const live = apiTeamsMap[team.country];
      const nextMatchText = nextMatchMap[team.country] || (live?.eliminated ? "❌ Eliminated" : "TBD");

      if (live) {
        const isWinner = matchWinnersSet.has(team.country);
        const stageWeightNum = calculateStageWeight(live.stageString, live.eliminated, live.matchStatus, isWinner);

        await supabase.from('world_cup_leaderboard').update({
          wins: live.wins,
          gd: live.gd,
          games_played: live.played,
          stage: stageWeightNum, 
          next_match: nextMatchText,
          notes: tickerPayloadString,
          updated_at: currentSyncTime
        }).eq('id', team.id);
      } else {
        await supabase.from('world_cup_leaderboard').update({
          next_match: nextMatchText,
          notes: tickerPayloadString,
          updated_at: currentSyncTime
        }).eq('id', team.id);
      }
    }

    console.log("🚀 Complete Dynamic Placement Engine Sync finished successfully!");
  } catch (err) {
    console.error("❌ Execution Error:", err.message);
    process.exit(1);
  }
}
sync();
