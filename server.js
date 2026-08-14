/**
 * server.js - Backend proxy for ITEMDLE dynamic build fetching
 * 
 * Fetches builds from Mobalytics via Parse.bot API with server-side caching
 * 
 * USAGE:
 * 1. Install Node.js (v16+)
 * 2. npm install express cors axios
 * 3. Set PARSE_API_KEY environment variable (required)
 * 4. node server.js
 * 5. The server runs on http://localhost:3000
 * 
 * ENDPOINTS:
 * - GET /api/build/:champion - Get build for champion from Mobalytics via Parse.bot
 * - GET /api/builds - Get all cached builds
 * - GET /api/health - Health check
 * 
 * DEPLOYMENT:
 * - Deploy to Heroku, Render, Railway, or any Node.js hosting
 * - Set PORT and PARSE_API_KEY environment variables
 * - Configure CORS origins as needed
 * - Note: Server caches builds for 24h to minimize Parse.bot API usage
 * 
 * API SOURCE:
 * - Parse.bot Mobalytics API: https://parse.bot/marketplace/53405028-f65e-4c87-a55f-80a5b57efc50/mobalytics-gg-api
 * - Item names from Data Dragon (Riot Games)
 * - Scraper ID: e7dd7967-737e-472d-90c0-f106c9882b4e
 * 
 * CACHING:
 * - Builds cached in memory for 24 hours
 * - Item data cached for 1 hour
 * - Typical usage: ~30 Parse.bot API calls/month (well under 200 free tier limit)
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();

// ============================================
// ENVIRONMENT VALIDATION
// ============================================

const requiredEnvVars = {
  PARSE_API_KEY: 'Get your API key from: https://parse.bot/marketplace/53405028-f65e-4c87-a55f-80a5b57efc50/mobalytics-gg-api'
};

for (const [varName, helpText] of Object.entries(requiredEnvVars)) {
  if (!process.env[varName]) {
    console.error(`[server] ${varName} environment variable is required`);
    console.error(`[server] ${helpText}`);
    process.exit(1);
  }
}

const PORT = process.env.PORT || 3000;
const PARSE_API_KEY = process.env.PARSE_API_KEY;
const PARSE_API_URL = process.env.PARSE_API_URL || 'https://api.parse.bot/scraper/e7dd7967-737e-472d-90c0-f106c9882b4e';
const DD_API_URL = process.env.DD_API_URL || 'https://ddragon.leagueoflegends.com';

// Parse allowed origins from environment variable (comma-separated)
const getAllowedOrigins = () => {
  if (process.env.ALLOWED_ORIGINS) {
    return process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim());
  }
  // Default origins for development
  return ['http://localhost:8080', 'http://localhost:3000', 'http://127.0.0.1:8080'];
};

// ============================================
// SECURITY MIDDLEWARE
// ============================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for now as it may break Data Dragon image loading
  crossOriginEmbedderPolicy: false
}));

// Rate limiting for API endpoints
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later', fallback: 'hardcoded' },
  skip: (req) => req.path === '/api/health' // Don't rate limit health checks
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Enable CORS with configured origins
const allowedOrigins = getAllowedOrigins();
console.log(`[server] Allowed origins: ${allowedOrigins.join(', ')}`);

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  optionsSuccessStatus: 200
}));

// Trust proxy for correct IP detection (important for rate limiting in production)
app.set('trust proxy', true);

// ============================================
// SERVER-SIDE CACHING
// ============================================

// Build cache: championName -> { buildData, timestamp }
let buildCache = {};
const BUILD_CACHE_TTL = parseInt(process.env.BUILD_CACHE_TTL || '86400000'); // 24 hours default
const BUILD_CACHE_FILE = path.join(__dirname, '.build_cache.json');

// Cache save debounce timer
let cacheSaveTimeout = null;

// Item ID to name cache
let itemIdToNameCache = null;
let lastItemCacheUpdate = 0;
const ITEM_CACHE_TTL = 3600000; // 1 hour

// API call counter (for monitoring)
let apiCallCount = 0;

// Load build cache from file on startup
function loadBuildCache() {
  try {
    if (fs.existsSync(BUILD_CACHE_FILE)) {
      const data = fs.readFileSync(BUILD_CACHE_FILE, 'utf8');
      buildCache = JSON.parse(data);
      console.log(`[server] Loaded ${Object.keys(buildCache).length} cached builds from disk`);
    }
  } catch (e) {
    console.warn('[server] Failed to load build cache:', e.message);
    buildCache = {};
  }
}

// Save build cache to file
function saveBuildCache() {
  try {
    const data = JSON.stringify(buildCache, null, 2);
    fs.writeFileSync(BUILD_CACHE_FILE, data, 'utf8');
    console.log(`[server] Saved ${Object.keys(buildCache).length} builds to cache file`);
  } catch (e) {
    console.warn('[server] Failed to save build cache:', e.message);
  }
}

// Get cached build
function getCachedBuild(championName) {
  const normalizedName = championName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const cached = buildCache[normalizedName];
  
  if (cached && Date.now() - cached.timestamp < BUILD_CACHE_TTL) {
    return cached.data;
  }
  
  return null;
}

// Cache a build
function cacheBuild(championName, buildData) {
  const normalizedName = championName.toLowerCase().replace(/[^a-z0-9]/g, '');
  buildCache[normalizedName] = {
    data: buildData,
    timestamp: Date.now()
  };
  
  // Debounced save to file (saves after 1 second of inactivity)
  clearTimeout(cacheSaveTimeout);
  cacheSaveTimeout = setTimeout(saveBuildCache, 1000);
}

// Save cache on shutdown
function saveCacheOnExit() {
  saveBuildCache();
  console.log(`[server] Total Parse.bot API calls this session: ${apiCallCount}`);
}

// Load cache on startup
loadBuildCache();

// Save cache every 5 minutes
setInterval(saveBuildCache, 5 * 60 * 1000);

// Graceful shutdown
process.on('SIGTERM', () => {
  saveCacheOnExit();
  process.exit(0);
});

process.on('SIGINT', () => {
  saveCacheOnExit();
  process.exit(0);
});

// ============================================
// RATE LIMITING
// ============================================
// Rate limiting is now handled by express-rate-limit middleware
// Applied to all /api/* routes with 200 requests per 15 minutes per IP
// See: Security Middleware section above

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert technical error messages to user-friendly messages
 * @param {string} errorMessage - Technical error message
 * @returns {string} User-friendly error message
 */
function getUserFriendlyError(errorMessage) {
  const errorMap = {
    'Rate limited by Parse.bot API': 'Build service is currently busy. Using cached builds.',
    'Champion not found on Parse.bot API': 'Champion not found. Using fallback builds.',
    'Parse.bot API key invalid': 'Server configuration error. Please contact support.',
    'No build data in Parse.bot response': 'No build data available. Using fallback builds.',
    'Insufficient items in Parse.bot response': 'Could not retrieve complete build. Using fallback builds.',
    'Parse.bot API request failed': 'Could not connect to build service. Using cached builds.',
    'Failed to fetch item data from Data Dragon': 'Item data unavailable. Using cached item data.',
    'Network Error': 'Network error. Please check your connection.',
    'ETIMEDOUT': 'Request timed out. Please try again.',
    'ECONNREFUSED': 'Could not connect to the service. Please try again later.'
  };
  
  for (const [technical, friendly] of Object.entries(errorMap)) {
    if (errorMessage.includes(technical)) {
      return friendly;
    }
  }
  
  // Return a sanitized version of the original message
  return errorMessage.replace(/[^a-zA-Z0-9\s:.,-]/g, '');
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Starting items, consumables, and component items to exclude
const EXCLUDED_ITEM_NAMES = [
  'doran', 'health potion', 'mana potion', 'biscuit', 'elixir',
  'refillable potion', 'corrupting potion', 'rejuvenation bead',
  'faerie charm', 'ruby crystal', 'sapphire crystal', 'long sword',
  'cloth armor', 'null magic mantle', 'boots', 'boot', 'potion',
  'ward', 'totem', 'scrying', 'farsight', 'control ward', 'sweeper',
  // Component items
  'amplifying tome', 'blasting wand', 'needlessly large rod', 'sparring sword',
  'recurve bow', 'negatron cloak', 'chain vest', 'giant belt',
  'bf sword', 'pickaxe', 'large rod', 'vampiric scepter'
];

function isExcludedItem(name) {
  const normalized = norm(name);
  return EXCLUDED_ITEM_NAMES.some(excluded => normalized.includes(norm(excluded)));
}

// Fallback role detection
const DEFAULT_ROLES = {
  'ahri': 'Mid', 'lux': 'Mid', 'syndra': 'Mid', 'oriana': 'Mid',
  'viktor': 'Mid', 'brand': 'Mid', 'veigar': 'Mid', 'katarina': 'Mid',
  'ekko': 'Jungle', 'zed': 'Mid', 'khazix': 'Jungle', 'talon': 'Mid',
  'yasuo': 'Mid', 'yone': 'Mid', 'garen': 'Top', 'darius': 'Top',
  'sett': 'Top', 'mordekaiser': 'Top', 'aatrox': 'Top', 'jinx': 'ADC',
  'ashe': 'ADC', 'caitlyn': 'ADC', 'missfortune': 'ADC', 'kaisa': 'ADC',
  'ezreal': 'ADC', 'vayne': 'ADC', 'malphite': 'Top', 'ornn': 'Top',
  'amumu': 'Jungle', 'thresh': 'Support', 'lulu': 'Support'
};

// Map Parse.bot role names to our standard role names
const ROLE_MAP = {
  'MID': 'Mid',
  'MIDDLE': 'Mid',
  'TOP': 'Top',
  'JUNGLE': 'Jungle',
  'JNG': 'Jungle',
  'ADC': 'ADC',
  'BOTTOM': 'ADC',
  'SUPPORT': 'Support',
  'SUP': 'Support'
};

// ============================================
// ITEM DATA CACHING
// ============================================

// Get item name from ID using cached Data Dragon data
async function getItemName(itemId) {
  const now = Date.now();
  
  // If cache is empty or stale, fetch fresh data
  if (!itemIdToNameCache || now - lastItemCacheUpdate > ITEM_CACHE_TTL) {
    try {
      await fetchItemData();
    } catch (e) {
      console.error('[server] Failed to fetch item data from Data Dragon:', e.message);
    }
  }
  
  if (itemIdToNameCache && itemIdToNameCache[itemId]) {
    return itemIdToNameCache[itemId];
  }
  
  console.warn(`[server] Item ID ${itemId} not found in cache`);
  return `Unknown Item (${itemId})`;
}

// Fetch item data from Data Dragon
async function fetchItemData() {
  try {
    const versionResponse = await axios.get(`${DD_API_URL}/api/versions.json`, { timeout: 10000 });
    const latestVersion = versionResponse.data[0];
    
    const itemsResponse = await axios.get(`${DD_API_URL}/cdn/${latestVersion}/data/en_US/item.json`, { 
      timeout: 15000 
    });
    
    const items = itemsResponse.data?.data || {};
    
    itemIdToNameCache = {};
    for (const [id, item] of Object.entries(items)) {
      if (item && item.name) {
        const numericId = parseInt(id, 10);
        if (!isNaN(numericId)) {
          itemIdToNameCache[numericId] = item.name;
          itemIdToNameCache[id] = item.name;
        } else {
          itemIdToNameCache[id] = item.name;
        }
      }
    }
    
    lastItemCacheUpdate = Date.now();
    console.log(`[server] Item cache updated with ${Object.keys(itemIdToNameCache).length} items`);
    
  } catch (e) {
    console.error('[server] Failed to fetch item data:', e.message);
    try {
      const itemsResponse = await axios.get(`${DD_API_URL}/cdn/14.10.1/data/en_US/item.json`, { 
        timeout: 10000 
      });
      const items = itemsResponse.data?.data || {};
      itemIdToNameCache = {};
      for (const [id, item] of Object.entries(items)) {
        if (item && item.name) {
          const numericId = parseInt(id, 10);
          if (!isNaN(numericId)) {
            itemIdToNameCache[numericId] = item.name;
            itemIdToNameCache[id] = item.name;
          } else {
            itemIdToNameCache[id] = item.name;
          }
        }
      }
      lastItemCacheUpdate = Date.now();
      console.log(`[server] Item cache updated with fallback patch, ${Object.keys(itemIdToNameCache).length} items`);
    } catch (e2) {
      console.error('[server] Fallback item fetch also failed:', e2.message);
      throw e;
    }
  }
}

// ============================================
// PARSE.BOT API CALLS
// ============================================

async function fetchFromParseBot(championName, role = 'mid') {
  const normalizedName = championName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedRole = role.toLowerCase();
  const url = `${PARSE_API_URL}/get_champion_build?champion_slug=${normalizedName}&role=${normalizedRole}`;
  
  try {
    apiCallCount++;
    console.log(`[server] Parse.bot API call #${apiCallCount} for ${championName}`);
    
    const response = await axios.get(url, {
      headers: {
        'X-API-Key': PARSE_API_KEY,
        'Accept': 'application/json'
      },
      timeout: 30000
    });
    
    return response.data;
  } catch (error) {
    console.error(`[server] Parse.bot API error for ${championName}:`, error.message);
    
    if (error.response) {
      if (error.response.status === 429) {
        throw new Error('Rate limited by Parse.bot API');
      }
      if (error.response.status === 404) {
        throw new Error('Champion not found on Parse.bot API');
      }
      if (error.response.status === 401 || error.response.status === 403) {
        throw new Error('Parse.bot API key invalid');
      }
    }
    
    throw new Error(`Parse.bot API request failed: ${error.message}`);
  }
}

// ============================================
// ROLE DETECTION (via get_champion_stats)
// ============================================

// Cache: championKey -> { role, timestamp }. Roles rarely change, so reuse
// for the lifetime of the build cache (24h) to minimize Parse.bot credits.
const roleCache = {};
const ROLE_CACHE_TTL = parseInt(process.env.ROLE_CACHE_TTL || '86400000'); // 24h

/**
 * Fetch a champion's per-role stats from Parse.bot (get_champion_stats).
 * Returns the raw response data, or null on failure.
 */
async function fetchChampionStats(championName) {
  const normalizedName = championName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const url = `${PARSE_API_URL}/get_champion_stats?champion_slug=${normalizedName}`;

  try {
    apiCallCount++;
    console.log(`[server] Parse.bot stats API call #${apiCallCount} for ${championName}`);

    const response = await axios.get(url, {
      headers: {
        'X-API-Key': PARSE_API_KEY,
        'Accept': 'application/json'
      },
      timeout: 30000
    });

    return response.data;
  } catch (error) {
    console.error(`[server] Parse.bot stats API error for ${championName}:`, error.message);
    return null;
  }
}

/**
 * Detect a champion's most popular role by querying get_champion_stats and
 * picking the role with the highest pick rate. Falls back to DEFAULT_ROLES,
 * then 'Mid'. The Parse.bot get_champion_build endpoint treats role as an
 * INPUT only (it never echoes a role back), so we must determine it here.
 *
 * @param {string} championName - Display name (e.g. 'Lillia')
 * @returns {Promise<string>} Role ('Mid','Top','Jungle','ADC','Support')
 */
async function detectRole(championName) {
  const normalizedKey = championName.toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Cached?
  const cached = roleCache[normalizedKey];
  if (cached && Date.now() - cached.timestamp < ROLE_CACHE_TTL) {
    return cached.role;
  }

  // 2. Hardcoded override (fast path; also covers champions stats may omit)
  let role = DEFAULT_ROLES[normalizedKey] || null;

  // 3. Query stats for the most popular role
  if (!role) {
    const statsData = await fetchChampionStats(championName);
    const roles = statsData?.data?.roles;

    if (Array.isArray(roles) && roles.length > 0) {
      // Pick the role entry with the highest pick_rate (parse "%" strings)
      let best = null;
      let bestPick = -1;
      for (const r of roles) {
        if (!r || !r.role) continue;
        const mapped = ROLE_MAP[String(r.role).toUpperCase()];
        if (!mapped) continue;
        const pick = parseFloat(r.pick_rate) || 0;
        if (pick > bestPick) {
          bestPick = pick;
          best = mapped;
        }
      }
      if (best) {
        role = best;
        console.log(`[server] Detected role for ${championName}: ${role} (pick_rate ${bestPick}%)`);
      }
    }
  }

  // 4. Final fallback
  if (!role) {
    role = 'Mid';
    console.warn(`[server] Could not detect role for ${championName}, defaulting to ${role}`);
  }

  roleCache[normalizedKey] = { role, timestamp: Date.now() };
  return role;
}

// Process Parse.bot response to our format
// `detectedRole` is the role we queried get_champion_build with; the API does
// not return a role field, so we trust our own detection rather than the response.
async function processParseBotResponse(parseData, championName, detectedRole) {
  const buildData = parseData.data?.build;
  
  if (!buildData) {
    throw new Error('No build data in Parse.bot response');
  }
  
  // Role: use the role we detected and queried the build for. The Parse.bot
  // get_champion_build response does not include a role field.
  const role = detectedRole || 'Mid';
  
  // Extract items from the build
  const items = buildData.items || {};
  
  // Collect all item IDs from all categories
  const allItemTypes = ['starting_items', 'early_items', 'core_items', 'fourth_items', 'situational_items', 'boots'];
  const allItemIds = [];
  for (const type of allItemTypes) {
    if (items[type] && Array.isArray(items[type])) {
      allItemIds.push(...items[type]);
    }
  }
  
  // Convert all to names and deduplicate
  const seen = new Set();
  const allItemNames = [];
  
  for (const id of allItemIds) {
    if (!id) continue;
    const name = await getItemName(id);
    if (!name) continue;
    
    const nameNorm = norm(name);
    if (isExcludedItem(name)) continue;
    if (!seen.has(nameNorm)) {
      seen.add(nameNorm);
      allItemNames.push(name);
    }
  }
  
  // Split into core (first 6) and situational (rest)
  let coreItems = [];
  let sitItems = [];
  
  if (allItemNames.length >= 6) {
    coreItems = allItemNames.slice(0, 6);
    sitItems = allItemNames.slice(6, 20);
  } else {
    // Not enough items - try to get core from specific categories
    const coreIds = items.core_items || [];
    const fourthIds = items.fourth_items || [];
    const earlyIds = items.early_items || [];
    
    const combinedIds = [...coreIds, ...fourthIds, ...earlyIds];
    const combinedNames = [];
    const seenCombined = new Set();
    
    for (const id of combinedIds) {
      if (!id) continue;
      const name = await getItemName(id);
      if (!name) continue;
      
      const nameNorm = norm(name);
      if (isExcludedItem(name)) continue;
      if (!seenCombined.has(nameNorm)) {
        seenCombined.add(nameNorm);
        combinedNames.push(name);
      }
    }
    
    if (combinedNames.length >= 6) {
      coreItems = combinedNames.slice(0, 6);
      sitItems = combinedNames.slice(6, 20);
    } else {
      console.error(`[server] Only found ${allItemNames.length} items for ${championName}`);
      throw new Error('Insufficient items in Parse.bot response');
    }
  }
  
  console.log(`[server] Processed ${championName}: ${coreItems.length} core, ${sitItems.length} situational, role: ${role}`);
  
  return {
    core: coreItems.slice(0, 6),
    sit: sitItems.slice(0, 14),
    role: role
  };
}

// ============================================
// API ENDPOINTS
// ============================================

// Get build for a specific champion
app.get('/api/build/:champion', async (req, res) => {
  try {
    const { champion } = req.params;
    
    // Input validation
    if (!champion || typeof champion !== 'string') {
      return res.status(400).json({ 
        error: 'Invalid champion name: must be a non-empty string',
        fallback: 'hardcoded'
      });
    }
    
    // Sanitize and validate champion name
    const normalizedName = champion.trim();
    if (normalizedName.length === 0) {
      return res.status(400).json({ 
        error: 'Champion name cannot be empty',
        fallback: 'hardcoded'
      });
    }
    
    // Check for potentially malicious input
    if (normalizedName.length > 50) {
      return res.status(400).json({ 
        error: 'Champion name too long',
        fallback: 'hardcoded'
      });
    }
    
    // Detect the champion's most popular role (cached) BEFORE fetching the
    // build, because get_champion_build takes role as an input parameter.
    const role = await detectRole(normalizedName);
    
    // Check cache first
    const cachedBuild = getCachedBuild(normalizedName);
    if (cachedBuild) {
      console.log(`[server] Cache hit for ${normalizedName}`);
      // Add cached flag to the response
      const resultWithCacheFlag = JSON.parse(JSON.stringify(cachedBuild));
      if (resultWithCacheFlag.source) {
        resultWithCacheFlag.source.cached = true;
      }
      return res.json(resultWithCacheFlag);
    }
    
    // Not in cache, fetch from Parse.bot for the detected role
    let parseData;
    try {
      parseData = await fetchFromParseBot(normalizedName, role);
    } catch (e) {
      console.error(`[server] Failed to fetch from Parse.bot for ${normalizedName}:`, e.message);
      const userFriendlyError = getUserFriendlyError(e.message);
      return res.status(500).json({ 
        error: userFriendlyError,
        fallback: 'hardcoded'
      });
    }
    
    // Process response (role is already known; build.role mirrors it)
    let build;
    try {
      build = await processParseBotResponse(parseData, normalizedName, role);
    } catch (e) {
      console.error(`[server] Failed to process Parse.bot response for ${normalizedName}:`, e.message);
      const userFriendlyError = getUserFriendlyError(e.message);
      return res.status(500).json({ 
        error: userFriendlyError,
        fallback: 'hardcoded'
      });
    }
    
    if (!build.core || build.core.length < 6) {
      return res.status(404).json({ 
        error: 'Insufficient core items found in build data',
        fallback: 'hardcoded'
      });
    }
    
    // Build result (role was detected before the fetch)
    const result = {
      ch: normalizedName,
      role: build.role || role,
      builds: [{ core: build.core.slice(0, 6), sit: build.sit || [] }],
      source: { 
        primary: 'mobalytics-parse-api',
        timestamp: Date.now(),
        via: 'parse.bot',
        cached: false
      }
    };
    
    // Cache the result
    cacheBuild(normalizedName, result);
    
    res.json(result);
    
  } catch (e) {
    console.error(`[server] Error fetching build for ${req.params.champion}:`, e);
    const userFriendlyError = getUserFriendlyError(e.message || String(e));
    res.status(500).json({ 
      error: userFriendlyError,
      fallback: 'hardcoded'
    });
  }
});

// Get all cached builds
app.get('/api/builds', (req, res) => {
  const builds = {};
  for (const [key, value] of Object.entries(buildCache)) {
    builds[key] = value.data;
  }
  res.json({
    count: Object.keys(builds).length,
    builds: builds,
    apiCallCount: apiCallCount
  });
});

// Clear cache
app.post('/api/cache/clear', (req, res) => {
  buildCache = {};
  saveBuildCache();
  res.json({ status: 'ok', message: 'Cache cleared' });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: Date.now(),
    api: 'parse.bot',
    source: 'mobalytics.gg',
    itemsCached: itemIdToNameCache ? Object.keys(itemIdToNameCache).length : 0,
    buildsCached: Object.keys(buildCache).length,
    apiCallCount: apiCallCount
  });
});

// ============================================
// START SERVER
// ============================================

// Pre-fetch item data on startup
fetchItemData().catch(e => {
  console.warn('[server] Failed to pre-fetch item data:', e.message);
});

app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════════════════════════╗`);
  console.log(`  ║          ITEMDLE Backend Server                           ║`);
  console.log(`  ╠══════════════════════════════════════════════════════════════╣`);
  console.log(`  ║  Server:        http://localhost:${PORT}                          ║`);
  console.log(`  ║  API Source:   Parse.bot (mobalytics.gg)                        ║`);
  console.log(`  ║  Cache TTL:    ${BUILD_CACHE_TTL / (60 * 60 * 1000)} hours                          ║`);
  console.log(`  ║  Cached:       ${Object.keys(buildCache).length} builds loaded                    ║`);
  console.log(`  ║  Rate Limit:   200 requests/15min per IP                         ║`);
  console.log(`  ║  Origins:      ${allowedOrigins.join(', ')}                 ║`);
  console.log(`  ╚══════════════════════════════════════════════════════════════╝
  `);
  console.log(`  Try: http://localhost:${PORT}/api/build/ahri`);
  console.log(`  Health: http://localhost:${PORT}/api/health`);
});

module.exports = app;
