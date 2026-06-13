import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FOOTBALL_DATA_API_KEY = process.env.FOOTBALL_DATA_API_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function formatToAEST(utcString) {
  if (!utcString) return '';
  const date = new Date(utcString);
  
  const timePart = date.toLocaleTimeString('en-AU', {
    timeZone: 'Australia/Sydney',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).toLowerCase().replace(' ', '');

  const dayPart = date.toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    weekday: 'short'
  });

  const datePart = date.toLocaleDateString('en-AU', {
    timeZone: 'Australia/Sydney',
    day: '2-digit',
    month: '2-digit'
  });

  return `${timePart}, ${dayPart} ${datePart}`;
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

async function fetchTopWorldCupStories() {
  try {
    const targetQuery = '"FIFA World Cup" -site:gov -site:mil -intitle:tax -intitle:economy';
    const encodedQuery = encodeURIComponent(targetQuery);
    
    const res = await fetch(`https://news.google.com/rss/search?q=${encodedQuery}+when:1d&hl=en-US&gl=US&ceid=US:en`);
    const xmlText = await res.text();
    
    const titleRegex = /<title>(.*?)<\/title>/g;
    const headlines = [];
    const processedTopics = [];
    let match;
    
    while ((match = titleRegex.exec(xmlText)) !== null) {
      let fullTitle = match[1];
      
      if (fullTitle.toLowerCase().includes('google news') || fullTitle.toLowerCase() === 'fifa world cup') {
        continue;
      }

      fullTitle = fullTitle.replace(/&amp;/g, '&')
                           .replace(/&quot;/g, '"')
                           .replace(/&apos;/g, "'")
                           .replace(/&gt;/g, '>')
                           .replace(/&lt;/g, '<');
      
      let cleanedHeadline = fullTitle;
      if (fullTitle.includes(' - ')) {
        cleanedHeadline = fullTitle.substring(0, fullTitle.lastIndexOf(' - ')).trim();
      }

      const lowercaseHeadline = cleanedHeadline.toLowerCase();
      const topicKeywords = ["iran", "referee", "ticket", "injured", "squad", "stadium", "visa", "artan", "messi", "ronaldo"];
      let isDuplicateCluster = false;

      for (const keyword of topicKeywords) {
        if (lowercaseHeadline.includes(keyword) && processedTopics.includes(keyword)) {
          isDuplicateCluster = true;
          break;
        }
      }

      if (isDuplicateCluster) continue;

      topicKeywords.forEach(keyword => {
        if (lowercaseHeadline.includes(keyword)) {
          processedTopics.push(keyword);
        }
      });
      
      headlines.push(`⚽ ${cleanedHeadline}`);
      
      if (headlines.length >= 3) break;
    }
    
    return headlines;
  } catch (err) {
    console.log("⚠️ News summary scraper encountered an issue. Using system fallbacks.");
    return [];
  }
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
        
        const liveLabelText = m.status === 'PAUSED' ? "🔥 LIVE (HT)" : "🔥 LIVE NOW";
        const liveBadgeHTML = `<span style="background-color: #ef4444; color: #fff; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-right: 6px; display: inline-block; vertical-align: middle;">${liveLabelText}</span> `;

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
          badgeHTML = `<span style="background-color: #ffc107; color: #000; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; margin-right: 6px; display: inline-block; vertical-align: middle;">⚡ IN ${hoursRemaining}H</span> `;
        }

        // RESTORED: Using the dot separator format "•" for clean desktop display spacing
        if (homeName && !liveMatchMap[homeName] && !nextMatchMap[homeName]) {
          nextMatchMap[homeName] = `${badgeHTML}vs ${awayTLA} • ${aestTime}`;
        }
        if (awayName && !liveMatchMap[awayName] && !nextMatchMap[awayName]) {
          nextMatchMap[awayName] = `${badgeHTML}vs ${homeTLA} • ${aestTime}`;
        }
      }
    });

    // TICKER PAYLOAD SUMMARY GENERATOR
    const headlines = [];
    const todayStr = new Date().toISOString().split('T')[0];
    const todaysMatches = allMatches.filter(m => m.utcDate.startsWith(todayStr));
    const liveMatches = allMatches.filter(m => m.status === 'IN_PLAY' || m.status === 'LIVE' || m.status === 'PAUSED');

    if (liveMatches.length > 0) {
      liveMatches.forEach(m => {
        const homeTLA = m.homeTeam?.tla || 'TBD';
        const awayTLA = m.awayTeam?.tla || 'TBD';
        const homeScore = m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0;
        const awayScore = m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0;
        const statusMarker = m.status === 'PAUSED' ? ' (HT)' : '';
        headlines.push(`🔥 LIVE NOW: ${homeTLA} ${homeScore} - ${awayScore} ${awayTLA}${statusMarker}`);
      });
    } else if (todaysMatches.length > 0) {
      const matchScheduleText = todaysMatches.map(m => {
        const homeTLA = m.homeTeam?.tla || 'TBD';
        const awayTLA = m.awayTeam?.tla || 'TBD';
        return `${homeTLA} vs ${awayTLA}`;
      }).join(' | ');
      headlines.push(`📅 TODAY'S SCHEDULE: ${matchScheduleText}`);
    }

    console.log("Compiling macro story summaries...");
    const topStories = await fetchTopWorldCupStories();
    topStories.forEach(story => headlines.push(story));

    if (headlines.length === 0) {
      headlines.push("Welcome to the World Cup Draft Decider Leaderboard!");
    }

    const tickerPayloadString = headlines.join("   •   ");

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

    console.log("🚀 Complete System Sync finished successfully!");
  } catch (err) {
    console.error("❌ Execution Error:", err.message);
    process.exit(1);
  }
}
sync();
