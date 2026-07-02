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
  
  const dayPart = date.toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short'
  });

  const datePart = date.toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: '2-digit',
    month: '2-digit'
  });

  const timePart = date.toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).toLowerCase().replace(' ', '');

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
  if (stage.includes('THIRD') || stage.includes('3RD')) {
    return matchStatus === 'FINISHED' ? (isWinner ? 8 : 7) : 6;
  }
  if (stage.includes('FINAL')) {
    return matchStatus === 'FINISHED' ? (isWinner ? 10 : 9) : 11;
  }
  return 1;
}

// Generate the news ticker commentary string
function generateDraftCommentary(allMatches, sortedTeams) {
  const commentaryLines = [];
  const currentExecutionMs = new Date().getTime();

  const pickRandom = (array) => array[Math.floor(Math.random() * array.length)];

  const winPool = [
    "Complete and utter dominance.", "Statement made.", "Leaderboard shaking up.",
    "Sent them to school.", "Pure tactical masterclass.", "No mercy shown.", "An absolute clinic."
  ];

  const losePool = [
    "Back to the drawing board.", "That is going to hurt.", "Disaster class.",
    "Nowhere to hide after that performance.", "Gravely damaging to the draft campaign.",
    "Ouch. Time to recalibrate.", "Left exposed at the back."
  ];

  const drawPool = [
    "They completely cancel each other out.", "A frustrating stalemate for the campaign.",
    "Boring. Neither had the bottle to win.", "Two points dropped or one point saved?",
    "A tight, nervous tactical gridlock.", "Shared points, shared misery."
  ];

  const livePool = [
    "Blood pressure rising rapidly.", "Screaming at the television screen intensifies.",
    "Fingernails completely chewed down.", "Absolute pure drama unfolding right now.",
    "Big implications on the live draft order here."
  ];

  const topPool = [
    "Enjoys the view from the summit. Smells like success.", "Currently looking down on the rest of you peasants.",
    "Setting the pace. Can anyone actually catch them?", "Comfortable at the top. For now.", "Earning that #1 draft pick pedigree."
  ];

  const bottomPool = [
    "Anchors the table. Someone get this man a map.", "Holding onto the wooden spoon with a death grip.",
    "Stuck in the cellar. SOS signal has been deployed.", "Looking up at the rest of the league. Long way back.", "Currently managing the crisis zone."
  ];

  const fontHypePool = [
    "Massive test incoming. Pray for them.", "Huge stakes on the line. Gents, grab your popcorn.",
    "A seasonal defining fixture right here.", "Major leaderboard movements hanging in the balance.", "Time to see what they are truly made of."
  ];

  const recentFinishedMatches = allMatches.filter(m => {
    if (m.status !== 'FINISHED') return false;
    const matchEndMs = new Date(m.utcDate).getTime();
    const gapMs = currentExecutionMs - matchEndMs;
    return gapMs > 0 && gapMs <= (86400000 + 7200000); 
  });

  if (recentFinishedMatches.length > 0) {
    recentFinishedMatches.forEach(m => {
      const homeName = m.homeTeam?.name || '';
      const awayName = m.awayTeam?.name || '';
      const homeTLA = m.homeTeam?.tla || 'TBD';
      const awayTLA = m.awayTeam?.tla || 'TBD';
      const homeScore = m.score?.fullTime?.home ?? 0;
      const awayScore = m.score?.fullTime?.away ?? 0;

      const homeManager = sortedTeams.find(t => t.country === homeName)?.manager;
      const awayManager = sortedTeams.find(t => t.country === awayName)?.manager;

      if (!homeManager && !awayManager) return;

      if (homeManager && awayManager) {
        if (homeScore === awayScore) {
          commentaryLines.push(`📢 DRAW: ${homeTLA} ${homeScore}-${awayScore} ${awayTLA} • ${homeManager} and ${awayManager} ${pickRandom(drawPool)}`);
        } else {
          const winTLA = homeScore > awayScore ? homeTLA : awayTLA;
          const winManager = homeScore > awayScore ? homeManager : awayManager;
          const loseManager = homeScore > awayScore ? awayManager : homeManager;
          const scoreStr = homeScore > awayScore ? `${homeScore}-${awayScore}` : `${awayScore}-${homeScore}`;
          commentaryLines.push(`⚽ RESULT: ${winManager}'s ${winTLA} defeats ${loseManager} ${scoreStr} • ${pickRandom(winPool)}`);
        }
      } else {
        const activeManager = homeManager || awayManager;
        const activeTLA = homeManager ? homeTLA : awayTLA;
        const oppTLA = homeManager ? awayTLA : homeTLA;
        const activeScore = homeManager ? homeScore : awayScore;
        const oppScore = homeManager ? awayScore : homeScore;

        if (activeScore === oppScore) {
          commentaryLines.push(`📢 RESULT: ${activeManager} (${activeTLA}) draws ${activeScore}-${oppScore} against ${oppTLA} • ${pickRandom(drawPool)}`);
        } else if (activeScore > oppScore) {
          commentaryLines.push(`⚽ RESULT: Big win for ${activeManager} (${activeTLA}), beating ${oppTLA} ${activeScore}-${oppScore} • ${pickRandom(winPool)}`);
        } else {
          commentaryLines.push(`❌ RESULT: Tough loss for ${activeManager} (${activeTLA}), falling ${activeScore}-${oppScore} to ${oppTLA} • ${pickRandom(losePool)}`);
        }
      }
    });
  }

  const liveMatches = allMatches.filter(m => m.status === 'IN_PLAY' || m.status === 'LIVE' || m.status === 'PAUSED');
  
  if (liveMatches.length > 0) {
    liveMatches.forEach(m => {
      const homeName = m.homeTeam?.name || '';
      const awayName = m.awayTeam?.name || '';
      const homeTLA = m.homeTeam?.tla || 'TBD';
      const awayTLA = m.awayTeam?.tla || 'TBD';
      const homeScore = m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0;
      const awayScore = m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0;
      
      const homeManager = sortedTeams.find(t => t.country === homeName)?.manager;
      const awayManager = sortedTeams.find(t => t.country === awayName)?.manager;

      if (!homeManager && !awayManager) return;

      const statusSuffix = m.status === 'PAUSED' ? ' (HT)' : '';

      if (homeManager && awayManager) {
        commentaryLines.push(`🔥 LIVE MATCH: ${homeTLA} ${homeScore}-${awayScore} ${awayTLA}${statusSuffix} • ${homeManager} vs ${awayManager} is heating up! ${pickRandom(livePool)}`);
      } else {
        const managerInGame = homeManager || awayManager;
        commentaryLines.push(`🔥 LIVE: ${homeTLA} ${homeScore}-${awayScore} ${awayTLA}${statusSuffix} • ${managerInGame} is sweating on this... ${pickRandom(livePool)}`);
      }
    });
  }

  if (sortedTeams.length >= 2) {
    const leader = sortedTeams[0];
    const cellar = sortedTeams[sortedTeams.length - 1];
    commentaryLines.push(`👑 LEADER: ${leader.manager} ${pickRandom(topPool)}`, `🥄 Spoon Watch: ${cellar.manager} ${pickRandom(bottomPool)}`);
  }

  const upcomingMatches = allMatches.filter(m => {
    if (m.status !== 'TIMED' && m.status !== 'SCHEDULED') return false;
    const kickoffMs = new Date(m.utcDate).getTime();
    const gapMs = kickoffMs - currentExecutionMs;
    return gapMs > 0 && gapMs <= 86400000;
  });

  if (upcomingMatches.length > 0) {
    for (const nextGame of upcomingMatches) {
      const homeName = nextGame.homeTeam?.name || '';
      const awayName = nextGame.awayTeam?.name || '';
      const homeManager = sortedTeams.find(t => t.country === homeName)?.manager;
      const awayManager = sortedTeams.find(t => t.country === awayName)?.manager;

      if (homeManager || awayManager) {
        const homeLabel = homeManager || nextGame.homeTeam?.tla || 'TBD';
        const awayLabel = awayManager || nextGame.awayTeam?.tla || 'TBD';
        commentaryLines.push(`📅 NEXT UP: ${homeLabel} vs ${awayLabel} • ${pickRandom(fontHypePool)}`);
        break; 
      }
    }
  }

  if (commentaryLines.length === 0) {
    commentaryLines.push("🏆 World Cup Draft Decider • Live calculation sequence processing hourly.");
  }

  return commentaryLines.join("   •   ");
}

async function sync() {
  try {
    const currentSyncTime = new Date();
    const currentSyncTimeISO = currentSyncTime.toISOString();

    console.log("Checking current live flag state in database...");
    const { data: flagCheck, error: flagError } = await supabase
      .from('world_cup_leaderboard')
      .select('notes_bool, updated_at')
      .limit(1);

    if (flagError) throw flagError;

    if (flagCheck && flagCheck.length > 0) {
      const isLeagueActivelyPlaying = flagCheck[0].notes_bool === true;
      const lastUpdate = new Date(flagCheck[0].updated_at);
      const minutesSinceLastUpdate = (currentSyncTime.getTime() - lastUpdate.getTime()) / 1000 / 60;

      if (!isLeagueActivelyPlaying && minutesSinceLastUpdate < 55) {
        console.log(`💤 Smart Exit: No live league matches active. Skipping run.`);
        return; 
      }
    }

    // Pull current managers and their country strings out of Supabase first
    const { data: dbTeams, error: dbError } = await supabase.from('world_cup_leaderboard').select('*');
    if (dbError) throw dbError;

    console.log("Bulk fetching competition fixtures dataset...");
    const fixturesRes = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY }
    });
    const fixturesJson = await fixturesRes.json();
    const allMatches = fixturesJson.matches || [];

    const nextMatchMap = {};
    const liveMatchMap = {};
    const lastFinishedMatchMap = {};
    const matchWinnersSet = new Set();
    
    // Core aggregation object map
    const dynamicStatsMap = {};

    // BUGFIX: Pre-populate the map with your actual database countries before processing matches.
    // This ensures all teams start at baseline 0 instead of running into undefined reference drops.
    dbTeams.forEach(team => {
      dynamicStatsMap[team.country] = {
        wins: 0, draws: 0, losses: 0,
        gf: 0, ga: 0,
        stageString: 'GROUP_STAGE',
        matchStatus: 'TIMED',
        eliminated: false
      };
    });

    allMatches.forEach(m => {
      const homeName = m.homeTeam?.name;
      const awayName = m.awayTeam?.name;
      if (!homeName || !awayName) return;

      // Only calculate stats if the team belongs to one of your fantasy managers
      const hasHome = dynamicStatsMap.hasOwnProperty(homeName);
      const hasAway = dynamicStatsMap.hasOwnProperty(awayName);

      if (hasHome) {
        dynamicStatsMap[homeName].stageString = m.stage;
        dynamicStatsMap[homeName].matchStatus = m.status;
      }
      if (hasAway) {
        dynamicStatsMap[awayName].stageString = m.stage;
        dynamicStatsMap[awayName].matchStatus = m.status;
      }

      if (m.status === 'FINISHED') {
        const homeScore = m.score.fullTime.home ?? 0;
        const awayScore = m.score.fullTime.away ?? 0;

        if (hasHome) {
          dynamicStatsMap[homeName].gf += homeScore;
          dynamicStatsMap[homeName].ga += awayScore;
          lastFinishedMatchMap[homeName] = m;
        }
        if (hasAway) {
          dynamicStatsMap[awayName].gf += awayScore;
          dynamicStatsMap[awayName].ga += homeScore;
          lastFinishedMatchMap[awayName] = m;
        }

        if (m.score.winner === 'HOME_TEAM') {
          if (hasHome) {
            dynamicStatsMap[homeName].wins += 1;
            matchWinnersSet.add(homeName);
          }
          if (hasAway) {
            dynamicStatsMap[awayName].losses += 1;
            if (m.stage !== 'GROUP_STAGE') dynamicStatsMap[awayName].eliminated = true; // Knockout exit rule
          }
        } else if (m.score.winner === 'AWAY_TEAM') {
          if (hasAway) {
            dynamicStatsMap[awayName].wins += 1;
            matchWinnersSet.add(awayName);
          }
          if (hasHome) {
            dynamicStatsMap[homeName].losses += 1;
            if (m.stage !== 'GROUP_STAGE') dynamicStatsMap[homeName].eliminated = true; // Knockout exit rule
          }
        } else {
          if (hasHome) dynamicStatsMap[homeName].draws += 1;
          if (hasAway) dynamicStatsMap[awayName].draws += 1;
        }
      }

      // Live match display tracker pass
      if (m.status === 'IN_PLAY' || m.status === 'LIVE' || m.status === 'PAUSED') {
        const homeScore = m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0;
        const awayScore = m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0;
        
        const liveLabelText = m.status === 'PAUSED' ? "🔥 LIVE (HT)" : "🔥 LIVE";
        const liveBadgeHTML = `<span data-badge="live" style="background-color: #ef4444; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-right: 6px; display: inline-block; vertical-align: middle;">${liveLabelText}</span>`;

        if (hasHome) liveMatchMap[homeName] = `${liveBadgeHTML}vs ${m.awayTeam?.tla || 'TBD'} (${homeScore} - ${awayScore})`;
        if (hasAway) liveMatchMap[awayName] = `${liveBadgeHTML}vs ${m.homeTeam?.tla || 'TBD'} (${awayScore} - ${homeScore})`;
      }
    });

    // Populate upcoming match schedules
    allMatches.forEach(m => {
      if (m.status === "TIMED" || m.status === "SCHEDULED") {
        const homeName = m.homeTeam?.name;
        const awayName = m.awayTeam?.name;
        if (!homeName || !awayName) return;

        const kickoffMs = new Date(m.utcDate).getTime();
        const msUntilKickoff = kickoffMs - currentSyncTime.getTime();
        
        let badgeHTML = "";
        if (msUntilKickoff > 0 && msUntilKickoff <= 172800000) {
          const hoursRemaining = Math.ceil(msUntilKickoff / (1000 * 60 * 60));
          badgeHTML = `<span data-badge="countdown" style="background-color: ${hoursRemaining > 24 ? "#262626" : "#ffc107"}; color: ${hoursRemaining > 24 ? "#a3a3a3" : "#000000"}; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-right: 6px; display: inline-block; vertical-align: middle;">⚡ IN ${hoursRemaining}H</span>`;
        }

        if (dynamicStatsMap.hasOwnProperty(homeName) && !liveMatchMap[homeName] && !nextMatchMap[homeName]) {
          nextMatchMap[homeName] = `${badgeHTML}vs ${m.awayTeam?.tla || 'TBD'} • ${formatToAEST(m.utcDate)}`;
        }
        if (dynamicStatsMap.hasOwnProperty(awayName) && !liveMatchMap[awayName] && !nextMatchMap[awayName]) {
          nextMatchMap[awayName] = `${badgeHTML}vs ${m.homeTeam?.tla || 'TBD'} • ${formatToAEST(m.utcDate)}`;
        }
      }
    });

    let isAnyLeagueTeamCurrentlyLive = false;
    dbTeams.forEach(team => {
      if (liveMatchMap[team.country] && !dynamicStatsMap[team.country]?.eliminated) {
        isAnyLeagueTeamCurrentlyLive = true;
      }
    });

    const currentMockSortedTeams = [...dbTeams].map(team => {
      const stats = dynamicStatsMap[team.country] || {};
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

    // Commit calculated stats safely back to Supabase rows
    for (const team of dbTeams) {
      const stats = dynamicStatsMap[team.country];
      const nextMatchText = liveMatchMap[team.country] || nextMatchMap[team.country] || (stats?.eliminated ? "❌ Eliminated" : "TBD");

      let dbMatchTime = null;
      let dbMatchResult = null;
      let dbMatchGDChange = 0;

      const lastGame = lastFinishedMatchMap[team.country];
      if (lastGame) {
        dbMatchTime = lastGame.utcDate;
        const isHome = lastGame.homeTeam.name === team.country;
        const homeScore = lastGame.score.fullTime.home ?? 0;
        const awayScore = lastGame.score.fullTime.away ?? 0;
        
        if (homeScore === awayScore) {
          dbMatchResult = 'DRAW';
        } else if ((isHome && homeScore > awayScore) || (!isHome && awayScore > homeScore)) {
          dbMatchResult = 'WIN';
          dbMatchGDChange = isHome ? (homeScore - awayScore) : (awayScore - homeScore);
        } else {
          dbMatchResult = 'LOSS';
          dbMatchGDChange = isHome ? (homeScore - awayScore) : (awayScore - homeScore);
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

    console.log(`🚀 Sync finalized. Global Live state set to: ${isAnyLeagueTeamCurrentlyLive}`);
  } catch (err) {
    console.error("❌ Execution Error:", err.message);
    process.exit(1);
  }
}

sync();
