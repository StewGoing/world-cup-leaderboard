import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// RECONFIGURED DATE STRING FORMAT ENGINE (Order: Day, Date, Time)
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

// UPGRADED COMMENTARY ENGINE: Tracks live action, upcoming previews, rankings, AND 24-hour match results (League Only Validation)
function generateDraftCommentary(allMatches, sortedTeams) {
  const commentaryLines = [];
  const currentExecutionMs = new Date().getTime();
  
  // ==========================================
  // 1. RECENT RESULTS TRACKER (Last 24 Hours)
  // ==========================================
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

      // Find if league managers own these countries
      const homeManager = sortedTeams.find(t => t.country === homeName)?.manager;
      const awayManager = sortedTeams.find(t => t.country === awayName)?.manager;

      // LEAGUE VALIDATION FILTER: Skip the match entirely if NEITHER team belongs to your draft group
      if (!homeManager && !awayManager) return;

      // Fallbacks if one side is unallocated (e.g., playing an unpicked country)
      const displayHomeManager = homeManager || `${homeTLA} (Unallocated)`;
      const displayAwayManager = awayManager || `${awayTLA} (Unallocated)`;

      if (homeScore === awayScore) {
        commentaryLines.push(
          `📢 JUST IN: ${homeTLA} v ${awayTLA} ends in a ${homeScore}-${awayScore} draw! ${displayHomeManager} and ${displayAwayManager} split the points.`
        );
      } else {
        const winnerTLA = homeScore > awayScore ? homeTLA : awayTLA;
        const winnerManager = homeScore > awayScore ? displayHomeManager : displayAwayManager;
        const loserManager = homeScore > awayScore ? displayAwayManager : displayHomeManager;
        const marginText = homeScore > awayScore ? `${homeScore}-${awayScore}` : `${awayScore}-${homeScore}`;

        commentaryLines.push(
          `⚽ RESULT CENTRE: ${winnerManager} secures a massive victory, defeating ${loserManager} ${marginText}! Leaderboard shaking up...`
        );
      }
    });
  }

  // ==========================================
  // 2. LIVE OR HALF-TIME MATCHES (Active Now)
  // ==========================================
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

      // LEAGUE VALIDATION FILTER: Skip live matches if no one in your league has skin in the game
      if (!homeManager && !awayManager) return;

      const displayHomeManager = homeManager || `${homeTLA}`;
      const displayAwayManager = awayManager || `${awayTLA}`;
      const statusSuffix = m.status === 'PAUSED' ? ' (HALF-TIME BREAK)' : '';
      
      commentaryLines.push(
        `🔥 LIVE MATCH CENTRE: ${homeTLA} ${homeScore} - ${awayScore} ${awayTLA}${statusSuffix} • Massive stakes here for ${displayHomeManager} and ${displayAwayManager} right now!`
      );
    });
  }

  // ==========================================
  // 3. LIVE LEADERBOARD WATCH (Rank 1 vs Rank 12)
  // ==========================================
  if (sortedTeams.length >= 2) {
    const leader = sortedTeams[0];
    const cellar = sortedTeams[sortedTeams.length - 1];
    
    commentaryLines.push(
      `🏆 LEADERBOARD WATCH: ${leader.manager} is currently holding onto the prestigious #1 Draft Pick allocation with ${leader.country}!`,
      `🥄 SPOON ALARM: ${cellar.manager} is sitting down at the bottom in #12 position... long way back from here!`
    );
  }

  // ==========================================
  // 4. UPCOMING MATCHDAY HYPE (Next 24 Hours)
  // ==========================================
  const upcomingMatches = allMatches.filter(m => {
    if (m.status !== 'TIMED' && m.status !== 'SCHEDULED') return false;
    const kickoffMs = new Date(m.utcDate).getTime();
    const gapMs = kickoffMs - currentExecutionMs;
    return gapMs > 0 && gapMs <= 86400000;
  });

  if (upcomingMatches.length > 0) {
    // Loop through upcoming games until we find one that features a league manager
    for (const nextGame of upcomingMatches) {
      const homeName = nextGame.homeTeam?.name || '';
      const awayName = nextGame.awayTeam?.name || '';
      const homeManager = sortedTeams.find(t => t.country === homeName)?.manager;
      const awayManager = sortedTeams.find(t => t.country === awayName)?.manager;

      if (homeManager || awayManager) {
        const hypeTargets = [homeManager, awayManager].filter(Boolean).join(' vs ');
        commentaryLines.push(
          `📅 UPCOMING FIXTURE HYPE: Next up on the schedule is ${hypeTargets}! Good luck out there gents, major leaderboard movements incoming.`
        );
        break; // Only feature the single most imminent relevant game to avoid ticker bloating
      }
    }
  }

  if (commentaryLines.length === 0) {
    commentaryLines.push("🏆 World Cup Draft Decider Leaderboard • Updates processing live every hour!");
  }

  return commentaryLines.join("   •   ");
}

async function sync() {
  try {
    const currentSyncTime = new Date().toISOString();

    console.log("Bulk fetching live standings dataset...");
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

    // PASS 1: Isolate active live matches
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
      }

      if (m.status === 'IN_PLAY' || m.status === 'LIVE' || m.status === 'PAUSED') {
        const homeScore = m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0;
        const awayScore = m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0;
        
        const liveLabelText = m.status === 'PAUSED' ? "🔥 LIVE (HT)" : "🔥 LIVE";
        const liveBadgeHTML = `<span data-badge="live" style="background-color: #ef4444; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-right: 6px; display: inline-block; vertical-align: middle;">${liveLabelText}</span>`;

        if (homeName) {
          liveMatchMap[homeName] = `${liveBadgeHTML}vs ${awayTLA} (${homeScore} - ${awayScore})`;
        }
        if (awayName) {
          liveMatchMap[awayName] = `${liveBadgeHTML}vs ${homeTLA} (${awayScore} - ${homeScore})`;
        }
      }
    });

    // PASS 2: Gather future schedules
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
          
          // RECONFIGURED BACKGROUND COLORS: 
          // If > 24 hours out, use low-profile dark grey (#262626) with light grey text (#a3a3a3).
          // If <= 24 hours out, use high-visibility dark text on bright amber (#ffc107).
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

    // PASS 3: Intermediate internal data mapping
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

    // Build absolute rank positions inside memory to pass down to ticker generator
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
      const isCurrentlyPlayingLive = !!liveMatchMap[team.country];
      const nextMatchText = liveMatchMap[team.country] || nextMatchMap[team.country] || (live?.eliminated ? "❌ Eliminated" : "TBD");

      if (live) {
        const isWinner = matchWinnersSet.has(team.country);
        const stageWeightNum = calculateStageWeight(live.stageString, live.eliminated, live.matchStatus, isWinner);

        await supabase.from('world_cup_leaderboard').update({
          wins: live.wins,
          gd: live.gd,
          gf: live.gf, 
          ga: live.ga, 
          games_played: live.played,
          stage: stageWeightNum, 
          next_match: nextMatchText,
          notes: tickerPayloadString,
          notes_bool: isCurrentlyPlayingLive,
          updated_at: currentSyncTime
        }).eq('id', team.id);
      } else {
        await supabase.from('world_cup_leaderboard').update({
          next_match: nextMatchText,
          notes: tickerPayloadString,
          notes_bool: isCurrentlyPlayingLive,
          updated_at: currentSyncTime
        }).eq('id', team.id);
      }
    }

    console.log("🚀 Complete League-Commentary Ticker Sync finished successfully!");
  } catch (err) {
    console.error("❌ Execution Error:", err.message);
    process.exit(1);
  }
}
sync();
