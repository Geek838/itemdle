/**
 * server.js - Backend proxy for ITEMDLE dynamic build fetching
 * 
 * This simple Node.js/Express server provides CORS-enabled endpoints
 * that fetch and parse build data from lolalytics.com and op.gg.
 * 
 * USAGE:
 * 1. Install Node.js (v16+)
 * 2. npm install express cors axios cheerio
 * 3. node server.js
 * 4. The server runs on http://localhost:3000
 * 
 * ENDPOINTS:
 * - GET /api/build/:champion - Get merged build for champion
 * - GET /api/build/:champion/lolalytics - Get build from lolalytics only
 * - GET /api/build/:champion/opgg - Get build from op.gg only
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
  origin: ['http://localhost:8080', 'https://geek838.github.io', '*']
}));

// Rate limiting middleware
const rateLimit = {};
const RATE_LIMIT = 1000; // 1 request per second per IP

function checkRateLimit(ip) {
  const now = Date.now();
  if (!rateLimit[ip] || now - rateLimit[ip] > RATE_LIMIT) {
    rateLimit[ip] = now;
    return true;
  }
  return false;
}

// Helper functions
function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeItemName(name) {
  return norm(name);
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

// Fetch HTML through axios (server-side, no CORS issues)
async function fetchHtml(url) {
  const response = await axios.get(url, {
    headers: {
      'User-Agent': 'ITEMDLE/1.0 (+https://github.com/Geek838/itemdle)',
      'Accept': 'text/html,application/xhtml+xml'
    },
    timeout: 10000
  });
  return response.data;
}

// Scrape lolalytics.com
async function scrapeLolalytics(championName, role = 'middle') {
  const url = `https://lolalytics.com/lol/${championName.toLowerCase()}/build/?lane=${role}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  
  let buildData = null;
  
  // Try to find item images in build sections
  const itemImages = $('img[src*="item"]').toArray();
  const itemNames = itemImages.map(img => extractItemName(img.attribs.alt || img.attribs.src)).filter(Boolean);
  
  // Remove duplicates while preserving order
  const uniqueItems = [];
  const seen = new Set();
  for (const item of itemNames) {
    const itemNorm = normalizeItemName(item);
    if (!seen.has(itemNorm) && itemNorm) {
      seen.add(itemNorm);
      uniqueItems.push(item);
    }
  }
  
  if (uniqueItems.length >= 6) {
    buildData = {
      core: uniqueItems.slice(0, 6),
      sit: uniqueItems.slice(6, 14)
    };
  }
  
  if (!buildData) {
    throw new Error('No build data found on lolalytics');
  }
  
  return buildData;
}

// Scrape op.gg
async function scrapeOpgg(championName, role = 'mid') {
  const url = `https://www.op.gg/lol/champions/${championName.toLowerCase()}/build/${role}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  
  let buildData = null;
  
  // Try to find item images in tables
  const tables = $('table');
  for (const table of tables.toArray()) {
    const text = $(table).text().toLowerCase();
    if (text.includes('core build') || text.includes('items')) {
      const items = $(table).find('img[src*="item"]').toArray();
      const itemNames = items.map(img => extractItemName(img.attribs.alt || img.attribs.src)).filter(Boolean);
      
      // Remove duplicates
      const uniqueItems = [];
      const seen = new Set();
      for (const item of itemNames) {
        const itemNorm = normalizeItemName(item);
        if (!seen.has(itemNorm) && itemNorm) {
          seen.add(itemNorm);
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
  
  // Fallback: all item images on page
  if (!buildData) {
    const allItems = $('img[src*="item"]').toArray();
    const itemNames = allItems.map(img => extractItemName(img.attribs.alt || img.attribs.src)).filter(Boolean);
    
    const uniqueItems = [];
    const seen = new Set();
    for (const item of itemNames) {
      const itemNorm = normalizeItemName(item);
      if (!seen.has(itemNorm) && itemNorm) {
        seen.add(itemNorm);
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
  
  if (!buildData) {
    throw new Error('No build data found on op.gg');
  }
  
  return buildData;
}

// Detect role from lolalytics
async function detectRole(championName) {
  const url = `https://lolalytics.com/lol/${championName.toLowerCase()}/build/`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  
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
        'middle': 'Mid',
        'top': 'Top',
        'jungle': 'Jungle',
        'bottom': 'ADC',
        'support': 'Support'
      };
      return laneMap[lanes[0].lane] || lanes[0].lane;
    }
  }
  
  // Fallback defaults
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
}

// Merge builds
function mergeBuilds(primaryBuild, secondaryBuild) {
  if (!primaryBuild || !primaryBuild.core || primaryBuild.core.length === 0) {
    return secondaryBuild || { core: [], sit: [] };
  }
  
  if (!secondaryBuild || !secondaryBuild.core || secondaryBuild.core.length === 0) {
    return primaryBuild;
  }
  
  const localNorm = (name) => normalizeItemName(name);
  
  let finalCore = [...primaryBuild.core];
  let finalSit = [...primaryBuild.sit || []];
  
  const primaryCoreSet = new Set(primaryBuild.core.map(localNorm));
  const primarySitSet = new Set((primaryBuild.sit || []).map(localNorm));
  
  for (const secItem of secondaryBuild.core) {
    const secNorm = localNorm(secItem);
    
    if (!primaryCoreSet.has(secNorm)) {
      if (primarySitSet.has(secNorm)) {
        continue;
      }
      
      if (!primaryCoreSet.has(secNorm) && !primarySitSet.has(secNorm)) {
        if (!finalCore.map(localNorm).includes(secNorm)) {
          const lastIndex = finalCore.length - 1;
          if (lastIndex >= 0) {
            finalCore[lastIndex] = secItem;
          }
          break;
        }
      }
    }
  }
  
  const allFinalCoreNorm = new Set(finalCore.map(localNorm));
  const secondarySitUnique = (secondaryBuild.sit || []).filter(item => {
    const itemNorm = localNorm(item);
    return !allFinalCoreNorm.has(itemNorm) && !finalSit.map(localNorm).includes(itemNorm);
  });
  
  finalSit = [...finalSit, ...secondarySitUnique];
  finalCore = finalCore.slice(0, 6);
  
  const seenSit = new Set();
  finalSit = finalSit.filter(item => {
    const itemNorm = localNorm(item);
    if (seenSit.has(itemNorm)) return false;
    seenSit.add(itemNorm);
    return true;
  });
  
  return { core: finalCore, sit: finalSit };
}

// Main endpoint: Get merged build
app.get('/api/build/:champion', async (req, res) => {
  const ip = req.ip;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limited. Please wait 1 second.' });
  }
  
  try {
    const { champion } = req.params;
    const normalizedName = champion.trim();
    
    // Detect role
    const role = await detectRole(normalizedName);
    const roleMap = { 'Mid': 'middle', 'Top': 'top', 'Jungle': 'jungle', 'ADC': 'bottom', 'Support': 'support' };
    const serviceRole = roleMap[role] || 'middle';
    
    // Fetch from both services
    let primaryBuild, secondaryBuild;
    
    try {
      primaryBuild = await scrapeLolalytics(normalizedName, serviceRole);
    } catch (e) {
      console.warn(`Lolalytics failed for ${normalizedName}:`, e.message);
    }
    
    try {
      secondaryBuild = await scrapeOpgg(normalizedName, serviceRole);
    } catch (e) {
      console.warn(`OP.GG failed for ${normalizedName}:`, e.message);
    }
    
    // If both failed, return error
    if (!primaryBuild && !secondaryBuild) {
      return res.status(404).json({ error: 'No build data found from any source' });
    }
    
    // If only one succeeded, use it
    if (!secondaryBuild) {
      const result = {
        ch: normalizedName,
        role: role,
        builds: [{ core: primaryBuild.core, sit: primaryBuild.sit || [] }],
        source: { primary: 'lolalytics', secondary: null }
      };
      return res.json(result);
    }
    
    if (!primaryBuild) {
      const result = {
        ch: normalizedName,
        role: role,
        builds: [{ core: secondaryBuild.core, sit: secondaryBuild.sit || [] }],
        source: { primary: null, secondary: 'opgg' }
      };
      return res.json(result);
    }
    
    // Merge both
    const mergedBuild = mergeBuilds(primaryBuild, secondaryBuild);
    
    // Ensure 6 core items
    if (mergedBuild.core.length < 6) {
      const needed = 6 - mergedBuild.core.length;
      const availableSit = mergedBuild.sit || [];
      mergedBuild.core = [...mergedBuild.core, ...availableSit.slice(0, needed)];
      mergedBuild.sit = availableSit.slice(needed);
    }
    mergedBuild.core = mergedBuild.core.slice(0, 6);
    
    const result = {
      ch: normalizedName,
      role: role,
      builds: [{ core: mergedBuild.core, sit: mergedBuild.sit || [] }],
      source: { primary: 'lolalytics', secondary: 'opgg' }
    };
    
    res.json(result);
    
  } catch (e) {
    console.error(`Error fetching build for ${req.params.champion}:`, e);
    res.status(500).json({ error: 'Failed to fetch build data' });
  }
});

// Individual source endpoints
app.get('/api/build/:champion/lolalytics', async (req, res) => {
  const ip = req.ip;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limited' });
  }
  
  try {
    const { champion } = req.params;
    const role = await detectRole(champion);
    const roleMap = { 'Mid': 'middle', 'Top': 'top', 'Jungle': 'jungle', 'ADC': 'bottom', 'Support': 'support' };
    const serviceRole = roleMap[role] || 'middle';
    
    const build = await scrapeLolalytics(champion, serviceRole);
    res.json({
      ch: champion,
      role: role,
      builds: [{ core: build.core, sit: build.sit || [] }],
      source: { primary: 'lolalytics' }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/build/:champion/opgg', async (req, res) => {
  const ip = req.ip;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limited' });
  }
  
  try {
    const { champion } = req.params;
    const role = await detectRole(champion);
    const roleMap = { 'Mid': 'mid', 'Top': 'top', 'Jungle': 'jungle', 'ADC': 'bottom', 'Support': 'support' };
    const serviceRole = roleMap[role] || 'mid';
    
    const build = await scrapeOpgg(champion, serviceRole);
    res.json({
      ch: champion,
      role: role,
      builds: [{ core: build.core, sit: build.sit || [] }],
      source: { primary: 'opgg' }
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
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
