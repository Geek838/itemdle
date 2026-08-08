/**
 * server.js - Backend proxy for ITEMDLE dynamic build fetching
 * 
 * Fetches builds from mobalytics.gg and serves them via a simple API.
 * 
 * USAGE:
 * 1. Install Node.js (v16+)
 * 2. npm install express cors axios cheerio
 * 3. node server.js
 * 4. The server runs on http://localhost:3000
 * 
 * ENDPOINTS:
 * - GET /api/build/:champion - Get build for champion from mobalytics.gg
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

// Map mobalytics role names to our standard role names
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

// Fetch HTML through axios with retry logic for Cloudflare
async function fetchHtml(url) {
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
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Referer': 'https://mobalytics.gg/',
      'DNT': '1'
    },
    {
      'User-Agent': userAgents[1],
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-us',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive'
    },
    {
      'User-Agent': userAgents[2],
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br'
    }
  ];

  for (let i = 0; i < headersList.length; i++) {
    try {
      const response = await axios.get(url, {
        headers: headersList[i],
        timeout: 15000
      });
      
      // Check if we got a Cloudflare challenge page
      if (response.data.includes('Just a moment...') || response.data.includes('Cloudflare')) {
        console.log(`[server] Cloudflare challenge detected, retrying with different headers (${i + 1}/${headersList.length})`);
        continue;
      }
      
      return response.data;
    } catch (error) {
      if (error.response && error.response.status === 403) {
        console.log(`[server] 403 Forbidden, retrying with different headers (${i + 1}/${headersList.length})`);
        continue;
      }
      throw error;
    }
  }
  
  throw new Error('All fetch attempts failed - likely blocked by Cloudflare');
}

// Scrape mobalytics.gg
async function scrapeMobalytics(championName) {
  const normalizedName = championName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const url = `https://mobalytics.gg/lol/champions/${normalizedName}/build`;
  
  console.log(`[server] Scraping mobalytics.gg for ${championName}: ${url}`);
  
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  
  // Try to find the role from the page
  let role = DEFAULT_ROLES[normalizedName] || 'Mid';
  
  // Try to find role in page content
  const roleSelectors = [
    '.champion-role',
    '.role-badge',
    '[class*="role"]',
    '.role',
    'h1',
    'h2',
    '.title',
    '.champion-title'
  ];
  
  for (const selector of roleSelectors) {
    const roleElement = $(selector).first();
    if (roleElement.length) {
      const roleText = roleElement.text().toLowerCase();
      for (const [key, value] of Object.entries(ROLE_MAP)) {
        if (roleText.includes(key)) {
          role = value;
          break;
        }
      }
      // Also check if the role is directly in the text
      if (roleText.includes('mid') || roleText.includes('middle')) role = 'Mid';
      else if (roleText.includes('top')) role = 'Top';
      else if (roleText.includes('jungle') || roleText.includes('jng')) role = 'Jungle';
      else if (roleText.includes('adc') || roleText.includes('ad carry') || roleText.includes('bot') || roleText.includes('bottom')) role = 'ADC';
      else if (roleText.includes('support') || roleText.includes('sup')) role = 'Support';
    }
  }
  
  // Try to find role in page title
  const title = $('title').text().toLowerCase();
  for (const [key, value] of Object.entries(ROLE_MAP)) {
    if (title.includes(key)) {
      role = value;
      break;
    }
  }
  
  // Use default role if we have one for this champion (to override any wrong detection from page)
  if (DEFAULT_ROLES[normalizedName]) {
    role = DEFAULT_ROLES[normalizedName];
  }
  
  console.log(`[server] Detected role for ${championName}: ${role}`);
  
  let coreItems = [];
  let sitItems = [];
  
  // Strategy 1: Look for specific section headers and their content
  const sections = $('h2, h3, h4, .section-title, .section-header, [class*="title"], [class*="heading"]');
  
  for (const section of sections.toArray()) {
    const sectionText = $(section).text().toLowerCase().trim();
    
    // Look for Full Build / Core Build section
    if (sectionText.includes('full build') || sectionText.includes('core build') || 
        sectionText.includes('core items') || sectionText.includes('recommended build') ||
        sectionText.includes('best build') || sectionText.includes('full item build') ||
        sectionText.includes('recommended items') || sectionText.includes('best items')) {
      
      // Find the next sibling elements that contain items
      const sectionParent = $(section).parent();
      const nextContainer = $(section).next();
      
      // Look for item containers in various possible locations
      const possibleContainers = [
        sectionParent.find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]'),
        nextContainer.find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]'),
        $(section).nextAll('img[src*="item"], img[src*="ddragon"], img[alt*="item"]'),
        sectionParent.next().find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]')
      ];
      
      // Collect all item images from possible containers
      let allItemImages = [];
      for (const container of possibleContainers) {
        allItemImages = allItemImages.concat(container.toArray());
      }
      
      // Also look for item containers in div elements near the section
      const nearbyDivs = $(section).nextAll('div').slice(0, 5);
      for (const div of nearbyDivs.toArray()) {
        const divItems = $(div).find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]').toArray();
        if (divItems.length > 0) {
          allItemImages = allItemImages.concat(divItems);
        }
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
        console.log(`[server] Found ${coreItems.length} core items from section: ${sectionText}`);
      } else if (uniqueCoreItems.length > 0) {
        console.log(`[server] Found ${uniqueCoreItems.length} core items (need 6) from section: ${sectionText}`);
      }
      
      // Now look for Situational Items section after this one
      const allSectionsAfter = $(section).nextAll('h2, h3, h4, .section-title, .section-header');
      for (const sitSection of allSectionsAfter.toArray()) {
        const sitText = $(sitSection).text().toLowerCase().trim();
        if (sitText.includes('situational') || sitText.includes('alternative') || 
            sitText.includes('optional items') || sitText.includes('item options') ||
            sitText.includes('situational items') || sitText.includes('optional')) {
          
          const sitContainer = $(sitSection).parent();
          const sitNext = $(sitSection).next();
          
          const sitItemImages = [
            sitContainer.find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]'),
            sitNext.find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]'),
            $(sitSection).nextAll('img[src*="item"], img[src*="ddragon"], img[alt*="item"]')
          ];
          
          let allSitImages = [];
          for (const container of sitItemImages) {
            allSitImages = allSitImages.concat(container.toArray());
          }
          
          // Also check nearby divs for situational items
          const nearbySitDivs = $(sitSection).nextAll('div').slice(0, 5);
          for (const div of nearbySitDivs.toArray()) {
            const divItems = $(div).find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]').toArray();
            if (divItems.length > 0) {
              allSitImages = allSitImages.concat(divItems);
            }
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
            // Don't include items already in core
            if (!seenCore.has(itemNorm) && !seenSit.has(itemNorm)) {
              seenSit.add(itemNorm);
              uniqueSitItems.push(item);
            }
            if (uniqueSitItems.length >= 14) break;
          }
          
          if (uniqueSitItems.length > 0) {
            sitItems = uniqueSitItems.slice(0, 14);
            console.log(`[server] Found ${sitItems.length} situational items from section: ${sitText}`);
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
  
  // Strategy 2: If we don't have enough core items, try looking for specific class patterns
  if (coreItems.length < 6) {
    console.log(`[server] Strategy 1 found only ${coreItems.length} core items, trying Strategy 2`);
    
    // Look for containers with item images that might contain the build
    const buildContainers = $('[class*="build"], [class*="items"], .build-container, .items-container, .item-list, .item-build');
    
    for (const container of buildContainers.toArray()) {
      const containerText = $(container).text().toLowerCase();
      const itemImages = $(container).find('img[src*="item"], img[src*="ddragon"], img[alt*="item"]').toArray();
      
      if (itemImages.length < 6) continue;
      
      // Check if this container contains core/full build related text
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
          console.log(`[server] Strategy 2: Found ${coreItems.length} core items from container`);
          
          // Also try to find situational items in other containers
          const sitContainers = buildContainers.not(container).filter(function() {
            const text = $(this).text().toLowerCase();
            return text.includes('situational') || text.includes('alternative') || text.includes('optional') || text.includes('situational items');
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
              console.log(`[server] Strategy 2: Found ${sitItems.length} situational items`);
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
    console.log(`[server] Strategies 1-2 failed, trying Strategy 3 (fallback)`);
    
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
      console.log(`[server] Strategy 3: Found ${coreItems.length} core items and ${sitItems.length} situational items`);
    } else {
      console.log(`[server] Strategy 3: Only found ${uniqueItems.length} items total`);
    }
  }
  
  // Ensure we have at least 6 core items
  if (coreItems.length < 6) {
    console.error(`[server] Failed to find 6 core items for ${championName}. Found ${coreItems.length}: ${JSON.stringify(coreItems)}`);
    throw new Error(`No build data found on mobalytics.gg for ${championName}`);
  }
  
  console.log(`[server] Final result for ${championName}: ${coreItems.length} core, ${sitItems.length} situational, role: ${role}`);
  return { core: coreItems.slice(0, 6), sit: sitItems.slice(0, 14), role };
}

// Main endpoint: Get build from mobalytics.gg
app.get('/api/build/:champion', async (req, res) => {
  const ip = req.ip;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limited. Please wait a moment and try again.' });
  }
  
  try {
    const { champion } = req.params;
    const normalizedName = champion.trim();
    
    // Scrape from mobalytics.gg
    let build;
    try {
      build = await scrapeMobalytics(normalizedName);
    } catch (e) {
      console.error(`[server] Mobalytics scraping failed for ${normalizedName}:`, e.message);
      return res.status(500).json({ error: 'Failed to scrape mobalytics.gg - may be blocked by Cloudflare' });
    }
    
    // Ensure we have exactly 6 core items
    if (!build.core || build.core.length < 6) {
      return res.status(404).json({ error: 'Insufficient core items found' });
    }
    
    const result = {
      ch: normalizedName,
      role: build.role || 'Mid',
      builds: [{ core: build.core.slice(0, 6), sit: build.sit || [] }],
      source: { primary: 'mobalytics', timestamp: Date.now() }
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
