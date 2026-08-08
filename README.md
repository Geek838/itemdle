# ITEMDLE - Guess the Build

ITEMDLE is a League of Legends guessing game where you identify the 6 core items in a champion's most commonly built item set. After finding all 6 items, unlock the bonus round to arrange them in the correct purchase order!

## Features

- **Daily Challenge**: One champion per day, same for everyone
- **Unlimited Mode**: Endless random champions
- **Bonus Round**: Arrange found items in the correct purchase order
- **Live Patch Data**: Auto-synced with the latest League of Legends patch via Data Dragon
- **Dynamic Builds**: Builds are fetched from mobalytics.gg via Parse.bot API
- **Offline Cache**: Fallback to cached builds (24h TTL) or offline patch data
- **Statistics**: Track your wins, streak, and best scores
- **Share Results**: Copy your results to share with friends

## Dynamic Build System

ITEMDLE now features a **dynamic build curation system** that fetches the latest champion builds from mobalytics.gg via the Parse.bot API. This replaces the previous hardcoded builds system and provides several benefits:

- ✅ **Always up-to-date**: Builds reflect the current meta for each patch
- ✅ **Supports all champions**: Not limited to the 25 hardcoded champions
- ✅ **Automatic role detection**: Uses the most popular role for each champion
- ✅ **Single source**: Uses mobalytics.gg data via Parse.bot
- ✅ **No Cloudflare issues**: Parse.bot handles all scraping and bypass
- ✅ **Server-side caching**: Builds cached for 24h, minimizing API usage (~30/month)
- ✅ **Graceful degradation**: Falls back to cached builds, then hardcoded builds

### Data Sources

| Source | Priority | URL | Status |
|--------|----------|-----|--------|
| Parse.bot API | Primary | https://parse.bot/marketplace/.../mobalytics-gg-api | ✅ Managed REST API |
| Mobalytics | Underlying | https://mobalytics.gg | Accessed via Parse.bot |

### Parse.bot API

We use the [Parse.bot Mobalytics API](https://parse.bot/marketplace/53405028-f65e-4c87-a55f-80a5b57efc50/mobalytics-gg-api) which provides:
- Clean REST API access to mobalytics.gg data
- No Cloudflare/blocking issues (managed by Parse.bot)
- Automatic maintenance and updates
- Structured JSON responses with item IDs

The `get_champion_build` endpoint returns:
- `items.core_items` - Core items (by ID)
- `items.situational_items` - Situational items (by ID)
- `role` - Champion role
- `tier` - Champion tier
- `stats` - Win rate, pick rate, ban rate

We map item IDs to names using Data Dragon's item.json.

### Build Data Flow

Builds are fetched from mobalytics.gg via Parse.bot API. Item IDs are mapped to names using Riot's Data Dragon API.

### Caching

- **Storage**: localStorage
- **TTL**: 24 hours
- **Key**: `itemdle_dynamic_builds`
- **Format**: `{ championName: { data: {...}, timestamp: number } }`

### Fallback Chain

```
User requests build for Ahri
    ↓
Check localStorage cache (if <24h old)
    ↓
Fetch from Parse.bot API (which connects to mobalytics.gg)
    ↓
Use core_items for core, situational for sit
    ↓
Cache result (24h TTL)
    ↓
Use dynamic build
    ↓ (if API fails)
Fallback to hardcoded BUILDS in data.js
```

## How to Play

1. A champion is shown
2. Guess the 6 items of their most commonly built item set (the community core build)
3. Receive feedback:
   - **CORE ITEM** (green): This item is part of the champion's top-6 build
   - **SITUATIONAL** (orange): Hot pick, but just outside the core 6 - close!
   - **NOT BUILT** (red): Rarely built on this champion
4. Find all 6 core items to unlock the Bonus Round
5. **Bonus Round**: Arrange the 6 found items in the exact order they are most commonly purchased

## Game Modes

### Daily Challenge
- One champion per day, same for everyone
- Share your results and compete with friends
- Track your daily streak

### Unlimited Mode
- Endless random champions
- Perfect for practicing
- No time limits

## Installation

ITEMDLE is a web-based game. For the best experience with dynamic build fetching, run the backend server.

### Requirements

- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection (for live patch data and dynamic builds)
- GitHub Pages or any web hosting (optional)

### Quick Start (Dynamic Builds Enabled)

For dynamic build fetching to work, you need to run the backend server:

```bash
# Clone the repository
git clone git@github.com:Geek838/itemdle.git
cd itemdle

# Install Node.js dependencies for the backend
npm install

# Optional: Set your Parse.bot API key (a default is provided)
export PARSE_API_KEY=your_api_key_here

# Start the backend server (in one terminal)
node server.js
# or for development with auto-restart:
npm run dev

# Open index.html in your browser (in another terminal)
# For local development, no changes needed - backend runs on http://localhost:3000
open index.html
# or on Linux:
xdg-open index.html
```

The backend server will run on `http://localhost:3000` and automatically handle:
- Fetching builds from Parse.bot API (which connects to mobalytics.gg)
- Detecting champion roles with DEFAULT_ROLES fallback
- CORS headers for local development

### Quick Start (Offline/Hardcoded Mode)

If you don't want to run the backend server, you can use hardcoded builds:

```bash
git clone git@github.com:Geek838/itemdle.git
cd itemdle

# Edit js/buildFetcher.js and set:
ENABLE_DYNAMIC_FETCH = false;

# Then open index.html
open index.html
```

Note: Offline mode uses a limited set of hardcoded champion builds.

## Project Structure

```
itemdle/
├── index.html          # Main HTML file
├── README.md           # This file
├── package.json        # Backend server dependencies
├── server.js           # Backend server (Node.js/Express) for dynamic build fetching
├── css/
│   └── styles.css      # Game styles
└── js/
    ├── app.js          # Event wiring and boot
    ├── api.js          # Data fetching with offline fallback & dynamic builds
    ├── buildFetcher.js # Frontend client for backend API
    ├── data.js         # Constants, offline cache, curated builds (fallback)
    ├── game.js         # Game state management and actions
    ├── render.js       # Rendering, search, overlays
    ├── storage.js      # localStorage wrapper
    ├── utils.js        # Helpers, DOM shortcuts, image URLs
    └── confetti.js     # Confetti animation
```

## Technical Implementation

### Architecture Overview

ITEMDLE now uses a **client-server architecture** for dynamic build fetching:

```
Browser (index.html) 
    ↓ HTTP requests
Backend Server (server.js:3000) 
    ↓ HTTP request to Parse.bot API
Parse.bot (parse.bot) 
    ↓ Scrapes mobalytics.gg (handled by Parse.bot)
    ↑ Returns JSON
Backend returns JSON
    ↓ 
Browser caches in localStorage (24h TTL)
```

This solves the CORS issues and Cloudflare blocking with the previous scraping approach.

**Note on caching**: The backend server now caches builds for 24 hours and persists them to `.build_cache.json`. This means:
- Daily Challenge: Only 1 Parse.bot API call per day (~30/month, well under 200 free tier)
- Unlimited Mode: Additional champions are also cached
- Server restart: Cache is loaded from disk, no data loss

### Files Modified for Dynamic Builds

| File | Changes |
|------|---------|
| `server.js` | **New file** - Backend server with Express + Axios, connects to Parse.bot API |
| `package.json` | **New file** - Dependencies for backend (express, cors, axios) |
| `js/buildFetcher.js` | **Updated** - Frontend client for backend API |
| `js/api.js` | Updated to integrate dynamic build fetching |
| `js/data.js` | Added `getHardcodedBuild()` helper |
| `index.html` | Added `<script src="js/buildFetcher.js">` |

### Backend API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/build/:champion` | Get build from Mobalytics via Parse.bot API (cached for 24h) |
| `GET /api/builds` | Get all cached builds and API call count |
| `POST /api/cache/clear` | Clear the build cache |
| `GET /api/health` | Health check with cache stats |

### buildFetcher.js Frontend

The frontend client (`js/buildFetcher.js`) is now a thin wrapper that:

1. **Cache Management** (`loadBuildCache`, `saveBuildCache`, `getCachedBuild`, `cacheBuild`)
   - Uses `localStorage` with 24-hour TTL
   - Key: `itemdle_dynamic_builds`

2. **Backend Communication** (`fetchFromBackend`)
   - Calls the local backend server
   - Handles errors gracefully

3. **Main Functions** (`fetchChampionBuild`, `getChampionBuild`)
   - Checks cache first
   - Fetches from backend if not cached
   - Falls back to stale cache or hardcoded builds
   - Asynchronous with proper error handling

## Technologies Used

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (no frameworks)
- **Backend**: Node.js, Express.js
- **Data Dragon API**: Riot Games' official data API for League of Legends
- **Dynamic API**: Server-side fetching from Parse.bot API (mobalytics.gg data source)
- **CORS**: Backend handles CORS with the `cors` middleware
- **Fontsource**: Google Fonts via CDN
- **Storage**: localStorage for client-side caching

## Usage (Dynamic Builds)

### Automatic
The dynamic build system works automatically when you load the game:
1. Load `index.html` in a browser
2. The game fetches the latest patch data from Riot
3. For each champion, it attempts to fetch live builds from Parse.bot API (mobalytics.gg data)
4. Builds are cached for 24 hours
5. If fetching fails, it falls back to hardcoded builds

### Manual Testing
To test the dynamic build fetching, open the browser console and run:

```javascript
// Test fetching a specific champion
await window.fetchChampionBuild('Ahri');

// Check cache
window.getCachedBuild('Ahri');

// Clear cache
window.clearBuildCache();

// Get build with full fallback chain
await window.getChampionBuild('Yasuo');
```

Or include the test script:
```html
<script src="js/tests.js"></script>
```

## Testing Requirements

### Test Cases Covered

| Scenario | Expected Result | Status |
|----------|----------------|--------|
| Mobalytics returns valid build | Use the mobalytics build | ✅ |
| Mobalytics is down/blocked | Fall back to cache → hardcoded | ✅ |
| Champion missing | Fall back to cache → hardcoded | ✅ |
| Malformed data | Skip and use fallback | ✅ |
| Cache is stale (>24h) | Re-fetch and update cache | ✅ |
| No internet connection | Use cached or hardcoded builds | ✅ |

### Manual Test Procedure

1. **Test dynamic fetching**:
   ```javascript
   await window.fetchChampionBuild('Ahri');
   ```
   Expected: Returns build object with core (6 items) and sit arrays

2. **Test caching**:
   ```javascript
   await window.fetchChampionBuild('Lux');
   const cached = window.getCachedBuild('Lux');
   ```
   Expected: cached is not null

3. **Test fallback**:
   - Disable internet connection
   - Load the game
   Expected: Uses cached builds, falls back to hardcoded

4. **Test role detection**:
   ```javascript
   // Check that champions get correct roles
   await window.fetchChampionBuild('Garen'); // Should be Top
   await window.fetchChampionBuild('Amumu'); // Should be Jungle
   ```

## Performance

| Metric | Target | Actual |
|--------|--------|--------|
| Max latency | <500ms | ~1-2s (includes scraping) |
| Cache hit | <10ms | <5ms |
| Fallback to hardcoded | <10ms | <1ms |

**Note**: Scraping adds latency (1-2s per champion) but only happens:
- Once per champion per 24 hours
- Asynchronously in the background
- Does not block game loading

## Known Limitations

1. **Site Structure Changes**: If mobalytics.gg changes their HTML structure, scraping may break

2. **Backend Dependency**: The dynamic build system requires the backend server to be running

3. **Rate Limiting**: The backend implements basic rate limiting (1 request/second/IP)

4. **No Public Hosting**: The backend needs to be self-hosted (or you can use a free service like Heroku, Render, Railway)

### Mitigation Strategies

- **Fallback to hardcoded**: Game always works, even if scraping fails
- **24h client-side cache**: Minimizes repeated backend requests
- **Managed API**: Backend uses Parse.bot API - no Cloudflare issues
- **Graceful degradation**: Worst case = hardcoded builds
- **Easy deployment**: Backend can be deployed to any Node.js hosting service

## Deployment

### Local Development

Run both the backend server and open the frontend:

**Terminal 1 (Backend)**:
```bash
npm install
node server.js
# or
npm start
```

**Terminal 2 (Frontend)**:
```bash
# Simply open index.html in your browser
```

The frontend is configured to connect to `http://localhost:3000` by default.

### Production Deployment (Option A: Separate Backend + Frontend)

For **Render**, use two separate services:

#### Backend (Web Service)
1. In Render dashboard, create a **Web Service**
2. Connect your GitHub repository
3. Set:
   - **Name**: `itemdle-api`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. Deploy - your backend will be at `https://itemdle-api.onrender.com`

#### Frontend (Static Site)
1. In Render dashboard, create a **Static Site**
2. Connect the same GitHub repository
3. Set:
   - **Name**: `itemdle`
   - **Build Command**: (leave empty)
   - **Publish Directory**: `.`
4. Deploy - your frontend will be at `https://itemdle.onrender.com`
5. **Important**: After deployment, update `BACKEND_URL` in `js/buildFetcher.js` to `https://itemdle-api.onrender.com` and commit/push

**Alternative**: Use `render.yaml` for backend deployment:
- The included `render.yaml` file configures the backend service
- For frontend, create a Static Site manually in Render dashboard

### Other Deployment Options

#### Option B: Single Service with Reverse Proxy

Deploy the entire project and use a reverse proxy:

**Nginx config**:
```nginx
server {
    listen 80;
    server_name yourdomain.com;
    
    # Backend API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
    
    # Frontend static files
    location / {
        root /path/to/itemdle;
        try_files $uri $uri/ /index.html;
    }
}
```

Then set `BACKEND_URL = '/api'` in `js/buildFetcher.js`.

#### Heroku

1. Create a new Heroku app
2. Push the code:
```bash
heroku create
git push heroku master
```
3. Update `BACKEND_URL` in `js/buildFetcher.js` to your Heroku URL

## Future Improvements

- [x] Add server-side scraping service (Node.js/Express) - **DONE**
- [ ] Implement proper API endpoints if mobalytics.gg provides them
- [ ] Add build validation to ensure data quality
- [ ] Expand to all 160+ champions automatically
- [ ] Add version/patch detection for builds
- [ ] Implement build popularity scoring

## Data Sources

- **Champion & Item Data**: [Riot Games Data Dragon](https://ddragon.leagueoflegends.com)
- **Community Builds**: Fetched from mobalytics.gg

## Credits

- **Game Concept**: Inspired by Wordle and other daily guessing games
- **Data**: Riot Games Data Dragon API
- **Build Curations**: Fetched from mobalytics.gg

## License

This project is a fan-made guessing game and is not affiliated with or endorsed by Riot Games.

Champion & item images © Riot Games (Data Dragon, auto-synced to the latest patch · offline cache as fallback).

League of Legends and all related assets are trademarks of Riot Games, Inc.

## Support

For issues or feature requests, please open an issue on the GitHub repository.
