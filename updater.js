import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

function calculateStageWeight(stageString, isEliminated, matchStatus, isWinner) {
  if (!stageString) return 1;
  const stage = stageString.toUpperCase();
  if (stage.includes('GROUP')) return 1;
  if (stage.includes('LAST_32') || stage.includes('ROUND_OF_32')) return 3;
  if (stage.includes('LAST_16') || stage.includes('ROUND_OF_16')) return 4;
  if (stage.includes('QUARTER')) return 5;
  if (stage.includes('SEMI')) return 6;
  if (stage.includes('THIRD') || stage.includes('3RD')) {
    if (matchStatus === 'FINISHED') return isWinner ? 8 : 7;
    return 6;
  }
  if (stage.includes('FINAL')) {
    if (matchStatus === 'FINISHED') return isWinner ? 10 : 9;
    return 11;
  }
  return 1;
}

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
      
      const msSinceLastUpdate = currentSyncTime.getTime() - lastUpdate.getTime();
      const minutesSinceLastUpdate = msSinceLastUpdate / 1000 / 60;

      if (!isLeagueActivelyPlaying && minutesSinceLastUpdate < 55) {
        console.log(`💤 Smart Exit: No live league matches active. Last sync was ${Math.floor(minutesSinceLastUpdate)}m ago. Skipping run.`);
        return; 
      }
    }

    console.log("Heartbeat verified or hourly sequence hit. Fetching standings...");
    const standingsRes = await fetch('https://api.football-data.org/v4/competitions/WC/standings', {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY }
    });
    const standingsJson = await standingsRes.json();
    const groups = standingsJson.standings || [];

    console.log("Bulk fetching competition fixtures dataset...");
    const fixturesRes = await fetch('https://api.football-data.org/v4/competitions/WC/matches', {
      headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY }
    });
    const fixturesJson = await fixturesRes.json();
    const allMatches = fixturesJson.matches || [];

    const nextMatchMap = {};
    const teamLiveStageMap = {};
    const teamMatchStatusMap = {};
    const matchWinnersSet = new Set();
    const liveMatchMap = {};

    // Map to quickly cross-reference a team's most recently finished game object
    const lastFinishedMatchMap = {};

    allMatches.forEach(m => {
      const homeName = m.homeTeam?.name || '';
      const awayName = m.awayTeam?.name || '';
      const homeTLA = m.homeTeam?.tla || (homeName ? homeName.substring(0, 3).toUpperCase() : 'TBD');
      const awayTLA = m.awayTeam?.tla || (awayName ? awayName.substring(0, 3).toUpperCase() : 'TBD');

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

        // Keep track of the latest finished game for home and away countries to extract robust delta histories
        if (homeName) lastFinishedMatchMap[homeName] = m;
        if (awayName) lastFinishedMatchMap[awayName] = m;
      }

      if (m.status === 'IN_PLAY' || m.status === 'LIVE' || m.status === 'PAUSED') {
        const homeScore = m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0;
        const awayScore = m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0;
        
        const liveLabelText = m.status === 'PAUSED' ? "🔥 LIVE (HT)" : "🔥 LIVE";
        const liveBadgeHTML = `<span data-badge="live" style="background-color: #ef4444; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-right: 6px; display: inline-block; vertical-align: middle;">${liveLabelText}</span>`;

        if (homeName) liveMatchMap[homeName] = `${liveBadgeHTML}vs ${awayTLA} (${homeScore} - ${awayScore})`;
        if (awayName) liveMatchMap[awayName] = `${liveBadgeHTML}vs ${homeTLA} (${awayScore} - ${homeScore})`;
      }
    });

    allMatches.forEach(m => {
      if (m.status === "TIMED" || m.status === "SCHEDULED") {
        const homeName = m.homeTeam?.name || '';
        const awayName = m.awayTeam?.name || '';
        const homeTLA = m.homeTeam?.tla || 'TBD';
        const awayTLA = m.awayTeam?.tla || 'TBD';
        const aestTime = formatToAEST(m.utcDate);

        const kickoffMs = new Date(m.utcDate).getTime();
        const currentExecutionMs = new Date().getTime();
        const msUntilKickoff = kickoffMs - currentExecutionMs;
        
        const isWithin48Hours = msUntilKickoff > 0 && msUntilKickoff <= 172800000;
        
        let badgeHTML = "";
        if (isWithin48Hours) {
          const hoursRemaining = Math.ceil(msUntilKickoff / (1000 * 60 * 60));
          const badgeBgColor = hoursRemaining > 24 ? "#262626" : "#ffc107";
          const badgeTextColor = hoursRemaining > 24 ? "#a3a3a3" : "#000000";
          badgeHTML = `<span data-badge="countdown" style="background-color: ${badgeBgColor}; color: ${badgeTextColor}; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-right: 6px; display: inline-block; vertical-align: middle;">⚡ IN ${hoursRemaining}H</span>`;
        }

        if (homeName && !liveMatchMap[homeName] && !nextMatchMap[homeName]) {
          nextMatchMap[homeName] = `${badgeHTML}vs ${awayTLA} • ${aestTime}`;
        }
        if (awayName && !liveMatchMap[awayName] && !nextMatchMap[awayName]) {
          nextMatchMap[awayName] = `${badgeHTML}vs ${homeTLA} • ${aestTime}`;
        }
      }
    });

    const apiTeamsMap = {};
    groups.forEach(g => {
      if (g.table) {
        g.table.forEach(item => {
          if (item.team && item.team.name) {
            const countryName = item.team.name;
            const liveStage = teamLiveStageMap[countryName] || 'GROUP_STAGE';
            const currentStatus = teamMatchStatusMap[countryName] || 'TIMED';
            
            let isEliminated = false;
            if (g.table.indexOf(item) >= 2 && liveStage === 'GROUP_STAGE') isEliminated = true;

            apiTeamsMap[countryName] = {
              wins: item.won || 0,
              draws: item.draw || 0,
              losses: item.lost || 0,
              gd: item.goalDifference || 0,
              gf: item.goalsFor || 0,
              ga: item.goalsAgainst || 0,
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

    let isAnyLeagueTeamCurrentlyLive = false;
    dbTeams.forEach(team => {
      if (liveMatchMap[team.country] && !apiTeamsMap[team.country]?.eliminated) {
        isAnyLeagueTeamCurrentlyLive = true;
      }
    });

    const currentMockSortedTeams = [...dbTeams].map(team => {
      const liveData = apiTeamsMap[team.country] || {};
      return {
        ...team,
        stageWeight: calculateStageWeight(liveData.stageString, liveData.eliminated, liveData.matchStatus, matchWinnersSet.has(team.country)),
        wins: liveData.wins || 0,
        gd: liveData.gd || 0
      };
    }).sort((a, b) => {
      if (b.stageWeight !== a.stageWeight) return b.stageWeight - a.stageWeight;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return a.odds - b.odds;
    });

    const tickerPayloadString = generateDraftCommentary(allMatches, currentMockSortedTeams);
    console.log("Generated League Commentary Line:", tickerPayloadString);

    for (const team of dbTeams) {
      const live = apiTeamsMap[team.country];
      const nextMatchText = liveMatchMap[team.country] || nextMatchMap[team.country] || (live?.eliminated ? "❌ Eliminated" : "TBD");

      // Robust structured data column calculation variables
      let dbMatchTime = null;
      let dbMatchResult = null;
      let dbMatchGDChange = 0;

      const lastGame = lastFinishedMatchMap[team.country];
      if (lastGame) {
        dbMatchTime = lastGame.utcDate; // Log structural end whistle point safely
        
        const isHome = lastGame.homeTeam.name === team.country;
        const homeScore = lastGame.score.fullTime.home ?? 0;
        const awayScore = lastGame.score.fullTime.away ?? 0;
        
        // Map individual game metrics precisely
        if (homeScore === awayScore) {
          dbMatchResult = 'DRAW';
          dbMatchGDChange = 0;
        } else if ((isHome && homeScore > awayScore) || (!isHome && awayScore > homeScore)) {
          dbMatchResult = 'WIN';
          dbMatchGDChange = isHome ? (homeScore - awayScore) : (awayScore - homeScore);
        } else {
          dbMatchResult = 'LOSS';
          dbMatchGDChange = isHome ? (homeScore - awayScore) : (awayScore - homeScore); // Negative delta integer
        }
      }

      if (live) {
        const isWinner = matchWinnersSet.has(team.country);
        const stageWeightNum = calculateStageWeight(live.stageString, live.eliminated, live.matchStatus, isWinner);

        await supabase.from('world_cup_leaderboard').update({
          wins: live.wins,
          games_played: `${live.draws}/${live.losses}`, 
          gd: live.gd,
          stage: stageWeightNum, 
          next_match: nextMatchText,
          notes: tickerPayloadString,
          notes_bool: isAnyLeagueTeamCurrentlyLive, 
          updated_at: currentSyncTimeISO,
          // --- STRUCTURAL COLUMNS COMMITTED SECURELY ---
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
