/**
 * server.js - Backend proxy for ITEMDLE dynamic build fetching
 * 
 * Fetches builds from Mobalytics via Parse.bot API OR LeagueBuilds with server-side caching
 * 
 * USAGE:
 * 1. Install Node.js (v16+)
 * 2. npm install express cors axios helmet express-rate-limit
 * 3. Set environment variables (see .env.example)
 * 4. node server.js
 * 5. The server runs on http://localhost:3000
 * 
 * ENDPOINTS:
 * - GET /api/build/:champion - Get build for champion (Mobalytics via Parse.bot OR LeagueBuilds)
 * - GET /api/builds - Get all cached builds
 * - GET /api/health - Health check
 * 
 * DEPLOYMENT:
 * - Deploy to Heroku, Render, Railway, or any Node.js hosting
 * - Set PORT and PARSE_API_KEY (for Parse.bot) or use LeagueBuilds (no key needed)
 * - Configure CORS origins as needed
 * - Note: Server caches builds for 24h to minimize API usage
 * 
 * API SOURCES:
 * - Parse.bot Mobalytics API: https://parse.bot/marketplace/53405028-f65e-4c87-a55f-80a5b57efc50/mobalytics-gg-api
 * - LeagueBuilds API: https://leaguebuilds.hopto.org (Free, no API key, sorted by frequency)
 * - Item names from Data Dragon (Riot Games)
 * 
 * CACHING:
 * - Builds cached in memory for 24 hours
 * - Item data cached for 1 hour
 * - Parse.bot: ~30 API calls/month (free tier)
 * - LeagueBuilds: 60-120 requests/minute (free)
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

const PORT = process.env.PORT || 3000;
const PARSE_API_KEY = process.env.PARSE_API_KEY;

// Only require PARSE_API_KEY if using Parse.bot as the source
const BUILD_SOURCE = process.env.BUILD_SOURCE || (PARSE_API_KEY ? 'parsebot' : 'leaguebuilds');

if (BUILD_SOURCE === 'parsebot' && !PARSE_API_KEY) {
  console.error('[server] PARSE_API_KEY environment variable is required for Parse.bot');
  console.error('[server] Get your API key from: https://parse.bot/marketplace/53405028-f65e-4c87-a55f-80a5b57efc50/mobalytics-gg-api');
  console.error('[server] OR set BUILD_SOURCE=leaguebuilds to use LeagueBuilds (no API key needed)');
  process.exit(1);
}
const PARSE_API_URL = process.env.PARSE_API_URL || 'https://api.parse.bot/scraper/e7dd7967-737e-472d-90c0-f106c9882b4e';
const DD_API_URL = process.env.DD_API_URL || 'https://ddragon.leagueoflegends.com';

// ============================================
// API SOURCE CONFIGURATION
// ============================================
// Set BUILD_SOURCE to 'parsebot' (default) or 'leaguebuilds'
// If PARSE_API_KEY is not set, automatically falls back to leaguebuilds
const LEAGUEBUILDS_URL = process.env.LEAGUEBUILDS_URL || 'https://leaguebuilds.hopto.org';

console.log(`[server] Using build source: ${BUILD_SOURCE}`);

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
// For production: set trustProxy to the number of proxies (e.g., 1 for Render, Heroku, etc.)
// For development: set to 0 or false
const trustProxyCount = process.env.NODE_ENV === 'production' ? 1 : 0;

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // limit each IP to 200 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later', fallback: 'hardcoded' },
  skip: (req) => req.path === '/api/health', // Don't rate limit health checks
  trustProxy: trustProxyCount
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
// LEAGUEBUILDS API FUNCTIONS
// ============================================

/**
 * Parse Python list string format to JavaScript array
 * LeagueBuilds returns lists as Python string representations like "[1, 2, 3]"
 * @param {string} listStr - Python list as string
 * @returns {Array} JavaScript array of numbers or strings
 */
function parsePythonList(listStr) {
  if (!listStr || typeof listStr !== 'string') {
    return [];
  }
  
  // Remove outer brackets
  const inner = listStr.trim().slice(1, -1);
  
  if (!inner) {
    return [];
  }
  
  // Split by commas and clean each element
  // Handle nested lists by only splitting at top level
  const elements = [];
  let current = '';
  let depth = 0;
  
  for (let i = 0; i < inner.length; i++) {
    const char = inner[i];
    
    if (char === '[') {
      depth++;
      current += char;
    } else if (char === ']') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      elements.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  // Add the last element
  if (current.trim()) {
    elements.push(current.trim());
  }
  
  // Convert each element to number if possible
  return elements.map(el => {
    // Try to parse as number
    const num = Number(el);
    if (!isNaN(num)) {
      return num;
    }
    // If it's a nested list, recursively parse it
    if (el.startsWith('[') && el.endsWith(']')) {
      return parsePythonList(el);
    }
    return el;
  });
}

/**
 * Fetch champion build from LeagueBuilds API
 * @param {string} championName - Champion name (e.g., 'Ahri')
 * @param {string} role - Champion role/position (e.g., 'Mid')
 * @returns {Promise<Object>} Build data with core and sit items
 */
async function fetchFromLeagueBuilds(championName, role = 'mid') {
  const normalizedName = championName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const position = role.toLowerCase();
  const url = `${LEAGUEBUILDS_URL}/builds_v1/${normalizedName}/${position}`;
  
  try {
    const response = await axios.get(url, {
      timeout: 30000,
      validateStatus: function (status) {
        return status < 500; // Accept 4xx responses
      }
    });
    
    if (response.status !== 200) {
      throw new Error(`LeagueBuilds API returned ${response.status}`);
    }
    
    return response.data;
  } catch (error) {
    console.error(`[server] LeagueBuilds API error for ${championName}:`, error.message);
    
    if (error.response) {
      throw new Error(`LeagueBuilds API error: ${error.response.status}`);
    }
    throw new Error(`LeagueBuilds API request failed: ${error.message}`);
  }
}

/**
 * Process LeagueBuilds response to our format
 * Takes first 5 items + most popular boot as core 6
 * @param {Object} lbData - Raw LeagueBuilds data
 * @param {string} championName - Champion name
 * @returns {Object} Processed build with core, sit, and role
 */
async function processLeagueBuildsResponse(lbData, championName) {
  // Parse all items (already sorted by frequency)
  const allItems = parsePythonList(lbData.item) || [];
  
  // Parse boots (sorted by frequency)
  const boots = parsePythonList(lbData.boots) || [];
  
  // Parse item_build for reference
  const itemBuild = parsePythonList(lbData.item_build) || [];
  
  // Get champion role/position
  const role = lbData.position || 'Mid';
  
  // Ensure we have items
  if (allItems.length < 5) {
    console.error(`[server] LeagueBuilds: Only ${allItems.length} items for ${championName}`);
    throw new Error('Insufficient items in LeagueBuilds response');
  }
  
  // CORE 5: First 5 most frequent items
  const coreItemIds = allItems.slice(0, 5);
  
  // Add most popular boot as 6th core item
  if (boots.length > 0) {
    coreItemIds.push(boots[0]);
  } else {
    // Fallback: try to find a boot in allItems
    const bootIds = [3020, 3158, 3111, 3006, 3009, 3047]; // Sorcerer's, Ionian, Mercury's, Berserker's, Ninja, Plated
    for (const bootId of bootIds) {
      if (allItems.includes(bootId) && !coreItemIds.includes(bootId)) {
        coreItemIds.push(bootId);
        break;
      }
    }
  }
  
  // Ensure we have exactly 6 core items
  if (coreItemIds.length < 6) {
    // Fill remaining slots from allItems
    const remaining = allItems.filter(id => !coreItemIds.includes(id));
    coreItemIds.push(...remaining.slice(0, 6 - coreItemIds.length));
  }
  
  // SITUATIONAL: Next items from allItems (excluding core)
  const coreSet = new Set(coreItemIds);
  const sitItemIds = allItems.filter(id => !coreSet.has(id)).slice(0, 14);
  
  // Convert IDs to names using our cached item data
  const coreNames = [];
  const sitNames = [];
  
  for (const id of coreItemIds.slice(0, 6)) {
    const name = await getItemName(id);
    coreNames.push(name);
  }
  
  for (const id of sitItemIds) {
    const name = await getItemName(id);
    sitNames.push(name);
  }
  
  // Build result in our expected format
  const result = {
    ch: championName,
    role: role || 'Mid',
    builds: [{
      core: coreNames.filter(Boolean),
      sit: sitNames.filter(Boolean)
    }],
    source: {
      primary: 'leaguebuilds',
      timestamp: Date.now(),
      via: 'leaguebuilds.hopto.org',
      cached: false
    }
  };
  
  console.log(`[server] LeagueBuilds processed ${championName}: ${coreNames.length} core, ${sitNames.length} situational`);
  
  return result;
}

// ============================================
// UNIFIED BUILD FETCHING
// ============================================

/**
 * Fetch champion build from the configured source (Parse.bot or LeagueBuilds)
 * @param {string} championName - Champion name
 * @param {string} role - Champion role/position
 * @returns {Promise<Object>} Build data in standard format
 */
async function fetchChampionBuild(championName, role = 'Mid') {
  const normalizedName = championName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const normalizedRole = role.toLowerCase();
  
  // Get role from DEFAULT_ROLES if not provided
  let championRole = role;
  const normalizedKey = normalizedName;
  if (DEFAULT_ROLES[normalizedKey]) {
    championRole = DEFAULT_ROLES[normalizedKey];
  }
  
  // Check cache first
  const cachedBuild = getCachedBuild(championName);
  if (cachedBuild) {
    console.log(`[server] Cache hit for ${championName}`);
    return cachedBuild;
  }
  
  try {
    let rawData, processedData;
    
    if (BUILD_SOURCE === 'leaguebuilds') {
      // Use LeagueBuilds
      console.log(`[server] Fetching ${championName} from LeagueBuilds`);
      rawData = await fetchFromLeagueBuilds(championName, championRole);
      processedData = await processLeagueBuildsResponse(rawData, championName);
    } else {
      // Use Parse.bot (default)
      console.log(`[server] Fetching ${championName} from Parse.bot`);
      rawData = await fetchFromParseBot(championName, championRole);
      processedData = await processParseBotResponse(rawData, championName);
    }
    
    // Cache the result
    cacheBuild(championName, processedData);
    
    return processedData;
  } catch (error) {
    console.error(`[server] Failed to fetch build for ${championName}:`, error.message);
    throw error;
  }
}

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

// Process Parse.bot response to our format
async function processParseBotResponse(parseData, championName) {
  const buildData = parseData.data?.build;
  
  if (!buildData) {
    throw new Error('No build data in Parse.bot response');
  }
  
  // Get role - prioritize API response, then fallback to defaults
  let role = 'Mid';
  if (parseData.data?.role) {
    role = ROLE_MAP[parseData.data.role.toUpperCase()] || parseData.data.role;
  } else {
    // Fallback to DEFAULT_ROLES if API doesn't provide role
    const normalizedKey = championName.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (DEFAULT_ROLES[normalizedKey]) {
      role = DEFAULT_ROLES[normalizedKey];
    }
  }
  
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
    
    // Get role from DEFAULT_ROLES
    const normalizedKey = normalizedName.toLowerCase().replace(/[^a-z0-9]/g, '');
    let role = DEFAULT_ROLES[normalizedKey] || 'Mid';
    
    // Use unified fetch function that handles both sources
    try {
      const result = await fetchChampionBuild(normalizedName, role);
      
      // Ensure we have valid data
      if (!result.builds || !result.builds[0] || !result.builds[0].core || result.builds[0].core.length < 6) {
        return res.status(404).json({ 
          error: 'Insufficient core items found in build data',
          fallback: 'hardcoded'
        });
      }
      
      // Add source info to response
      const response = JSON.parse(JSON.stringify(result));
      if (response.source) {
        response.source.cached = false;
      }
      
      return res.json(response);
      
    } catch (e) {
      console.error(`[server] Failed to fetch build for ${normalizedName}:`, e.message);
      const userFriendlyError = getUserFriendlyError(e.message || String(e));
      return res.status(500).json({ 
        error: userFriendlyError,
        fallback: 'hardcoded'
      });
    }
    
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
