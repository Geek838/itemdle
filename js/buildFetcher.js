/* buildFetcher.js — Dynamic build fetching from op.gg and lolalytics */

// ============================================
// DEPENDENCIES
// ============================================

// norm is defined in utils.js which is loaded before this file
// This file assumes norm() is available globally

// ============================================
// CONFIGURATION
// ============================================

const BUILD_CACHE_KEY = 'itemdle_dynamic_builds';
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Feature flag: Enable dynamic build fetching
// Set to true to use your own backend server, false to use hardcoded builds only
const ENABLE_DYNAMIC_FETCH = true;

// Backend server URL - Change this to match your deployment
// For local development: http://localhost:3000
// For Render deployment: https://itemdle-api.onrender.com
// For GitHub Pages frontend: keep as is, but update CORS in server.js
const BACKEND_URL = 'https://itemdle-api.onrender.com';

// Debug mode - set to true to see detailed error logs
const DEBUG = true;

// ============================================
// CACHE MANAGEMENT
// ============================================

/**
 * Load build cache from localStorage
 * @returns {Object} Cache object with champion builds
 */
function loadBuildCache() {
  try {
    const cached = localStorage.getItem(BUILD_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {
    console.warn('[buildFetcher] Error loading cache:', e);
  }
  return {};
}

/**
 * Save build cache to localStorage
 * @param {Object} cache - Cache object to save
 */
function saveBuildCache(cache) {
  try {
    localStorage.setItem(BUILD_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.warn('[buildFetcher] Error saving cache:', e);
  }
}

/**
 * Get cached build for a champion if not stale
 * @param {string} championName - Champion name
 * @returns {Object|null} Cached build or null if stale/missing
 */
function getCachedBuild(championName) {
  const cache = loadBuildCache();
  const cached = cache[championName];
  
  if (cached && cached.timestamp) {
    // Check if cache is still valid (within TTL)
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }
  return null;
}

/**
 * Cache a build for a champion
 * @param {string} championName - Champion name
 * @param {Object} buildData - Build data to cache
 */
function cacheBuild(championName, buildData) {
  const cache = loadBuildCache();
  cache[championName] = {
    data: buildData,
    timestamp: Date.now()
  };
  saveBuildCache(cache);
}

// ============================================
// HTTP UTILITIES
// ============================================

/**
 * Fetch build from backend server
 * @param {string} championName - Champion name
 * @param {string} source - 'lolalytics', 'opgg', or null for merged
 * @returns {Promise<Object>} Build data
 */
async function fetchFromBackend(championName, source = null) {
  const endpoint = source 
    ? `/api/build/${encodeURIComponent(championName)}/${source}`
    : `/api/build/${encodeURIComponent(championName)}`;
  
  const url = BACKEND_URL + endpoint;
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.error || `HTTP ${response.status}`);
    }
    
    return await response.json();
  } catch (e) {
    if (DEBUG) {
      console.warn(`[buildFetcher] Backend request failed for ${championName}:`, e.message);
    }
    throw e;
  }
}

// ============================================
// MAIN FETCH FUNCTION
// ============================================

/**
 * Fetch champion build from backend (which handles merging from lolalytics and op.gg)
 * @param {string} championName - Champion name (e.g., 'Ahri')
 * @returns {Promise<Object>} Build object matching existing format
 */
async function fetchChampionBuild(championName) {
  // Skip if dynamic fetching is disabled
  if (!ENABLE_DYNAMIC_FETCH) {
    if (DEBUG) console.log(`[buildFetcher] Dynamic fetching disabled`);
    return null;
  }
  
  const normalizedName = championName.trim();
  
  // Step 1: Check cache first
  const cached = getCachedBuild(normalizedName);
  if (cached) {
    if (DEBUG) console.log(`[buildFetcher] Using cached build for ${normalizedName}`);
    return cached;
  }
  
  try {
    // Step 2: Fetch merged build from backend (handles role detection, scraping, and merging)
    const result = await fetchFromBackend(normalizedName);
    
    // Step 3: Cache the result
    cacheBuild(normalizedName, result);
    
    if (DEBUG) console.log(`[buildFetcher] Successfully fetched build for ${normalizedName}`, result);
    return result;
    
  } catch (e) {
    if (DEBUG) console.error(`[buildFetcher] Failed to fetch build for ${normalizedName}:`, e);
    return null; // Signal to use fallback
  }
}

// ============================================
// FALLBACK TO HARDCODED BUILDS
// ============================================

/**
 * Get build for champion, using dynamic fetch first, then fallback
 * @param {string} championName - Champion name
 * @returns {Promise<Object>} Build object or null
 */
async function getChampionBuild(championName) {
  // Try dynamic fetch first
  const dynamicBuild = await fetchChampionBuild(championName);
  if (dynamicBuild) {
    return dynamicBuild;
  }
  
  // Fallback to cached dynamic build (even if stale)
  const cached = getCachedBuild(championName);
  if (cached) {
    console.log(`[buildFetcher] Using stale cached build for ${championName}`);
    return cached;
  }
  
  // Fallback to hardcoded builds
  if (DEBUG) console.log(`[buildFetcher] Using hardcoded build for ${championName}`);
  return null; // Signal to use BUILDS from data.js
}

// ============================================
// EXPORTS
// ============================================

// Export main function
window.fetchChampionBuild = fetchChampionBuild;
window.getChampionBuild = getChampionBuild;
window.getCachedBuild = getCachedBuild;
window.cacheBuild = cacheBuild;
window.clearBuildCache = () => saveBuildCache({});
