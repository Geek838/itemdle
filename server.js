/**
 * server.js - Backend proxy for ITEMDLE dynamic build fetching
 * 
 * Fetches builds EXCLUSIVELY from mobalytics.gg using Playwright
 * to properly handle Cloudflare challenges with real browser automation
 * 
 * USAGE:
 * 1. Install Node.js (v16+)
 * 2. npm install express cors cheerio playwright
 * 3. node server.js
 * 4. The server runs on http://localhost:3000
 * 
 * ENDPOINTS:
 * - GET /api/build/:champion - Get build for champion from mobalytics.gg ONLY
 * 
 * DEPLOYMENT:
 * - Deploy to Heroku, Render, Railway, or any Node.js hosting
 * - Set PORT environment variable if needed
 * - Configure CORS origins as needed
 * - Note: Works best on cloud platforms (Render, Heroku) with fresh IPs
 */

const express = require('express');
const cors = require('cors');
const cheerio = require('cheerio');
const playwright = require('playwright');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for your frontend
app.use(cors({
  origin: ['http://localhost:8080', 'https://geek838.github.io', 'https://itemdle.onrender.com', '*']
}));

// Rate limiting middleware
const rateLimit = {};
const RATE_LIMIT = 3000; // 3 seconds between requests
const MAX_REQUESTS_PER_WINDOW = 3; // Allow bursts of up to 3 requests

function checkRateLimit(ip) {
  const now = Date.now();
  
  if (!rateLimit[ip]) {
    rateLimit[ip] = { timestamps: [], lastRequest: 0 };
  }
  
  const tracking = rateLimit[ip];
  tracking.timestamps = tracking.timestamps.filter(t => now - t < 15000); // 15 second window
  
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
  return EXCLUDED_ITEMS.some(excluded => normalized.includes(norm(excluded)));
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

// Fallback role detection based on champion name
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

// Browser management - use one browser instance with multiple contexts
let browser = null;

async function getBrowser() {
  if (!browser) {
    console.log('[server] Launching browser instance...');
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
    
    browser = await playwright.chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu',
        `--user-agent=${userAgent}`
      ]
    });
    
    console.log('[server] Browser launched successfully');
  }
  
  return browser;
}

// Fetch HTML using Playwright with Cloudflare bypass
async function fetchHtml(url) {
  const maxRetries = 3;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const browser = await getBrowser();
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        viewport: { width: 1920, height: 1080 },
        javaScriptEnabled: true,
        ignoreHTTPSErrors: true
      });
      
      const page = await context.newPage();
      
      // Set realistic headers
      await page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Connection': 'keep-alive'
      });
      
      console.log(`[server] Fetching ${url} (attempt ${attempt}/${maxRetries})`);
      
      // Navigate to page
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });
      
      // Wait for potential Cloudflare challenges
      await page.waitForTimeout(3000);
      
      // Get content
      const content = await page.content();
      
      // Check for Cloudflare
      if (content.includes('Just a moment...') || 
          content.includes('Cloudflare') ||
          content.includes('cf-ray') ||
          content.includes('cf-chl') ||
          content.includes('Enable JavaScript')) {
        
        console.log(`[server] Cloudflare challenge detected on attempt ${attempt}`);
        await context.close();
        lastError = new Error('Cloudflare challenge');
        continue;
      }
      
      // Check content length
      if (content.length < 10000) {
        console.log(`[server] Suspiciously short content (${content.length} bytes) on attempt ${attempt}`);
        await context.close();
        lastError = new Error('Short content');
        continue;
      }
      
      console.log(`[server] Success! Got ${content.length} bytes`);
      await context.close();
      return content;
      
    } catch (error) {
      console.log(`[server] Error on attempt ${attempt}:`, error.message);
      lastError = error;
      
      if (attempt < maxRetries) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
      }
    }
  }
  
  throw new Error(`All ${maxRetries} attempts failed. Last error: ${lastError.message}`);
}

// Extract build from parsed HTML
function extractBuildFromHTML($, championName) {
  const normalizedKey = championName.toLowerCase().replace(/[^a-z0-9]/g, '');
  let role = DEFAULT_ROLES[normalizedKey] || 'Mid';

  // Try to find role from the page
  const title = $('title').text().toLowerCase();
  for (const [key, value] of Object.entries(ROLE_MAP)) {
    if (title.includes(key)) {
      role = value;
      break;
    }
  }

  // Check various selectors for role
  const roleSelectors = ['.champion-role', '.role-badge', '[class*="role"]', '[class*="lane"]', '[class*="position"]'];
  for (const selector of roleSelectors) {
    const el = $(selector).first();
    if (el.length) {
      const text = el.text().toLowerCase();
      if (text.includes('mid') || text.includes('middle')) role = 'Mid';
      else if (text.includes('top')) role = 'Top';
      else if (text.includes('jungle') || text.includes('jng')) role = 'Jungle';
      else if (text.includes('adc') || text.includes('bot') || text.includes('bottom')) role = 'ADC';
      else if (text.includes('support') || text.includes('sup')) role = 'Support';
    }
  }

  console.log(`[server] Detected role for ${championName}: ${role}`);

  let coreItems = [];
  let sitItems = [];
  const seenCore = new Set();

  // Look for all item images on the page
  const allItemImages = $('img[src*="item"], img[src*="ddragon"], img[alt*="item"]').toArray();
  
  // Extract and filter items
  const allItems = [];
  const seenAll = new Set();
  for (const img of allItemImages) {
    const alt = img.attribs?.alt || img.attribs?.src || '';
    const name = extractItemName(alt);
    if (!name) continue;
    
    const nameNorm = norm(name);
    if (isExcludedItem(name)) continue;
    if (!seenAll.has(nameNorm)) {
      seenAll.add(nameNorm);
      allItems.push(name);
    }
  }

  // Split into core and situational
  if (allItems.length >= 6) {
    coreItems = allItems.slice(0, 6);
    sitItems = allItems.slice(6, 20); // Get up to 14 situational
    seenCore.add(...coreItems.map(i => norm(i)));
    
    // Remove core items from situational
    sitItems = sitItems.filter(item => !seenCore.has(norm(item)));
    
    console.log(`[server] Found ${coreItems.length} core items, ${sitItems.length} situational items`);
  } else {
    console.error(`[server] Only found ${allItems.length} items for ${championName}`);
    throw new Error(`Insufficient items found`);
  }

  return { core: coreItems.slice(0, 6), sit: sitItems.slice(0, 14), role };
}

// Scrape mobalytics.gg
async function scrapeMobalytics(championName) {
  const normalizedName = championName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const url = `https://mobalytics.gg/lol/champions/${normalizedName}/build`;
  
  console.log(`[server] Scraping mobalytics.gg for ${championName}`);
  
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);
  
  return extractBuildFromHTML($, championName);
}

// Main endpoint: Get build from mobalytics.gg ONLY
app.get('/api/build/:champion', async (req, res) => {
  const ip = req.ip;
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ error: 'Rate limited. Please wait a moment and try again.' });
  }
  
  try {
    const { champion } = req.params;
    const normalizedName = champion.trim();
    const normalizedKey = normalizedName.toLowerCase().replace(/[^a-z0-9]/g, '');
    let role = DEFAULT_ROLES[normalizedKey] || 'Mid';
    
    let build;
    try {
      build = await scrapeMobalytics(normalizedName);
      role = build.role || role;
    } catch (e) {
      console.error(`[server] Scraping failed for ${normalizedName}:`, e.message);
      return res.status(500).json({ 
        error: 'Failed to scrape mobalytics.gg - may be blocked by Cloudflare. Try deploying to a cloud platform like Render.',
        fallback: 'hardcoded'
      });
    }
    
    if (!build.core || build.core.length < 6) {
      return res.status(404).json({ 
        error: 'Insufficient core items found',
        fallback: 'hardcoded'
      });
    }
    
    const result = {
      ch: normalizedName,
      role: role,
      builds: [{ core: build.core.slice(0, 6), sit: build.sit || [] }],
      source: { primary: 'mobalytics', timestamp: Date.now() }
    };
    
    res.json(result);
    
  } catch (e) {
    console.error(`[server] Error fetching build for ${req.params.champion}:`, e);
    res.status(500).json({ 
      error: 'Failed to fetch build data',
      fallback: 'hardcoded'
    });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('[server] SIGTERM received, shutting down...');
  try {
    if (browser) {
      await browser.close();
    }
    process.exit(0);
  } catch (e) {
    console.error('[server] Error during shutdown:', e);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log('[server] SIGINT received, shutting down...');
  try {
    if (browser) {
      await browser.close();
    }
    process.exit(0);
  } catch (e) {
    console.error('[server] Error during shutdown:', e);
    process.exit(1);
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`ITEMDLE backend server running on port ${PORT}`);
  console.log(`Try: http://localhost:${PORT}/api/build/ahri`);
  console.log(`Using Playwright with Chromium to fetch from mobalytics.gg`);
});

module.exports = app;
