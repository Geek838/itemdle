/**
 * server.js - Backend proxy for ITEMDLE dynamic build fetching
 * 
 * Fetches builds from mobalytics.gg (primary) with fallback to lolalytics.com
 * 
 * USAGE:
 * 1. Install Node.js (v16+)
 * 2. npm install express cors axios cheerio
 * 3. node server.js
 * 4. The server runs on http://localhost:3000
 * 
 * ENDPOINTS:
 * - GET /api/build/:champion - Get build for champion (mobalytics.gg primary, lolalytics fallback)
 * 
 * DEPLOYMENT:
 * - Deploy to Heroku, Render, Railway, or any Node.js hosting
 * - Set PORT environment variable if needed
 * - Configure CORS origins as needed
 */

const express = require('express');
const cors = require('cors');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for your frontend
app.use(cors({
  origin: ['http://localhost:8080', 'https://geek838.github.io', 'https://itemdle.onrender.com', '*']
}));

// Rate limiting middleware
const rateLimit = {};
const RATE_LIMIT = 200; // 5 requests per second per IP
const MAX_REQUESTS_PER_WINDOW = 10; // Allow bursts of up to 10 requests

function checkRateLimit(ip) {
  const now = Date.now();
  
  if (!rateLimit[ip]) {
    rateLimit[ip] = { timestamps: [], lastRequest: 0 };
  }
  
  const tracking = rateLimit[ip];
  tracking.timestamps = tracking.timestamps.filter(t => now - t < 1000);
  
  if (tracking.timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return false;
  }
  
  if (tracking.lastRequest && now - tracking.lastRequest < RATE_LIMIT) {
    return false;
  }
  
  tracking.timestamps.push(now);
  tracking.lastRequest = now;
  return true;
}

// Helper functions
function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

// Starting items and consumables to exclude from builds
const EXCLUDED_ITEMS = [
  'doran', 'health potion', 'mana potion', 'biscuit', 'elixir',
  'refillable potion', 'corrupting potion', 'rejuvenation bead',
  'faerie charm', 'ruby crystal', 'sapphire crystal', 'long sword',
  'cloth armor', 'null magic mantle', 'boots', 'boot', 'potion'
];

function isExcludedItem(name) {
  const normalized = norm(name);
  return EXCLUDED_ITEMS.some(excluded => normalized.includes(excluded));
}

function extractItemName(str) {
  if (!str) return '';
  let name = str
    .replace(/\.png$|\.webp$|\.jpg$/i, '')
    .replace(/^.*\//, '')
    .replace(/\d+$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w\b/g, '')
    .trim();
  
  name = name
    .replace(/^item\s*/i, '')
    .replace(/^lol\s*/i, '')
    .replace(/^champion\s*/i, '')
    .replace(/\s+\d+x\d+$/, '')
    .trim();
  
  return name;
}

// Map role names to our standard role names
const ROLE_MAP = {
  'mid': 'Mid',
  'middle': 'Mid',
  'top': 'Top',
  'jungle': 'Jungle',
  'jng': 'Jungle',
  'adc': 'ADC',
  'ad carry': 'ADC',
  'bot': 'ADC',
  'bottom': 'ADC',
  'support': 'Support',
  'sup': 'Support'
};

// Fallback role detection based on champion name
const DEFAULT_ROLES = {
  'ahri': 'Mid', 'lux': 'Mid', 'syndra': 'Mid', 'oriana': 'Mid',
  'viktor': 'Mid', 'brand': 'Mid', 'veigar': 'Mid', 'katarina': 'Mid',
  'ekko': 'Jungle', 'zed': 'Mid', 'khazix': 'Jungle', 'talon': 'Mid',
  'yasuo': 'Mid', 'yone': 'Mid', 'garen': 'Top', 'darius': 'Top',
  'set': 'Top', 'mordekaiser': 'Top', 'aatrox': 'Top', 'jinx': 'ADC',
  'ashe': 'ADC', 'caitlyn': 'ADC', 'missfortune': 'ADC', 'kaisa': 'ADC',
  'ezreal': 'ADC', 'vayne': 'ADC', 'malphite': 'Top', 'ornn': 'Top',
  'amumu': 'Jungle', 'thresh': 'Support', 'lulu': 'Support'
};

// Fetch HTML through axios with Cloudflare handling
async function fetchHtml(url, retries = 3) {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];
  
  const headersList = [
    {
      'User-Agent': userAgents[0],
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br'
    },
    {
      'User-Agent': userAgents[1],
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-us'
    },
    {
      'User-Agent': userAgents[2],
      'Accept': '*/*'
    }
  ];

  for (let i = 0; i < retries && i < headersList.length; i++) {
    try {
      const response = await axios.get(url, {
        headers: headersList[i % headersList.length],
        timeout: 15000
      });
      
      // Check if we got a Cloudflare challenge page
      if (response.data.includes('Just a moment...') || response.data.includes('Cloudflare') || 
          response.data.includes('cf-ray') || response.data.includes('cf-chl')) {
        console.log(`[server] Cloudflare challenge detected, retrying (${i + 1}/${retries})`);
        continue;
      }
      
      return response.data;
    } catch (error) {
      if (error.response && (error.response.status === 403 || error.response.status === 103)) {
        console.log(`[server] ${error.response.status} Forbidden, retrying (${i + 1}/${retries})`);
        continue;
      }
      throw error;
    }
  }
  
  throw new Error('All fetch attempts failed - likely blocked by Cloudflare');
}

// Extract build from parsed HTML - shared logic for both sources
function extractBuildFromHTML($, championName, sourceName) {
  // Start with default role if we have one for this champion
  const normalizedKey = championName.toLowerCase().replace(/[^a-z0-9]/g, '');
  let role = DEFAULT_ROLES[normalizedKey] || 'Mid';

  if (sourceName === 'lolalytics' && !DEFAULT_ROLES[normalizedKey]) {
    // Only detect role from page if we don't have a default for this champion
    // LoLalytics role detection - use most popular role
    const laneElements = $('[href*="/build/?lane="]');
    if (laneElements.length > 0) {
      const lanes = [];
      for (const el of laneElements.toArray()) {
        const href = $(el).attr('href');
        const match = href?.match(/lane=(\w+)/);
        if (match) {
          const lane = match[1];
          const text = $(el).text();
          const percentMatch = text.match(/(\d+\.?\d*)%/);
          const percent = percentMatch ? parseFloat(percentMatch[1]) : 0;
          lanes.push({ lane, percent });
        }
      }
      
      lanes.sort((a, b) => b.percent - a.percent);
      
      if (lanes[0]) {
        const laneMap = {
          'middle': 'Mid', 'top': 'Top', 'jungle': 'Jungle',
          'bottom': 'ADC', 'support': 'Support'
        };
        role = laneMap[lanes[0].lane] || lanes[0].lane;
      }
    }
  }

  let coreItems = [];
  let sitItems = [];

  // Try to find item sections
  const sections = $('h2, h3, h4, .section-title, .section-header, [class*="title"], [class*="heading"]');
  
  for (const section of sections.toArray()) {
    const sectionText = $(section).text().toLowerCase().trim();
    
    // Look for Full Build / Core Build section
    if (sectionText.includes('full build') || sectionText.includes('core build') || 
        sectionText.includes('core items') || sectionText.includes('recommended build') ||
        sectionText.includes('best build') || sectionText.includes('full item build') ||
        sectionText.includes('recommended items') || sectionText.includes('best items')) {
      
      // Find all item images after this section
      let allItemImages = [];
      
      // Check various possible locations
      const possibleContainers = [
        $(section).nextAll('img[src*="item"], img[src*="ddragon"], img[alt*="item"]'),
        $(section).parent().find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]'),
        $(section).next().find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]'),
        $(section).nextAll('div').slice(0, 5).find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]')
      ];
      
      for (const container of possibleContainers) {
        allItemImages = allItemImages.concat(container.toArray());
      }
      
      // Also check parent's next elements
      const nearbyDivs = $(section).nextAll('div').slice(0, 3);
      for (const div of nearbyDivs.toArray()) {
        const divItems = $(div).find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]').toArray();
        allItemImages = allItemImages.concat(divItems);
      }
      
      // Extract and filter item names
      const itemNames = allItemImages.map(img => {
        const alt = img.attribs?.alt || img.attribs?.src || '';
        return extractItemName(alt);
      }).filter(Boolean);
      
      const uniqueCoreItems = [];
      const seenCore = new Set();
      for (const item of itemNames) {
        const itemNorm = norm(item);
        if (isExcludedItem(item) || !itemNorm) continue;
        if (!seenCore.has(itemNorm)) {
          seenCore.add(itemNorm);
          uniqueCoreItems.push(item);
        }
        if (uniqueCoreItems.length >= 6) break;
      }
      
      if (uniqueCoreItems.length >= 6) {
        coreItems = uniqueCoreItems.slice(0, 6);
      } else if (uniqueCoreItems.length > 0 && coreItems.length < uniqueCoreItems.length) {
        coreItems = uniqueCoreItems;
      }
      
      // Look for Situational Items section after this one
      const allSectionsAfter = $(section).nextAll('h2, h3, h4, .section-title, .section-header');
      for (const sitSection of allSectionsAfter.toArray()) {
        const sitText = $(sitSection).text().toLowerCase().trim();
        if (sitText.includes('situational') || sitText.includes('alternative') || 
            sitText.includes('optional items') || sitText.includes('item options') ||
            sitText.includes('situational items') || sitText.includes('optional')) {
          
          const sitItemImages = [
            $(sitSection).parent().find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]'),
            $(sitSection).next().find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]'),
            $(sitSection).nextAll('img[src*="item"], img[src*="ddragon"], img[alt*="item"]')
          ];
          
          let allSitImages = [];
          for (const container of sitItemImages) {
            allSitImages = allSitImages.concat(container.toArray());
          }
          
          // Also check nearby divs
          const nearbySitDivs = $(sitSection).nextAll('div').slice(0, 5);
          for (const div of nearbySitDivs.toArray()) {
            const divItems = $(div).find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]').toArray();
            allSitImages = allSitImages.concat(divItems);
          }
          
          const sitItemNames = allSitImages.map(img => {
            const alt = img.attribs?.alt || img.attribs?.src || '';
            return extractItemName(alt);
          }).filter(Boolean);
          
          const uniqueSitItems = [];
          const seenSit = new Set();
          for (const item of sitItemNames) {
            const itemNorm = norm(item);
            if (isExcludedItem(item) || !itemNorm) continue;
            if (!seenCore.has(itemNorm) && !seenSit.has(itemNorm)) {
              seenSit.add(itemNorm);
              uniqueSitItems.push(item);
            }
            if (uniqueSitItems.length >= 14) break;
          }
          
          if (uniqueSitItems.length > 0) {
            sitItems = uniqueSitItems.slice(0, 14);
          }
          break;
        }
      }
      
      // If we found core items, we're done
      if (coreItems.length >= 6) {
        break;
      }
    }
  }

  // Strategy 2: Look for item containers with specific classes
  if (coreItems.length < 6) {
    const buildContainers = $('[class*="build"], [class*="items"], .build-container, .items-container, .item-list, .item-build');
    
    for (const container of buildContainers.toArray()) {
      const containerText = $(container).text().toLowerCase();
      const itemImages = $(container).find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]').toArray();
      
      if (itemImages.length < 6) continue;
      
      if (containerText.includes('full') || containerText.includes('core') || 
          containerText.includes('recommended') || containerText.includes('best') ||
          containerText.includes('build') || containerText.includes('items')) {
        
        const itemNames = itemImages.map(img => {
          const alt = img.attribs?.alt || img.attribs?.src || '';
          return extractItemName(alt);
        }).filter(Boolean);
        
        const uniqueItems = [];
        const seen = new Set();
        for (const item of itemNames) {
          const itemNorm = norm(item);
          if (isExcludedItem(item) || !itemNorm) continue;
          if (!seen.has(itemNorm)) {
            seen.add(itemNorm);
            uniqueItems.push(item);
          }
        }
        
        if (uniqueItems.length >= 6) {
          coreItems = uniqueItems.slice(0, 6);
          
          // Also try to find situational items in other containers
          const sitContainers = buildContainers.not(container).filter(function() {
            const text = $(this).text().toLowerCase();
            return text.includes('situational') || text.includes('alternative') || text.includes('optional');
          });
          
          for (const sitContainer of sitContainers.toArray()) {
            const sitItemImages = $(sitContainer).find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]').toArray();
            const sitItemNames = sitItemImages.map(img => {
              const alt = img.attribs?.alt || img.attribs?.src || '';
              return extractItemName(alt);
            }).filter(Boolean);
            
            const uniqueSitItems = [];
            const seenSit = new Set();
            for (const item of sitItemNames) {
              const itemNorm = norm(item);
              if (isExcludedItem(item) || !itemNorm) continue;
              if (!seen.has(itemNorm) && !seenSit.has(itemNorm)) {
                seenSit.add(itemNorm);
                uniqueSitItems.push(item);
              }
              if (uniqueSitItems.length >= 14) break;
            }
            
            if (uniqueSitItems.length > 0) {
              sitItems = uniqueSitItems.slice(0, 14);
              break;
            }
          }
          break;
        }
      }
    }
  }

  // Strategy 3: Fallback - use all item images on the page
  if (coreItems.length < 6) {
    const allItemImages = $('img[src*="item"], img[src*="ddragon"], img[alt*="item"]').toArray();
    const itemNames = allItemImages.map(img => {
      const alt = img.attribs?.alt || img.attribs?.src || '';
      return extractItemName(alt);
    }).filter(Boolean);
    
    const uniqueItems = [];
    const seen = new Set();
    for (const item of itemNames) {
      const itemNorm = norm(item);
      if (isExcludedItem(item) || !itemNorm) continue;
      if (!seen.has(itemNorm)) {
        seen.add(itemNorm);
        uniqueItems.push(item);
      }
    }
    
    if (uniqueItems.length >= 6) {
      coreItems = uniqueItems.slice(0, 6);
      sitItems = uniqueItems.slice(6, 14);
    } else {
      coreItems = uniqueItems;
    }
  }

  return { core: coreItems.slice(0, 6), sit: sitItems.slice(0, 14), role };
}

// Scrape mobalytics.gg (primary source)
async function scrapeMobalytics(championName) {
  const normalizedName = championName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const url = `https://mobalytics.gg/lol/champions/${normalizedName}/build`;
  
  console.log(`[server] Scraping mobalytics.gg for ${championName}: ${url}`);
  
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  
  return extractBuildFromHTML($, championName, 'mobalytics');
}

// Scrape lolalytics.com (fallback source)
async function scrapeLolalytics(championName) {
  const normalizedName = championName.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Try middle lane first as most common
  const url = `https://lolalytics.com/lol/${normalizedName}/build/?lane=middle`;
  
  console.log(`[server] Scraping lolalytics.com for ${championName}: ${url}`);
  
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  
  return extractBuildFromHTML($, championName, 'lolalytics');
}

// Main scrape function - try mobalytics first, fallback to lolalytics
async function scrapeBuild(championName) {
  let build;
  let source = 'mobalytics';
  
  // Try mobalytics first
  try {
    build = await scrapeMobalytics(championName);
    console.log(`[server] Successfully scraped from mobalytics.gg for ${championName}`);
    
    // Ensure we have 6 core items
    if (build.core && build.core.length >= 6) {
      return { ...build, source };
    }
  } catch (e) {
    console.warn(`[server] Mobalytics failed for ${championName}: ${e.message}`);
  }
  
  // Fallback to lolalytics
  try {
    build = await scrapeLolalytics(championName);
    source = 'lolalytics';
    console.log(`[server] Successfully scraped from lolalytics.com for ${championName}`);
    
    // Ensure we have 6 core items
    if (build.core && build.core.length >= 6) {
      return { ...build, source };
    }
  } catch (e) {
    console.warn(`[server] Lolalytics failed for ${championName}: ${e.message}`);
  }
  
  // If we got some items but not 6, still return what we have
  if (build && build.core && build.core.length > 0) {
    return { ...build, source };
  }
  
  throw new Error(`No build data found for ${championName} from any source`);
}

// Main endpoint: Get build
app.get('/api/build/:champion', async (req, res) => {
  const ip = req.ip;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limited. Please wait a moment and try again.' });
  }
  
  try {
    const { champion } = req.params;
    const normalizedName = champion.trim();
    
    // Use default role if we have one
    const normalizedKey = normalizedName.toLowerCase().replace(/[^a-z0-9]/g, '');
    let role = DEFAULT_ROLES[normalizedKey] || 'Mid';
    
    // Scrape build
    let build;
    try {
      build = await scrapeBuild(normalizedName);
      role = build.role || role; // Use detected role if available
    } catch (e) {
      console.error(`[server] All scraping failed for ${normalizedName}:`, e.message);
      return res.status(500).json({ error: 'Failed to fetch build data from all sources' });
    }
    
    // Ensure we have exactly 6 core items
    if (!build.core || build.core.length < 6) {
      return res.status(404).json({ 
        error: `Insufficient core items found (${build.core ? build.core.length : 0}) for ${normalizedName}` 
      });
    }
    
    const result = {
      ch: normalizedName,
      role: role,
      builds: [{ core: build.core.slice(0, 6), sit: build.sit || [] }],
      source: { primary: build.source, timestamp: Date.now() }
    };
    
    res.json(result);
    
  } catch (e) {
    console.error(`[server] Error fetching build for ${req.params.champion}:`, e);
    res.status(500).json({ error: 'Failed to fetch build data' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Start server
app.listen(PORT, () => {
  console.log(`ITEMDLE backend server running on port ${PORT}`);
  console.log(`Try: http://localhost:${PORT}/api/build/ahri`);
});

module.exports = app;