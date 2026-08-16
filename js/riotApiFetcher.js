/**
 * riotApiFetcher.js - Champion build fetching from Riot Games API
 * 
 * TWO-TIER CACHING STRATEGY:
 * 1. Raw Match Cache (24h): Stores ALL match data found during collection
 *    - Even if searching for Ahri, we keep matches with OTHER champions
 *    - This maximizes data efficiency since every match has 10 champions
 * 2. Processed Build Cache (1h): Aggregated builds per champion
 *    - Pre-computed item frequencies from cached matches
 * 
 * CRON JOB OPTIMIZATION:
 * - Background job collects matches continuously
 * - Each collected match is processed for ALL 10 champions in it
 * - Next day's queries benefit from previous day's collection
 * 
 * RATE LIMITS (Development API Key):
 * - 20 requests per second
 * - 100 requests per 2 minutes
 * - With caching, daily queries cost ~0 API calls for popular champs
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION
// ============================================

const RIOT_API_KEY = process.env.RIOT_API_KEY;
const RIOT_API_HOST = 'https://americas.api.riotgames.com';

// File paths for two-tier cache
const MATCH_CACHE_FILE = path.join(__dirname, '..', '.riot_matches_cache.json');
const BUILD_CACHE_FILE = path.join(__dirname, '..', '.riot_builds_cache.json');

// Cache TTLs
const MATCH_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours for raw matches
const BUILD_CACHE_TTL_MS = 60 * 60 * 1000;      // 1 hour for processed builds

// Regional routing hosts for match data
const REGIONAL_HOSTS = {
  'na1': 'https://na1.api.riotgames.com',
  'br1': 'https://br1.api.riotgames.com',
  'la1': 'https://la1.api.riotgames.com',
  'la2': 'https://la2.api.riotgames.com',
  'oc1': 'https://oc1.api.riotgames.com',
  'euw1': 'https://euw1.api.riotgames.com',
  'eun1': 'https://eun1.api.riotgames.com',
  'ru': 'https://ru.api.riotgames.com',
  'tr1': 'https://tr1.api.riotgames.com',
  'kr': 'https://kr.api.riotgames.com',
  'jp1': 'https://jp1.api.riotgames.com',
  'sg2': 'https://sg2.api.riotgames.com',
  'th2': 'https://th2.api.riotgames.com',
  'tw2': 'https://tw2.api.riotgames.com',
  'vn2': 'https://vn2.api.riotgames.com',
  'pbe1': 'https://pbe1.api.riotgames.com'
};

const SUMMONER_HOST = 'https://americas.api.riotgames.com';

const CONFIG = {
  matchesPerRegion: parseInt(process.env.RIOT_MATCHES_PER_REGION || '20'),
  regions: (process.env.RIOT_REGIONS || 'na1,euw1,kr').split(','),
  minGamesForBuild: parseInt(process.env.RIOT_MIN_GAMES || '10'),
  maxConcurrentRequests: parseInt(process.env.RIOT_MAX_CONCURRENT || '5'),
  requestDelayMs: parseInt(process.env.RIOT_REQUEST_DELAY || '100'),
  summonersPerRegion: parseInt(process.env.RIOT_SUMMONERS_PER_REGION || '50'),
  matchesPerSummoner: parseInt(process.env.RIOT_MATCHES_PER_SUMMONER || '20')
};

// ============================================
// TWO-TIER CACHING SYSTEM
// ============================================

let matchCache = {};  // Raw match data (24h TTL)
let buildCache = {};  // Processed builds (1h TTL)

/**
 * Load match cache from disk
 */
function loadMatchCache() {
  try {
    if (fs.existsSync(MATCH_CACHE_FILE)) {
      const data = fs.readFileSync(MATCH_CACHE_FILE, 'utf8');
      const parsed = JSON.parse(data);
      const now = Date.now();
      
      // Filter expired matches
      matchCache = {};
      Object.entries(parsed).forEach(([matchId, entry]) => {
        if (now - entry.timestamp < MATCH_CACHE_TTL_MS) {
          matchCache[matchId] = entry;
        }
      });
      
      console.log(`[RiotAPI] Loaded ${Object.keys(matchCache).length} matches from cache`);
    }
  } catch (e) {
    console.warn('[RiotAPI] Failed to load match cache:', e.message);
  }
}

/**
 * Save match cache to disk
 */
function saveMatchCache() {
  try {
    const data = JSON.stringify(matchCache, null, 2);
    fs.writeFileSync(MATCH_CACHE_FILE, data, 'utf8');
    console.log(`[RiotAPI] Saved ${Object.keys(matchCache).length} matches to cache`);
  } catch (e) {
    console.warn('[RiotAPI] Failed to save match cache:', e.message);
  }
}

/**
 * Load build cache from disk
 */
function loadBuildCache() {
  try {
    if (fs.existsSync(BUILD_CACHE_FILE)) {
      const data = fs.readFileSync(BUILD_CACHE_FILE, 'utf8');
      const parsed = JSON.parse(data);
      const now = Date.now();
      
      // Filter expired builds
      buildCache = {};
      Object.entries(parsed).forEach(([champName, entry]) => {
        if (now - entry.timestamp < BUILD_CACHE_TTL_MS) {
          buildCache[champName] = entry;
        }
      });
      
      console.log(`[RiotAPI] Loaded ${Object.keys(buildCache).length} builds from cache`);
    }
  } catch (e) {
    console.warn('[RiotAPI] Failed to load build cache:', e.message);
  }
}

/**
 * Save build cache to disk
 */
function saveBuildCache() {
  try {
    const data = JSON.stringify(buildCache, null, 2);
    fs.writeFileSync(BUILD_CACHE_FILE, data, 'utf8');
    console.log(`[RiotAPI] Saved ${Object.keys(buildCache).length} builds to cache`);
  } catch (e) {
    console.warn('[RiotAPI] Failed to save build cache:', e.message);
  }
}

/**
 * Add a match to cache (keeps ALL matches, not just for target champion)
 * @param {string} matchId - Match ID
 * @param {object} matchData - Full match data from Riot API
 */
function cacheMatch(matchId, matchData) {
  if (!matchData || !matchData.info) return;
  
  matchCache[matchId] = {
    timestamp: Date.now(),
    data: matchData
  };
  
  // Auto-save every 10 matches
  if (Object.keys(matchCache).length % 10 === 0) {
    saveMatchCache();
  }
}

/**
 * Get cached match by ID
 * @param {string} matchId - Match ID
 * @returns {object|null} Match data or null
 */
function getCachedMatch(matchId) {
  const entry = matchCache[matchId];
  if (!entry) return null;
  
  // Check TTL
  if (Date.now() - entry.timestamp >= MATCH_CACHE_TTL_MS) {
    delete matchCache[matchId];
    return null;
  }
  
  return entry.data;
}

/**
 * Process ALL cached matches to extract builds for ALL champions
 * This is the key optimization: one match gives us data for 10 champions
 * @returns {object} Map of champion -> build data
 */
function processAllCachedMatches() {
  const matchIds = Object.keys(matchCache);
  if (matchIds.length === 0) {
    console.log('[RiotAPI] No matches to process');
    return {};
  }
  
  console.log(`[RiotAPI] Processing ${matchIds.length} matches for all champions...`);
  
  // Structure: { "Ahri": { items: {}, games: 0, wins: 0 }, ... }
  const champStats = {};
  
  for (const matchId of matchIds) {
    const match = matchCache[matchId].data;
    if (!match?.info?.participants) continue;
    
    for (const p of match.info.participants) {
      const champName = getChampionName(p.champId);
      if (champName === 'Unknown') continue;
      
      if (!champStats[champName]) {
        champStats[champName] = { items: {}, games: 0, wins: 0 };
      }
      
      champStats[champName].games++;
      if (p.win) champStats[champName].wins++;
      
      // Extract items
      const items = [];
      for (let i = 0; i <= 6; i++) {
        const itemId = p[`item${i}`];
        if (itemId && itemId > 0) {
          items.push(itemId);
        }
      }
      
      items.forEach(itemId => {
        champStats[champName].items[itemId] = (champStats[champName].items[itemId] || 0) + 1;
      });
    }
  }
  
  // Convert to build format
  const builds = {};
  Object.entries(champStats).forEach(([champName, stats]) => {
    const sortedItems = Object.entries(stats.items)
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => parseInt(id));
    
    builds[champName] = {
      coreItems: sortedItems.slice(0, 6),
      situationalItems: sortedItems.slice(6, 14),
      gamesAnalyzed: stats.games,
      winRate: stats.games > 0 ? stats.wins / stats.games : 0,
      source: 'riot_api_batch',
      lastUpdated: new Date().toISOString()
    };
  });
  
  // Merge with existing build cache
  buildCache = { ...buildCache, ...builds };
  saveBuildCache();
  
  console.log(`[RiotAPI] Processed builds for ${Object.keys(builds).length} champions`);
  return builds;
}

// Auto-save caches periodically
setInterval(() => {
  saveMatchCache();
  saveBuildCache();
}, 5 * 60 * 1000);

// Save on shutdown
process.on('SIGTERM', () => {
  saveMatchCache();
  saveBuildCache();
});
process.on('SIGINT', () => {
  saveMatchCache();
  saveBuildCache();
});

// ============================================
// RATE LIMIT HANDLING
// ============================================

class RateLimitedQueue {
  constructor(maxConcurrent, delayMs) {
    this.maxConcurrent = maxConcurrent;
    this.delayMs = delayMs;
    this.running = 0;
    this.queue = [];
  }

  async add(task) {
    return new Promise((resolve, reject) => {
      this.queue.push({ task, resolve, reject });
      this._process();
    });
  }

  async _process() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const { task, resolve, reject } = this.queue.shift();
      this.running++;
      
      task()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          this.running--;
          setTimeout(() => this._process(), this.delayMs);
        });
    }
  }
}

// Global rate-limited queue for Riot API requests
const riotQueue = new RateLimitedQueue(CONFIG.maxConcurrentRequests, CONFIG.requestDelayMs);

// ============================================
// RIOT API CLIENT
// ============================================

const riotClient = axios.create({
  baseURL: RIOT_API_HOST,
  headers: {
    'X-Riot-Token': RIOT_API_KEY,
    'Accept': 'application/json'
  },
  timeout: 30000
});

/**
 * Make a rate-limited request to Riot API
 * @param {string} method - HTTP method
 * @param {string} url - Request URL
 * @param {object} options - Axios options
 * @returns {Promise<any>} Response data
 */
async function riotRequest(method, url, options = {}) {
  return riotQueue.add(async () => {
    try {
      const response = await riotClient.request({ method, url, ...options });
      return response.data;
    } catch (error) {
      if (error.response) {
        const status = error.response.status;
        
        // Handle rate limiting
        if (status === 429) {
          const retryAfter = error.response.headers['retry-after'] || 5;
          console.log(`[RiotAPI] Rate limited, waiting ${retryAfter}s`);
          await new Promise(r => setTimeout(r, retryAfter * 1000));
          return riotRequest(method, url, options); // Retry
        }
        
        // Handle not found
        if (status === 404) {
          throw new Error('Not found');
        }
        
        // Handle forbidden
        if (status === 403) {
          throw new Error('Invalid API key');
        }
      }
      throw error;
    }
  });
}

// ============================================
// CHAMPION NAME MAPPING
// ============================================

// Map Riot API champion names to our internal names
const CHAMPION_NAME_MAP = {
  'KSante': "K'Sante",
  'BelVeth': "Bel'Veth",
  'KogMaw': "Kog'Maw",
  'RekSai': "Rek'Sai",
  'JarvanIV': "Jarvan IV",
  'DrMundo': "Dr. Mundo",
  'MasterYi': "Master Yi",
  'TwistedFate': "Twisted Fate",
  'MissFortune': "Miss Fortune",
  'LeeSin': "Lee Sin",
  'MonkeyKing': "Wukong",
  'Renekton': "Renekton",
  'AurelionSol': "Aurelion Sol",
  'XinZhao': "Xin Zhao",
  'TahmKench': "Tahm Kench",
  'NunuWillump': "Nunu & Willump"
};

// Reverse mapping for lookups
const CHAMPION_ID_TO_NAME = {};
const CHAMPION_NAME_TO_ID = {};

async function loadChampionData() {
  try {
    // Fetch latest version
    const versionsResponse = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
    const latestVersion = versionsResponse.data[0];
    
    // Fetch champion data
    const champResponse = await axios.get(
      `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/en_US/champion.json`
    );
    
    const champions = champResponse.data.data;
    for (const [name, data] of Object.entries(champions)) {
      const id = String(data.key);
      CHAMPION_ID_TO_NAME[id] = name;
      CHAMPION_NAME_TO_ID[name.toLowerCase()] = id;
    }
    
    console.log(`[RiotAPI] Loaded ${Object.keys(CHAMPION_ID_TO_NAME).length} champions`);
  } catch (e) {
    console.error('[RiotAPI] Failed to load champion data:', e.message);
  }
}

// Load champion data on startup
loadChampionData();

/**
 * Get champion ID from name
 * @param {string} name - Champion name
 * @returns {string|null} Champion ID or null
 */
function getChampionId(name) {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return CHAMPION_NAME_TO_ID[normalized] || null;
}

/**
 * Get standardized champion name from ID
 * @param {string} id - Champion ID
 * @returns {string} Champion name
 */
function getChampionName(id) {
  return CHAMPION_ID_TO_NAME[String(id)] || 'Unknown';
}

// ============================================
// MATCH DATA FETCHING
// ============================================

/**
 * Get summoner by name from a specific region
 * @param {string} summonerName - Summoner name
 * @param {string} region - Region tag (na1, euw1, kr, etc.)
 * @returns {Promise<object|null>} Summoner data or null
 */
async function getSummonerByName(summonerName, region) {
  const cacheKey = `${region}:${summonerName.toLowerCase()}`;
  
  // Check cache
  if (summonerCache[cacheKey]) {
    const cached = summonerCache[cacheKey];
    if (Date.now() - cached.timestamp < 3600000) { // 1 hour cache
      return cached.data;
    }
  }
  
  const host = region === 'na1' || region === 'br1' || region === 'la1' || region === 'la2' || region === 'oc1'
    ? SUMMONER_HOST
    : REGIONAL_HOSTS[region];
  
  try {
    const encodedName = encodeURIComponent(summonerName);
    const data = await riotRequest('GET', `${host}/lol/summoner/v4/summoners/by-name/${encodedName}`);
    
    summonerCache[cacheKey] = {
      data,
      timestamp: Date.now()
    };
    
    return data;
  } catch (e) {
    if (e.message === 'Not found') {
      return null;
    }
    throw e;
  }
}

/**
 * Get match IDs for a summoner
 * @param {string} puuid - Summoner PUUID
 * @param {string} region - Region tag
 * @param {number} count - Number of matches to fetch
 * @returns {Promise<string[]>} Array of match IDs
 */
async function getMatchIds(puuid, region, count = 20) {
  // Route match-v5 requests through americas host
  const host = SUMMONER_HOST;
  
  try {
    const data = await riotRequest(
      'GET',
      `${host}/lol/match/v5/matches/by-puuid/${puuid}/ids?start=0&count=${Math.min(count, 100)}`
    );
    return data;
  } catch (e) {
    console.error(`[RiotAPI] Failed to get matches for ${puuid}:`, e.message);
    return [];
  }
}

/**
 * Get detailed match data
 * @param {string} matchId - Match ID (includes region prefix like NA1_1234567890)
 * @returns {Promise<object|null>} Match data or null
 */
async function getMatch(matchId) {
  try {
    const data = await riotRequest('GET', `${SUMMONER_HOST}/lol/match/v5/matches/${matchId}`);
    return data;
  } catch (e) {
    console.error(`[RiotAPI] Failed to get match ${matchId}:`, e.message);
    return null;
  }
}

/**
 * Extract item builds from a match for a specific champion
 * @param {object} match - Match data
 * @param {string} championId - Champion ID to filter by
 * @returns {Array<{items: number[], win: boolean, role: string}>} Build data
 */
function extractBuildsFromMatch(match, championId) {
  const builds = [];
  
  if (!match || !match.info || !match.info.participants) {
    return builds;
  }
  
  for (const participant of match.info.participants) {
    // Filter by champion
    if (String(participant.champId) !== String(championId)) {
      continue;
    }
    
    // Extract items (item0-item6)
    const items = [];
    for (let i = 0; i <= 6; i++) {
      const itemId = participant[`item${i}`];
      if (itemId && itemId > 0) {
        items.push(itemId);
      }
    }
    
    // Only include if player has at least 3 items (avoid incomplete games)
    if (items.length >= 3) {
      builds.push({
        items,
        win: participant.win,
        role: participant.role || participant.lane || 'Unknown',
        kills: participant.kills,
        deaths: participant.deaths,
        assists: participant.assists
      });
    }
  }
  
  return builds;
}

// ============================================
// BUILD AGGREGATION
// ============================================

/**
 * Analyze builds to find most common items
 * @param {Array} builds - Array of build objects
 * @param {number} coreSize - Number of core items to return
 * @returns {object} Aggregated build data
 */
function aggregateBuilds(builds, coreSize = 6) {
  if (builds.length === 0) {
    return { core: [], sit: [], role: 'Unknown', games: 0 };
  }
  
  // Count item frequencies
  const itemCounts = {};
  const roleCounts = {};
  let totalWins = 0;
  let totalGames = builds.length;
  
  for (const build of builds) {
    // Count items
    for (const itemId of build.items) {
      itemCounts[itemId] = (itemCounts[itemId] || 0) + 1;
    }
    
    // Count roles
    const role = build.role || 'Unknown';
    roleCounts[role] = (roleCounts[role] || 0) + 1;
    
    // Track wins
    if (build.win) {
      totalWins++;
    }
  }
  
  // Sort items by frequency
  const sortedItems = Object.entries(itemCounts)
    .sort((a, b) => b[1] - a[1]);
  
  // Get core items (most frequent)
  const coreItemIds = sortedItems.slice(0, coreSize).map(([id]) => parseInt(id));
  
  // Get situational items (next most frequent, excluding core)
  const coreSet = new Set(coreItemIds);
  const sitItemIds = sortedItems
    .filter(([id]) => !coreSet.has(parseInt(id)))
    .slice(0, 14)
    .map(([id]) => parseInt(id));
  
  // Determine most common role
  const mostCommonRole = Object.entries(roleCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
  
  return {
    coreItemIds,
    sitItemIds,
    role: mostCommonRole,
    games: totalGames,
    winRate: totalWins / totalGames
  };
}

// ============================================
// ITEM NAME RESOLUTION
// ============================================

let itemNameCache = {};
let lastItemCacheUpdate = 0;
const ITEM_CACHE_TTL = 3600000; // 1 hour

async function getItemNames(itemIds) {
  const now = Date.now();
  
  // Refresh cache if stale
  if (!itemNameCache || now - lastItemCacheUpdate > ITEM_CACHE_TTL) {
    await refreshItemCache();
  }
  
  return itemIds.map(id => itemNameCache[id] || `Unknown Item (${id})`);
}

async function refreshItemCache() {
  try {
    const versionsResponse = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
    const latestVersion = versionsResponse.data[0];
    
    const itemsResponse = await axios.get(
      `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/en_US/item.json`
    );
    
    const items = itemsResponse.data?.data || {};
    itemNameCache = {};
    
    for (const [id, item] of Object.entries(items)) {
      if (item && item.name) {
        itemNameCache[id] = item.name;
      }
    }
    
    lastItemCacheUpdate = Date.now();
    console.log(`[RiotAPI] Item cache updated with ${Object.keys(itemNameCache).length} items`);
  } catch (e) {
    console.error('[RiotAPI] Failed to refresh item cache:', e.message);
  }
}

// Initial item cache load
refreshItemCache();

// ============================================
// MAIN BUILD FETCHING FUNCTION
// ============================================

/**
 * Get random high-elo summoners from leaderboard
 * @param {string} region - Region tag
 * @param {number} count - Number of summoners to fetch
 * @returns {Promise<Array>} Array of summoner objects with puuid
 */
async function getRandomSummonersFromLeaderboard(region, count = 10) {
  const host = REGIONAL_HOSTS[region];
  if (!host) {
    throw new Error(`Unsupported region: ${region}`);
  }
  try {
    // Get challenger/master tier players (more likely to play meta builds)
  const tiers = ['CHALLENGER', 'MASTER'];
  const allSummoners = [];
  
  for (const tier of tiers) {
    if (allSummoners.length >= count) break;
    
    const queue = 'RANKED_SOLO_5x5';
    const data = await riotRequest('GET', `${host}/lol/league/v4/challengerleagues/by-queue/${queue}`);
    
    // Extract summoner info from league entries
    if (data && data.entries) {
      // Shuffle and take some random entries
      const shuffled = data.entries.sort(() => 0.5 - Math.random());
      const needed = count - allSummoners.length;
      
      for (const entry of shuffled.slice(0, needed)) {
        if (entry.summonerId && entry.summonerName) {
          allSummoners.push({
            id: entry.summonerId,
            name: entry.summonerName,
            tier: entry.tier,
            rank: entry.rank
          });
        }
      }
    }
  }
  
  return allSummoners.slice(0, count);
  } catch (e) {
  console.error(`[RiotAPI] Failed to get leaderboard for ${region}:`, e.message);
  return [];
  }
}

/**
 * Get full summoner data including PUUID
 * @param {string} summonerId - Summoner ID
 * @param {string} region - Region tag
 * @returns {Promise<object|null>} Summoner data with puuid
 */
async function getSummonerById(summonerId, region) {
  const host = region === 'na1' || region === 'br1' || region === 'la1' || region === 'la2' || region === 'oc1'
  ? SUMMONER_HOST
  : REGIONAL_HOSTS[region];
  

  try {
  const data = await riotRequest('GET', `${host}/lol/summoner/v4/summoners/${summonerId}`);
  return data;
  } catch (e) {
  if (e.message === 'Not found') {
    return null;
  }
  throw e;
  }
}

/**
 * Background job: Collect matches from high-elo players across regions
 * KEY OPTIMIZATION: Saves ALL matches found, not just those with target champion
 * Each match contains data for 10 champions, maximizing API call efficiency
 * 
 * @param {string} championName - Champion name (trigger for collection)
 * @param {string[]} regions - Regions to query
 * @param {number} targetMatches - Target number of matches to collect
 * @returns {Promise<number>} Number of unique matches cached
 */
async function collectChampionMatches(championName, regions = CONFIG.regions, targetMatches = 100) {
  if (!RIOT_API_KEY) {
    throw new Error('RIOT_API_KEY environment variable not set');
  }
  
  const championId = getChampionId(championName);
  if (!championId) {
    throw new Error(`Unknown champion: ${championName}`);
  }
  
  console.log(`[RiotAPI] Collecting matches for ${championName} across ${regions.length} regions...`);
  
  const processedMatches = new Set(); // Avoid duplicates
  let matchesCollected = 0;
  
  // Load existing cache to skip already-cached matches
  loadMatchCache();
  
  for (const region of regions) {
    try {
      // Get high-elo summoners from this region's leaderboard
      const summoners = await getRandomSummonersFromLeaderboard(region, CONFIG.summonersPerRegion);
      console.log(`[RiotAPI] Got ${summoners.length} summoners from ${region} leaderboard`);
      
      for (const summonerInfo of summoners) {
        try {
          // Get full summoner data with PUUID
          const summoner = await getSummonerById(summonerInfo.id, region);
          if (!summoner || !summoner.puuid) continue;
          
          // Get recent match IDs
          const matchIds = await getMatchIds(summoner.puuid, region, CONFIG.matchesPerSummoner);
          
          // Fetch and cache ALL matches (not filtered by champion!)
          for (const matchId of matchIds) {
            if (processedMatches.has(matchId)) continue;
            if (getCachedMatch(matchId)) continue; // Skip if already in cache
            
            processedMatches.add(matchId);
            
            const match = await getMatch(matchId);
            if (match && match.info) {
              // Cache EVERY match - it has data for 10 champions!
              cacheMatch(matchId, match);
              matchesCollected++;
              
              if (matchesCollected >= targetMatches) break;
            }
          }
          
          if (matchesCollected >= targetMatches) break;
          
          // Small delay to avoid rate limits
          await new Promise(r => setTimeout(r, 150));
          
        } catch (e) {
          console.warn(`[RiotAPI] Error processing summoner ${summonerInfo.name}:`, e.message);
        }
      }
      
      if (matchesCollected >= targetMatches) break;
      
    } catch (e) {
      console.error(`[RiotAPI] Error processing region ${region}:`, e.message);
    }
  }
  
  // Process all cached matches to extract builds for ALL champions
  processAllCachedMatches();
  
  console.log(`[RiotAPI] Collection complete: ${matchesCollected} new matches cached`);
  return matchesCollected;
}

/**
 * Fetch champion build from Riot API by analyzing recent matches
 * Uses cached match data collected by background jobs
 * Falls back to live collection if insufficient cached data
 * 
 * @param {string} championName - Champion name (e.g., 'Ahri')
 * @param {string[]} regions - Regions to query
 * @param {number} minMatches - Minimum matches required
 * @returns {Promise<object|null>} Build object or null
 */
async function fetchBuildFromRiotAPI(championName, regions = CONFIG.regions, minMatches = CONFIG.minGamesForBuild) {
  if (!RIOT_API_KEY) {
  throw new Error('RIOT_API_KEY environment variable not set');
  }
  
  const championId = getChampionId(championName);
  if (!championId) {
  throw new Error(`Unknown champion: ${championName}`);
  }
  
  console.log(`[RiotAPI] Fetching build for ${championName} (ID: ${championId})`);
  
  let allBuilds = [];
  
  // Try to use pre-collected match data first (from cron job)
  const cacheKey = `matches_${championName.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
  const cachedMatches = global.championMatchCache?.[cacheKey];
  
  if (cachedMatches && Date.now() - cachedMatches.timestamp < CONFIG.cacheTTL) {
  console.log(`[RiotAPI] Using ${cachedMatches.builds.length} cached matches for ${championName}`);
  allBuilds = [...cachedMatches.builds];
  }
  
  // If we don't have enough cached data, collect more
  if (allBuilds.length < minMatches * 2) {
  console.log(`[RiotAPI] Cached data insufficient (${allBuilds.length}), collecting more...`);
  const targetMatches = Math.max(minMatches * 3, 50); // Aim for 3x minimum
  const newBuilds = await collectChampionMatches(championName, regions, targetMatches);
  allBuilds.push(...newBuilds);
  
  // Update cache with collected matches
  if (!global.championMatchCache) global.championMatchCache = {};
  global.championMatchCache[cacheKey] = {
    builds: allBuilds,
    timestamp: Date.now()
  };
  }
  
  console.log(`[RiotAPI] Total builds collected for ${championName}: ${allBuilds.length}`);
  
  if (allBuilds.length < minMatches) {
  console.log(`[RiotAPI] Insufficient data (${allBuilds.length} < ${minMatches})`);
  return null;
  }
  
  // Aggregate builds
  const aggregated = aggregateBuilds(allBuilds, 6);
  
  // Convert item IDs to names
  const coreItems = await getItemNames(aggregated.coreItemIds);
  const sitItems = await getItemNames(aggregated.sitItemIds);
  
  const result = {
  ch: championName,
  role: aggregated.role,
  builds: [{
    core: coreItems.filter(Boolean),
    sit: sitItems.filter(Boolean)
  }],
  source: {
    primary: 'riot_api',
    games: aggregated.games,
    winRate: Math.round(aggregated.winRate * 100),
    regions: regions,
    timestamp: Date.now()
  }
  };
  
  // Cache the result
  cacheBuild(championName, result);
  
  console.log(`[RiotAPI] Build generated for ${championName}: ${coreItems.length} core, ${sitItems.length} situational from ${aggregated.games} games`);
  
  return result;
}

/**
 * Get build with caching
 * @param {string} championName - Champion name
 * @returns {Promise<object|null>} Build object or null
 */
async function getBuild(championName) {
  // Check cache first
  const cached = getCachedBuild(championName);
  if (cached) {
    console.log(`[RiotAPI] Cache hit for ${championName}`);
    return cached;
  }
  
  try {
    const result = await fetchBuildFromRiotAPI(championName);
    return result;
  } catch (e) {
    console.error(`[RiotAPI] Failed to fetch build for ${championName}:`, e.message);
    return null;
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  fetchBuildFromRiotAPI,
  getBuild,
  getCachedBuild,
  cacheBuild,
  loadCache,
  saveCache,
  CONFIG,
  REGIONAL_HOSTS
};

// Load cache on module load
loadCache();
