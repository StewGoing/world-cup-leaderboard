import { createClient } from '@supabase/supabase-js';

// Load environmental variables secured in GitHub Secrets
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper to format timestamps to readable Australian Eastern Standard Time
function formatToAEST(utcString) {
  if (!utcString) return '';
  const date = new Date(utcString);
  const dayPart = date.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', weekday: 'short' });
  const datePart = date.toLocaleDateString('en-AU', { timeZone: 'Australia/Sydney', day: '2-digit', month: '2-digit' });
  const timePart = date.toLocaleTimeString('en-AU', { timeZone: 'Australia/Sydney', hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase().replace(' ', '');
  return `${dayPart} ${datePart}, ${timePart}`;
}

// Hierarchy Calculation: Determines numerical ranking weight based on progress and outcome
function calculateStageWeight(stageString, isEliminated, matchStatus, isWinner) {
  if (!stageString) return 1;
  const stage = stageString.toUpperCase();
  if (stage.includes('GROUP')) return 1;
  if (stage.includes('LAST_32') || stage.includes('ROUND_OF_32')) return 3;
  if (stage.includes('LAST_16') || stage.includes('ROUND_OF_16')) return 4;
  if (stage.includes('QUARTER')) return 5;
  if (stage.includes('SEMI')) return 6;
  if (stage.includes('THIRD') || stage.includes('3RD')) return matchStatus === 'FINISHED' ? (isWinner ? 8 : 7) : 6;
  if (stage.includes('FINAL')) return matchStatus === 'FINISHED' ? (isWinner ? 10 : 9) : 11;
  return 1;
}

// Deducts penalty shootout goals from fullTime stats if they exist
function getCleanMatchScore(matchObject) {
  let homeScore = matchObject.score?.fullTime?.home ?? 0;
  let awayScore = matchObject.score?.fullTime?.away ?? 0;

  if (matchObject.score?.penalties?.home !== undefined && matchObject.score?.penalties?.home !== null) {
    homeScore -= matchObject.score.penalties.home;
  }
  if (matchObject.score?.penalties?.away !== undefined && matchObject.score?.penalties?.away !== null) {
    awayScore -= matchObject.score.penalties.away;
  }

  return { homeScore, awayScore };
}

// Helper to instantly promote a team's stage status string upon securing a knockout victory
function getAdvancedStage(currentStage) {
  const stage = currentStage.toUpperCase();
  if (stage.includes('LAST_32') || stage.includes('ROUND_OF_32')) return 'ROUND_OF_16';
  if (stage.includes('LAST_16') || stage.includes('ROUND_OF_16')) return 'QUARTER_FINALS';
  if (stage.includes('QUARTER')) return 'SEMI_FINALS';
  if (stage.includes('SEMI')) return 'FINAL';
  return currentStage;
}

// Maps country names directly to stable official FIFA codes
function getOfficialTLA(countryName) {
  const overrides = {
    'SPAIN': 'ESP',
    'MOROCCO': 'MAR',
    'NETHERLANDS': 'NED',
    'ARGENTINA': 'ARG',
    'COLOMBIA': 'COL'
  };
  const key = countryName.toUpperCase().trim();
  return overrides[key] || key.substring(0, 3);
}

// Generate the news ticker commentary string
function generateDraftCommentary(allMatches, sortedTeams) {
  const commentaryLines = [];
  const currentExecutionMs = new Date().getTime();
  const pickRandom = (array) => array[Math.floor(Math.random() * array.length)];

  const winPool = ["Complete and utter dominance.", "Statement made.", "Leaderboard shaking up.", "Pure tactical masterclass."];
  const losePool = ["Back to the drawing board.", "That is going to hurt.", "Disaster class."];
  const drawPool = ["They completely cancel each other out.", "A tight, nervous tactical gridlock.", "Shared points."];

  const recentFinishedMatches = allMatches.filter(m => {
    if (m.status !== 'FINISHED') return false;
    const matchEndMs = new Date(m.utcDate).getTime();
    return (currentExecutionMs - matchEndMs) <= (86400000 + 7200000); 
  });

  if (recentFinishedMatches.length > 0) {
    recentFinishedMatches.forEach(m => {
      const homeTLA = m.homeTeam?.tla || 'TBD';
      const awayTLA = m.awayTeam?.tla || 'TBD';
      const { homeScore, awayScore } = getCleanMatchScore(m);
      const homeManager = sortedTeams.find(t => t.country_tla === homeTLA)?.manager;
      const awayManager = sortedTeams.find(t => t.country_tla === awayTLA)?.manager;

      if (!homeManager && !awayManager) return;

      if (homeManager && awayManager) {
        if (m.score.winner === 'DRAW' || (!m.score.winner && homeScore === awayScore)) {
          commentaryLines.push(`📢 DRAW: ${homeTLA} ${homeScore}-${awayScore} ${awayTLA} • ${homeManager} and ${awayManager} ${pickRandom(drawPool)}`);
        } else {
          const homeAdvanced = m.score.winner === 'HOME_TEAM';
          const scoreStr = homeAdvanced ? `${homeScore}-${awayScore}` : `${awayScore}-${homeScore}`;
          commentaryLines.push(`⚽ RESULT: ${homeAdvanced ? homeManager : awayManager}'s ${homeAdvanced ? homeTLA : awayTLA} defeats ${homeAdvanced ? awayManager : homeManager} ${scoreStr} • ${pickRandom(winPool)}`);
        }
      } else {
        const activeManager = homeManager || awayManager;
        const activeTLA = homeManager ? homeTLA : awayTLA;
        const oppTLA = homeManager ? awayTLA : homeTLA;
        const isHomeActive = !!homeManager;
        const activeScore = isHomeActive ? homeScore : awayScore;
        const oppScore = isHomeActive ? awayScore : homeScore;

        if (m.score.winner === 'DRAW' || (!m.score.winner && homeScore === awayScore)) {
          commentaryLines.push(`📢 RESULT: ${activeManager} (${activeTLA}) draws ${activeScore}-${oppScore} against ${oppTLA} • ${pickRandom(drawPool)}`);
        } else {
          const activeWon = (isHomeActive && m.score.winner === 'HOME_TEAM') || (!isHomeActive && m.score.winner === 'AWAY_TEAM');
          if (activeWon) {
            commentaryLines.push(`⚽ RESULT: Big win for ${activeManager} (${activeTLA}), beating ${oppTLA} ${activeScore}-${oppScore} • ${pickRandom(winPool)}`);
          } else {
            commentaryLines.push(`❌ RESULT: Tough loss for ${activeManager} (${activeTLA}), falling ${activeScore}-${oppScore} to ${oppTLA} • ${pickRandom(losePool)}`);
          }
        }
      }
    });
  }

  if (sortedTeams.length >= 2) {
    commentaryLines.push(`👑 LEADER: ${sortedTeams[0].manager} Enjoys the view from the summit.`, `🥄 Spoon Watch: ${sortedTeams[sortedTeams.length - 1].manager} Anchors the table.`);
  }

  return commentaryLines.join("   •   ");
}

async function sync() {
  try {
    const currentSyncTime = new Date();
    const currentSyncTimeISO = currentSyncTime.toISOString();

    // ADAPTIVE SCHEDULER: Check database metadata flags before running heavy requests
    const { data: flagCheck, error: flagError } = await supabase.from('world_cup_leaderboard').select('notes_bool, updated_at').limit(1);
    if (flagError) throw flagError;

    if (flagCheck && flagCheck.length > 0) {
      const isGameCurrentlyLive = flagCheck[0].notes_bool === true;
      const minutesSinceLastDatabaseWrite = (currentSyncTime.getTime() - new Date(flagCheck[0].updated_at).getTime()) / 1000 / 60;
      
      if (!isGameCurrentlyLive && minutesSinceLastDatabaseWrite >= 60) {
        if (minutesSinceLastDatabaseWrite < 55) {
          console.log(`💤 Smart Exit: Passive window active (${Math.round(minutesSinceLastDatabaseWrite)}m elapsed). Hibernating to preserve API calls.`);
          return; 
        }
      }
    }

    console.log("Fetching comprehensive competition fixtures historical dataset...");
    const fixturesRes = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY }
    });
    const fixturesJson = await fixturesRes.json();
    const allMatches = fixturesJson.matches || [];

    const { data: dbTeams, error: dbError } = await supabase.from('world_cup_leaderboard').select('*');
    if (dbError) throw dbError;

    const nextMatchMap = {};
    const liveMatchMap = {};
    const lastFinishedMatchMap = {};
    const matchWinnersSet = new Set();
    const dynamicStatsMap = {};
    
    // Maps both match sequence numbers AND database team IDs directly to verified winner codes
    const matchNumberToWinnerTlaMap = {};
    const teamIdToVerifiedWinnerTlaMap = {};

    dbTeams.forEach(team => {
      const teamTLA = getOfficialTLA(team.country);
      dynamicStatsMap[teamTLA] = {
        wins: 0, draws: 0, losses: 0, gf: 0, ga: 0, gd: 0,
        stageString: 'GROUP_STAGE', matchStatus: 'TIMED', eliminated: false, name: team.country
      };
    });

    // PASS 1: Aggregate Finished and Live matches, indexing verified winners by team ID and match number
    allMatches.forEach(m => {
      const homeTLA = m.homeTeam?.tla;
      const awayTLA = m.awayTeam?.tla;

      const hasHome = homeTLA ? dynamicStatsMap.hasOwnProperty(homeTLA) : false;
      const hasAway = awayTLA ? dynamicStatsMap.hasOwnProperty(awayTLA) : false;

      if (hasHome) {
        dynamicStatsMap[homeTLA].stageString = m.stage;
        dynamicStatsMap[homeTLA].matchStatus = m.status;
      }
      if (hasAway) {
        dynamicStatsMap[awayTLA].stageString = m.stage;
        dynamicStatsMap[awayTLA].matchStatus = m.status;
      }

      if (m.status === 'FINISHED') {
        const { homeScore, awayScore } = getCleanMatchScore(m);

        if (hasHome) {
          dynamicStatsMap[homeTLA].gf += homeScore;
          dynamicStatsMap[homeTLA].ga += awayScore;
          lastFinishedMatchMap[homeTLA] = m;
        }
        if (hasAway) {
          dynamicStatsMap[awayTLA].gf += awayScore;
          dynamicStatsMap[awayTLA].ga += homeScore;
          lastFinishedMatchMap[awayTLA] = m;
        }

        const tournamentMatchNum = String(m.matchNumber || m.id);

        if (m.score.winner === 'HOME_TEAM') {
          if (homeTLA) {
            matchNumberToWinnerTlaMap[tournamentMatchNum] = homeTLA;
            if (m.homeTeam.id) teamIdToVerifiedWinnerTlaMap[m.homeTeam.id] = homeTLA;
          }
          if (hasHome) {
            dynamicStatsMap[homeTLA].wins += 1;
            matchWinnersSet.add(dynamicStatsMap[homeTLA].name);
            if (m.stage !== 'GROUP_STAGE') dynamicStatsMap[homeTLA].stageString = getAdvancedStage(m.stage);
          }
          if (hasAway) {
            dynamicStatsMap[awayTLA].losses += 1;
            if (m.stage !== 'GROUP_STAGE') dynamicStatsMap[awayTLA].eliminated = true; 
          }
        } else if (m.score.winner === 'AWAY_TEAM') {
          if (awayTLA) {
            matchNumberToWinnerTlaMap[tournamentMatchNum] = awayTLA;
            if (m.awayTeam.id) teamIdToVerifiedWinnerTlaMap[m.awayTeam.id] = awayTLA;
          }
          if (hasAway) {
            dynamicStatsMap[awayTLA].wins += 1;
            matchWinnersSet.add(dynamicStatsMap[awayTLA].name);
            if (m.stage !== 'GROUP_STAGE') dynamicStatsMap[awayTLA].stageString = getAdvancedStage(m.stage);
          }
          if (hasHome) {
            dynamicStatsMap[homeTLA].losses += 1;
            if (m.stage !== 'GROUP_STAGE') dynamicStatsMap[homeTLA].eliminated = true;
          }
        } else {
          if (hasHome) dynamicStatsMap[homeTLA].draws += 1;
          if (hasAway) dynamicStatsMap[awayTLA].draws += 1;
        }
      }

      if (m.status === 'IN_PLAY' || m.status === 'LIVE' || m.status === 'PAUSED') {
        const homeScore = m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0;
        const awayScore = m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0;
        const liveLabelText = m.status === 'PAUSED' ? "🔥 LIVE (HT)" : "🔥 LIVE";
        const liveBadgeHTML = `<span data-badge="live" style="background-color: #ef4444; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-right: 6px; display: inline-block; vertical-align: middle;">${liveLabelText}</span>`;
        
        if (hasHome) liveMatchMap[dynamicStatsMap[homeTLA].name] = `${liveBadgeHTML}vs ${awayTLA} (${homeScore} - ${awayScore})`;
        if (hasAway) liveMatchMap[dynamicStatsMap[awayTLA].name] = `${liveBadgeHTML}vs ${homeTLA} (${awayScore} - ${homeScore})`;
      }
    });

    // PASS 2: Universal stage-independent schedule resolver loop
    allMatches.forEach(m => {
      if (m.status === "TIMED" || m.status === "SCHEDULED") {
        let homeTLA = m.homeTeam?.tla;
        let awayTLA = m.awayTeam?.tla;

        // 1. DYNAMIC TEAM-ID MAPPING: Check if the unplayed bracket slot's structural team ID 
        // matches a team code we recorded as a winner in Pass 1.
        if (!homeTLA && m.homeTeam?.id && teamIdToVerifiedWinnerTlaMap[m.homeTeam.id]) {
          homeTLA = teamIdToVerifiedWinnerTlaMap[m.homeTeam.id];
        }
        if (!awayTLA && m.awayTeam?.id && teamIdToVerifiedWinnerTlaMap[m.awayTeam.id]) {
          awayTLA = teamIdToVerifiedWinnerTlaMap[m.awayTeam.id];
        }

        // 2. TEXT-STRING PLACEHOLDER LOOKUP fallback: Scans text strings for digit sequence matching
        if (!homeTLA && m.homeTeam?.name) {
          const digits = m.homeTeam.name.match(/\d+/);
          if (digits && matchNumberToWinnerTlaMap[digits[0]]) homeTLA = matchNumberToWinnerTlaMap[digits[0]];
        }
        if (!awayTLA && m.awayTeam?.name) {
          const digits = m.awayTeam.name.match(/\d+/);
          if (digits && matchNumberToWinnerTlaMap[digits[0]]) awayTLA = matchNumberToWinnerTlaMap[digits[0]];
        }

        const displayHome = homeTLA || "TBD";
        const displayAway = awayTLA || "TBD";

        const kickoffMs = new Date(m.utcDate).getTime();
        const msUntilKickoff = kickoffMs - currentSyncTime.getTime();
        let badgeHTML = "";

        if (msUntilKickoff > 0 && msUntilKickoff <= 172800000) {
          const hoursRemaining = Math.ceil(msUntilKickoff / (1000 * 60 * 60));
          badgeHTML = `<span data-badge="countdown" style="background-color: #262626; color: #a3a3a3; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-right: 6px; display: inline-block; vertical-align: middle;">⚡ IN ${hoursRemaining}H</span>`;
        }

        const formattedMatchTime = `${badgeHTML}vs {OPPONENT} • ${formatToAEST(m.utcDate)}`;

        if (homeTLA && dynamicStatsMap.hasOwnProperty(homeTLA)) {
          const name = dynamicStatsMap[homeTLA].name;
          if (!liveMatchMap[name] && !nextMatchMap[name]) {
            nextMatchMap[name] = formattedMatchTime.replace('{OPPONENT}', displayAway);
          }
        }
        if (awayTLA && dynamicStatsMap.hasOwnProperty(awayTLA)) {
          const name = dynamicStatsMap[awayTLA].name;
          if (!liveMatchMap[name] && !nextMatchMap[name]) {
            nextMatchMap[name] = formattedMatchTime.replace('{OPPONENT}', displayHome);
          }
        }
      }
    });

    let isAnyLeagueTeamCurrentlyLive = false;
    dbTeams.forEach(team => {
      const teamTLA = getOfficialTLA(team.country);
      if (liveMatchMap[team.country] && !dynamicStatsMap[teamTLA]?.eliminated) isAnyLeagueTeamCurrentlyLive = true;
    });

    const preparedTeams = dbTeams.map(t => ({
      ...t,
      country_tla: getOfficialTLA(t.country)
    }));

    const currentMockSortedTeams = preparedTeams.map(team => {
      const stats = dynamicStatsMap[team.country_tla] || {};
      return {
        ...team,
        stageWeight: calculateStageWeight(stats.stageString, stats.eliminated, stats.matchStatus, matchWinnersSet.has(team.country)),
        wins: stats.wins || 0,
        gd: stats.gf - stats.ga
      };
    }).sort((a, b) => {
      if (b.stageWeight !== a.stageWeight) return b.stageWeight - a.stageWeight;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return a.odds - b.odds;
    });

    const tickerPayloadString = generateDraftCommentary(allMatches, currentMockSortedTeams);

    for (const team of dbTeams) {
      const teamTLA = getOfficialTLA(team.country);
      const stats = dynamicStatsMap[teamTLA];
      const nextMatchText = liveMatchMap[team.country] || nextMatchMap[team.country] || (stats?.eliminated ? "❌ Eliminated" : "TBD");

      let dbMatchTime = null;
      let dbMatchResult = null;
      let dbMatchGDChange = 0;

      const lastGame = lastFinishedMatchMap[teamTLA];
      if (lastGame) {
        dbMatchTime = lastGame.utcDate;
        const isHome = lastGame.homeTeam.tla === teamTLA;
        const { homeScore, awayScore } = getCleanMatchScore(lastGame);
        
        if (lastGame.score.winner === 'HOME_TEAM') {
          dbMatchResult = isHome ? 'WIN' : 'LOSS';
          dbMatchGDChange = isHome ? (homeScore - awayScore) : (awayScore - homeScore);
        } else if (lastGame.score.winner === 'AWAY_TEAM') {
          dbMatchResult = isHome ? 'LOSS' : 'WIN';
          dbMatchGDChange = isHome ? (homeScore - awayScore) : (awayScore - homeScore);
        } else {
          dbMatchResult = 'DRAW';
          dbMatchGDChange = 0;
        }
      }

      if (stats) {
        const isWinner = matchWinnersSet.has(team.country);
        const stageWeightNum = calculateStageWeight(stats.stageString, stats.eliminated, stats.matchStatus, isWinner);
        const aggregatedGD = stats.gf - stats.ga;

        await supabase.from('world_cup_leaderboard').update({
          wins: stats.wins,
          games_played: `${stats.draws}/${stats.losses}`, 
          gd: aggregatedGD,
          stage: stageWeightNum, 
          next_match: nextMatchText,
          notes: tickerPayloadString,
          notes_bool: isAnyLeagueTeamCurrentlyLive, 
          eliminated: stats.eliminated,
          updated_at: currentSyncTimeISO,
          gf: stats.gf,
          ga: stats.ga,
          last_match_time: dbMatchTime,
          last_match_result: dbMatchResult,
          last_match_gd_change: dbMatchGDChange
        }).eq('id', team.id);
      } else {
        await supabase.from('world_cup_leaderboard').update({
          next_match: nextMatchText,
          notes: tickerPayloadString,
          notes_bool: isAnyLeagueTeamCurrentlyLive,
          updated_at: currentSyncTimeISO
        }).eq('id', team.id);
      }
    }

    console.log("Sync sequence finalized successfully.");
  } catch (err) {
    console.error("❌ Execution Error:", err.message);
    process.exit(1);
  }
}
sync();
