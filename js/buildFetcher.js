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
const CORS_PROXY = 'https://api.allorigins.win/raw?url='; // Public CORS proxy

// Service priorities (op.gg is easier to scrape based on structure analysis)
const PRIMARY_SERVICE = 'lolalytics';
const SECONDARY_SERVICE = 'opgg';

// User agent for requests
const USER_AGENT = 'ITEMDLE/1.0 (+https://github.com/Geek838/itemdle)';

// Rate limiting
const REQUEST_DELAY = 1000; // 1 second between requests to respect rate limits

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
 * Delay execution
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} Promise that resolves after delay
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch URL through CORS proxy
 * @param {string} url - URL to fetch
 * @returns {Promise<string>} HTML content
 */
async function fetchThroughProxy(url) {
  try {
    // Encode the URL for the proxy
    const proxyUrl = CORS_PROXY + encodeURIComponent(url);
    
    const response = await fetch(proxyUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    return await response.text();
  } catch (e) {
    console.warn(`[buildFetcher] Proxy fetch failed for ${url}:`, e.message);
    throw e;
  }
}

// ============================================
// SCRAPING FUNCTIONS
// ============================================

/**
 * Extract item name from URL or image alt text
 * @param {string} str - String to extract from
 * @returns {string} Cleaned item name
 */
function extractItemName(str) {
  if (!str) return '';
  
  // Remove file extensions and URL paths
  let name = str
    .replace(/\.png$|\.webp$|\.jpg$/i, '')
    .replace(/^.*\//, '')
    .replace(/\d+$/, '') // Remove item ID at end
    .replace(/_/g, ' ')
    .replace(/\b\w\b/g, '') // Remove single letters
    .trim();
  
  // Clean up common patterns
  name = name
    .replace(/^item\s*/i, '')
    .replace(/^lol\s*/i, '')
    .replace(/^champion\s*/i, '')
    .replace(/\s+\d+x\d+$/, '')
    .trim();
  
  return name;
}

/**
 * Normalize item name for matching
 * @param {string} name - Item name
 * @returns {string} Normalized name
 */
function normalizeItemName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Scrape builds from lolalytics.com
 * @param {string} championName - Champion name
 * @param {string} role - Role (e.g., 'middle', 'top')
 * @returns {Promise<Object>} Build data with core and sit items
 */
async function scrapeLolalytics(championName, role = 'middle') {
  const url = `https://lolalytics.com/lol/${championName.toLowerCase()}/build/?lane=${role}`;
  
  try {
    const html = await fetchThroughProxy(url);
    
    // Create a temporary DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Lolalytics embeds data in script tags with type "application/json"
    // Also has qwik/preload data
    const scripts = doc.querySelectorAll('script');
    
    let buildData = null;
    let itemsData = null;
    
    // Try to find JSON data in script tags
    for (const script of scripts) {
      const text = script.textContent;
      
      // Look for item build data patterns
      if (text.includes('Core Build') || text.includes('coreBuild')) {
        // Try to extract item names from the HTML
        const itemElements = doc.querySelectorAll('img[src*="item"]');
        const itemNames = Array.from(itemElements).map(img => {
          const alt = img.alt || img.src;
          return extractItemName(alt);
        }).filter(Boolean);
        
        if (itemNames.length >= 6) {
          // Take first 6 as core
          const core = itemNames.slice(0, 6);
          const sit = itemNames.slice(6, 12);
          
          buildData = { core, sit };
          break;
        }
      }
      
      // Try to parse JSON from script tags
      if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
        try {
          const json = JSON.parse(text);
          
          // Look for build-related data
          if (json.builds || json.items || json.core) {
            itemsData = json;
          }
          
          // Check for nested structures
          if (json.props || json.state) {
            const data = json.props || json.state;
            if (data && (data.builds || data.items)) {
              itemsData = data;
            }
          }
        } catch (e) {
          // Not valid JSON, continue
        }
      }
    }
    
    // If we found embedded JSON data, extract builds from it
    if (itemsData && !buildData) {
      // Try different paths to find build data
      const paths = [
        'builds',
        'items',
        'championData.builds',
        'data.builds',
        'props.builds'
      ];
      
      for (const path of paths) {
        const parts = path.split('.');
        let current = itemsData;
        let found = true;
        
        for (const part of parts) {
          if (current && current[part]) {
            current = current[part];
          } else {
            found = false;
            break;
          }
        }
        
        if (found && Array.isArray(current)) {
          // Found build array
          const firstBuild = current[0];
          if (firstBuild && firstBuild.core) {
            buildData = {
              core: firstBuild.core.map(extractItemName).filter(Boolean),
              sit: (firstBuild.sit || firstBuild.situational || []).map(extractItemName).filter(Boolean)
            };
            break;
          }
        }
      }
    }
    
    // Alternative: Extract from item grid tables
    if (!buildData) {
      const tables = doc.querySelectorAll('table');
      for (const table of tables) {
        const text = table.textContent.toLowerCase();
        if (text.includes('core build') || text.includes('core items')) {
          const items = Array.from(table.querySelectorAll('img')).map(img => {
            const alt = img.alt || img.src;
            return extractItemName(alt);
          }).filter(Boolean);
          
          if (items.length >= 6) {
            buildData = {
              core: items.slice(0, 6),
              sit: items.slice(6, 12)
            };
            break;
          }
        }
      }
    }
    
    // Fallback: Extract all item images from the page
    if (!buildData) {
      const allItems = Array.from(doc.querySelectorAll('img[src*="item"]'))
        .map(img => extractItemName(img.alt || img.src))
        .filter(Boolean);
      
      // Remove duplicates while preserving order
      const uniqueItems = [];
      const seen = new Set();
      for (const item of allItems) {
        const norm = normalizeItemName(item);
        if (!seen.has(norm) && norm) {
          seen.add(norm);
          uniqueItems.push(item);
        }
      }
      
      if (uniqueItems.length >= 6) {
        buildData = {
          core: uniqueItems.slice(0, 6),
          sit: uniqueItems.slice(6, 14)
        };
      }
    }
    
    if (buildData && buildData.core && buildData.core.length > 0) {
      console.log(`[buildFetcher] Lolalytics build for ${championName}:`, buildData);
      return buildData;
    }
    
    throw new Error('No build data found on lolalytics');
    
  } catch (e) {
    console.error(`[buildFetcher] Error scraping lolalytics for ${championName}:`, e);
    throw e;
  }
}

/**
 * Scrape builds from op.gg
 * @param {string} championName - Champion name
 * @param {string} role - Role (e.g., 'mid', 'top')
 * @returns {Promise<Object>} Build data with core and sit items
 */
async function scrapeOpgg(championName, role = 'mid') {
  const url = `https://www.op.gg/lol/champions/${championName.toLowerCase()}/build/${role}`;
  
  try {
    const html = await fetchThroughProxy(url);
    
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    let buildData = null;
    
    // op.gg has item build tables
    const tables = doc.querySelectorAll('table');
    
    for (const table of tables) {
      const text = table.textContent.toLowerCase();
      
      // Look for core builds table
      if (text.includes('core builds') || text.includes('core build')) {
        const items = Array.from(table.querySelectorAll('img[src*="item"]'))
          .map(img => {
            const alt = img.alt || img.src;
            return extractItemName(alt);
          })
          .filter(Boolean);
        
        if (items.length >= 6) {
          buildData = {
            core: items.slice(0, 6),
            sit: items.slice(6, 12)
          };
          break;
        }
      }
      
      // Look for items table
      if (text.includes('items') && !text.includes('runes')) {
        const items = Array.from(table.querySelectorAll('img[src*="item"]'))
          .map(img => extractItemName(img.alt || img.src))
          .filter(Boolean);
        
        // Group by frequency or position
        if (items.length >= 6) {
          // Take unique items in order of appearance
          const uniqueItems = [];
          const seen = new Set();
          for (const item of items) {
            const norm = normalizeItemName(item);
            if (!seen.has(norm) && norm) {
              seen.add(norm);
              uniqueItems.push(item);
            }
          }
          
          if (uniqueItems.length >= 6) {
            buildData = {
              core: uniqueItems.slice(0, 6),
              sit: uniqueItems.slice(6, 14)
            };
            break;
          }
        }
      }
    }
    
    // Alternative: Look for build sections with specific classes
    if (!buildData) {
      const buildSections = doc.querySelectorAll('[class*="build"], [data-testid*="build"]');
      for (const section of buildSections) {
        const items = Array.from(section.querySelectorAll('img[src*="item"]'))
          .map(img => extractItemName(img.alt || img.src))
          .filter(Boolean);
        
        if (items.length >= 6) {
          buildData = {
            core: items.slice(0, 6),
            sit: items.slice(6, 12)
          };
          break;
        }
      }
    }
    
    // Fallback: Extract all item images
    if (!buildData) {
      const allItems = Array.from(doc.querySelectorAll('img[src*="item"]'))
        .map(img => extractItemName(img.alt || img.src))
        .filter(Boolean);
      
      const uniqueItems = [];
      const seen = new Set();
      for (const item of allItems) {
        const norm = normalizeItemName(item);
        if (!seen.has(norm) && norm) {
          seen.add(norm);
          uniqueItems.push(item);
        }
      }
      
      if (uniqueItems.length >= 6) {
        buildData = {
          core: uniqueItems.slice(0, 6),
          sit: uniqueItems.slice(6, 14)
        };
      }
    }
    
    if (buildData && buildData.core && buildData.core.length > 0) {
      console.log(`[buildFetcher] OP.GG build for ${championName}:`, buildData);
      return buildData;
    }
    
    throw new Error('No build data found on op.gg');
    
  } catch (e) {
    console.error(`[buildFetcher] Error scraping op.gg for ${championName}:`, e);
    throw e;
  }
}

// ============================================
// MERGING LOGIC
// ============================================

/**
 * Merge two build objects using priority rules
 * @param {Object} primaryBuild - Build from primary service
 * @param {Object} secondaryBuild - Build from secondary service
 * @returns {Object} Merged build
 */
function mergeBuilds(primaryBuild, secondaryBuild) {
  // Ensure we have valid data
  if (!primaryBuild || !primaryBuild.core || primaryBuild.core.length === 0) {
    return secondaryBuild || { core: [], sit: [] };
  }
  
  if (!secondaryBuild || !secondaryBuild.core || secondaryBuild.core.length === 0) {
    return primaryBuild;
  }
  
  // Normalize all item names for comparison
  const localNorm = (name) => normalizeItemName(name);
  
  // Step 1: Use Primary's core as the base
  let finalCore = [...primaryBuild.core];
  let finalSit = [...primaryBuild.sit || []];
  
  // Create sets for fast lookup
  const primaryCoreSet = new Set(primaryBuild.core.map(localNorm));
  const primarySitSet = new Set((primaryBuild.sit || []).map(localNorm));
  const secondaryCoreSet = new Set(secondaryBuild.core.map(localNorm));
  const secondarySitSet = new Set((secondaryBuild.sit || []).map(localNorm));
  
  // Step 2: Check for disagreements
  for (const secItem of secondaryBuild.core) {
    const secNorm = localNorm(secItem);
    
    // If secondary core item is not in primary core
    if (!primaryCoreSet.has(secNorm)) {
      
      // If secondary lists it as situational, keep primary's classification
      if (primarySitSet.has(secNorm)) {
        // Already in primary's situational, no action needed
        continue;
      }
      
      // If secondary does not list the item at all (neither core nor situational)
      // This is tricky - we need to check if primary has this item
      // Actually, the logic is: if primary doesn't have it anywhere
      if (!primaryCoreSet.has(secNorm) && !primarySitSet.has(secNorm)) {
        // Replace the last item in finalCore with this secondary core item
        // But only if it's not already in finalCore
        if (!finalCore.map(localNorm).includes(secNorm)) {
          const lastIndex = finalCore.length - 1;
          if (lastIndex >= 0) {
            finalCore[lastIndex] = secItem;
          }
          break; // Only replace one item
        }
      }
    }
  }
  
  // Step 3: Merge situational items (exclude core items)
  const allFinalCoreNorm = new Set(finalCore.map(localNorm));
  
  // Add secondary situational items that aren't in final core
  const secondarySitUnique = (secondaryBuild.sit || []).filter(item => {
    const itemNorm = localNorm(item);
    return !allFinalCoreNorm.has(itemNorm) && !finalSit.map(localNorm).includes(itemNorm);
  });
  
  finalSit = [...finalSit, ...secondarySitUnique];
  
  // Step 4: Ensure exactly 6 core items
  finalCore = finalCore.slice(0, 6);
  
  // Remove duplicates from situational
  const seenSit = new Set();
  finalSit = finalSit.filter(item => {
    const itemNorm = localNorm(item);
    if (seenSit.has(itemNorm)) return false;
    seenSit.add(itemNorm);
    return true;
  });
  
  return { core: finalCore, sit: finalSit };
}

// ============================================
// ROLE DETECTION
// ============================================

/**
 * Detect the most popular role for a champion from lolalytics
 * @param {string} championName - Champion name
 * @returns {Promise<string>} Most popular role
 */
async function detectRole(championName) {
  const url = `https://lolalytics.com/lol/${championName.toLowerCase()}/build/`;
  
  try {
    const html = await fetchThroughProxy(url);
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // Look for lane/role indicators
    const laneElements = doc.querySelectorAll('[href*="/build/?lane="]');
    
    if (laneElements.length > 0) {
      // Get all lane links and their percentages
      const lanes = [];
      for (const el of laneElements) {
        const href = el.getAttribute('href');
        const match = href?.match(/lane=(\w+)/);
        if (match) {
          const lane = match[1];
          const text = el.textContent;
          const percentMatch = text.match(/(\d+\.?\d*)%/);
          const percent = percentMatch ? parseFloat(percentMatch[1]) : 0;
          lanes.push({ lane, percent });
        }
      }
      
      // Sort by percentage descending
      lanes.sort((a, b) => b.percent - a.percent);
      
      if (lanes[0]) {
        // Map lolalytics lane to our role names
        const laneMap = {
          'middle': 'Mid',
          'top': 'Top',
          'jungle': 'Jungle',
          'bottom': 'ADC',
          'support': 'Support'
        };
        return laneMap[lanes[0].lane] || lanes[0].lane;
      }
    }
    
    // Fallback to common defaults
    const defaults = {
      'ahri': 'Mid', 'lux': 'Mid', 'syndra': 'Mid', 'oriana': 'Mid',
      'viktor': 'Mid', 'brand': 'Mid', 'veigar': 'Mid', 'katarina': 'Mid',
      'ekko': 'Jungle', 'zed': 'Mid', 'khazix': 'Jungle', 'talon': 'Mid',
      'yasuo': 'Mid', 'yone': 'Mid', 'garen': 'Top', 'darius': 'Top',
      'set': 'Top', 'mordekaiser': 'Top', 'aatrox': 'Top', 'jinx': 'ADC',
      'ashe': 'ADC', 'caitlyn': 'ADC', 'missfortune': 'ADC', 'kaisa': 'ADC',
      'ezreal': 'ADC', 'vayne': 'ADC', 'malphite': 'Top', 'ornn': 'Top',
      'amumu': 'Jungle', 'thresh': 'Support', 'lulu': 'Support'
    };
    
    return defaults[championName.toLowerCase()] || 'Mid';
    
  } catch (e) {
    console.warn(`[buildFetcher] Error detecting role for ${championName}:`, e);
    return 'Mid'; // Default to Mid
  }
}

// ============================================
// MAIN FETCH FUNCTION
// ============================================

/**
 * Fetch champion build from dynamic sources
 * @param {string} championName - Champion name (e.g., 'Ahri')
 * @returns {Promise<Object>} Build object matching existing format
 */
async function fetchChampionBuild(championName) {
  const normalizedName = championName.trim();
  
  // Step 1: Check cache first
  const cached = getCachedBuild(normalizedName);
  if (cached) {
    console.log(`[buildFetcher] Using cached build for ${normalizedName}`);
    return cached;
  }
  
  try {
    // Step 2: Detect role
    const role = await detectRole(normalizedName);
    console.log(`[buildFetcher] Detected role for ${normalizedName}: ${role}`);
    
    // Map role to service-specific format
    const roleMap = { 'Mid': 'middle', 'Top': 'top', 'Jungle': 'jungle', 'ADC': 'bottom', 'Support': 'support' };
    const serviceRole = roleMap[role] || 'middle';
    
    // Step 3: Fetch from both services with delay between requests
    let primaryBuild, secondaryBuild;
    
    try {
      // Primary service
      if (PRIMARY_SERVICE === 'lolalytics') {
        primaryBuild = await scrapeLolalytics(normalizedName, serviceRole);
      } else {
        primaryBuild = await scrapeOpgg(normalizedName, serviceRole);
      }
      
      await delay(REQUEST_DELAY);
      
      // Secondary service
      try {
        if (SECONDARY_SERVICE === 'lolalytics') {
          secondaryBuild = await scrapeLolalytics(normalizedName, serviceRole);
        } else {
          secondaryBuild = await scrapeOpgg(normalizedName, serviceRole);
        }
      } catch (e) {
        console.warn(`[buildFetcher] Secondary service failed, using primary only`);
        secondaryBuild = null;
      }
      
    } catch (e) {
      // Primary failed, try secondary
      console.warn(`[buildFetcher] Primary service failed, trying secondary`);
      if (SECONDARY_SERVICE === 'lolalytics') {
        primaryBuild = await scrapeLolalytics(normalizedName, serviceRole);
      } else {
        primaryBuild = await scrapeOpgg(normalizedName, serviceRole);
      }
      secondaryBuild = null;
    }
    
    // Step 4: Merge builds
    const mergedBuild = secondaryBuild 
      ? mergeBuilds(primaryBuild, secondaryBuild)
      : primaryBuild;
    
    // Ensure we have at least 6 core items
    if (mergedBuild.core.length < 6) {
      // Pad with situational items if needed
      const needed = 6 - mergedBuild.core.length;
      const availableSit = mergedBuild.sit || [];
      mergedBuild.core = [...mergedBuild.core, ...availableSit.slice(0, needed)];
      mergedBuild.sit = availableSit.slice(needed);
    }
    
    // Trim to exactly 6 core items
    mergedBuild.core = mergedBuild.core.slice(0, 6);
    
    // Step 5: Format to match existing BUILDS structure
    const result = {
      ch: normalizedName,
      role: role,
      builds: [{
        core: mergedBuild.core,
        sit: mergedBuild.sit || []
      }],
      source: {
        primary: PRIMARY_SERVICE,
        secondary: SECONDARY_SERVICE,
        timestamp: Date.now()
      }
    };
    
    // Step 6: Cache the result
    cacheBuild(normalizedName, result);
    
    console.log(`[buildFetcher] Successfully fetched build for ${normalizedName}`, result);
    return result;
    
  } catch (e) {
    console.error(`[buildFetcher] Failed to fetch build for ${normalizedName}:`, e);
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
  console.log(`[buildFetcher] Using hardcoded build for ${championName}`);
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
