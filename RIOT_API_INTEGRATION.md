# Riot API Integration Guide

## Overview

This document explains how to use the Riot Games API for fetching champion builds in ITEMDLE, addressing rate limit concerns and providing fallback options.

## Architecture

### Build Sources (Priority Order)

1. **Riot Games API** (Primary - if `RIOT_API_KEY` is set)
   - Fetches builds from actual recent matches across multiple regions
   - Aggregates item data from real player games
   - Rate limited but provides authentic build data

2. **Parse.bot Mobalytics API** (Fallback 1 - if `PARSE_API_KEY` is set)
   - Managed API that scrapes mobalytics.gg
   - ~30 calls/month on free tier
   - Pre-curated builds

3. **LeagueBuilds API** (Fallback 2 - No key required)
   - Free, no API key needed
   - Community-sourced builds sorted by frequency
   - Most reliable fallback option

## How Riot API Build Fetching Works

### The Challenge

The user wanted to:
- Retrieve champion builds from recently played games
- Query all regions
- Combine data to find most common items
- Handle Riot API rate limits

### The Solution

The `riotApiFetcher.js` module implements:

1. **Multi-Region Support**
   - Queries NA, EUW, KR and other regions
   - Each region has its own API endpoint
   - Configurable via `RIOT_REGIONS` environment variable

2. **Rate Limit Handling**
   - `RateLimitedQueue` class manages request concurrency
   - Configurable max concurrent requests (default: 5)
   - Built-in delay between requests (default: 100ms)
   - Automatic retry on 429 responses with `Retry-After` header

3. **Data Aggregation**
   - Fetches match history for summoners
   - Extracts item builds from each match
   - Counts item frequencies across all games
   - Selects top 6 most frequent items as "core"
   - Next 14 most frequent as "situational"

4. **Caching Strategy**
   - Builds cached for 1 hour (shorter than other sources for freshness)
   - Cache persisted to `.riot_cache.json`
   - Auto-saves every 5 minutes and on shutdown
   - Summoner data cached separately for 1 hour

## Configuration

### Environment Variables

```bash
# Required for Riot API
RIOT_API_KEY=your_riot_api_key_here

# Optional configuration
RIOT_REGIONS=na1,euw1,kr           # Regions to query (comma-separated)
RIOT_MATCHES_PER_REGION=20         # Matches to analyze per region
RIOT_MIN_GAMES=10                  # Minimum games required for build
RIOT_CACHE_TTL=3600000             # Cache TTL in ms (1 hour default)
RIOT_MAX_CONCURRENT=5              # Max concurrent API requests
RIOT_REQUEST_DELAY=100             # Delay between requests in ms

# Fallback sources (if Riot API unavailable)
PARSE_API_KEY=your_parse_bot_key   # For Parse.bot fallback
BUILD_SOURCE=riot_api              # Force specific source
```

### Getting a Riot API Key

1. Visit https://developer.riotgames.com/
2. Create/login to your account
3. Generate a development API key
4. Note: Development keys expire every 24 hours
5. For production, apply for a production key

### Rate Limits

**Development API Key:**
- 20 requests per second
- 100 requests per 2 minutes

**Production API Key:**
- Higher limits based on app usage
- Apply at https://developer.riotgames.com/

**Our Implementation:**
- Default: 5 concurrent requests max
- 100ms delay between requests
- Automatic retry on rate limit
- Typically uses ~50-100 API calls per champion (first fetch)

## Usage

### Server-Side

```javascript
// server.js automatically uses Riot API if RIOT_API_KEY is set
// No code changes needed - just set environment variable

// Example .env file:
RIOT_API_KEY=RGAPI-your-key-here
RIOT_REGIONS=na1,euw1,kr
RIOT_MATCHES_PER_REGION=20
```

### Direct Module Usage

```javascript
const riotFetcher = require('./js/riotApiFetcher');

// Fetch build for a champion
const build = await riotFetcher.getBuild('Ahri');

// Or with custom parameters
const build = await riotFetcher.fetchBuildFromRiotAPI(
  'Ahri',
  ['na1', 'euw1', 'kr'],  // regions
  20                       // matches per region
);

// Check cache
const cached = riotFetcher.getCachedBuild('Ahri');

// Manual caching
riotFetcher.cacheBuild('Ahri', buildData);
```

## Cost Analysis

### API Calls Per Champion (First Fetch)

| Operation | Calls | Notes |
|-----------|-------|-------|
| Summoner lookup | 3 | One per region (NA, EUW, KR) |
| Match history | 3 | One per region |
| Match details | 60 | 20 matches × 3 regions |
| **Total** | **~66** | Per champion, first time |

### With Caching

| Scenario | API Calls |
|----------|-----------|
| Daily Challenge (1 champ/day) | ~66 calls/day (~2000/month) |
| Unlimited mode (10 champs) | ~660 calls (one-time) |
| Subsequent requests | 0 (cached for 1 hour) |

### Optimization Strategies

1. **Increase Cache TTL**: Set `RIOT_CACHE_TTL=7200000` (2 hours) to halve API usage
2. **Reduce Regions**: Use `RIOT_REGIONS=na1` for single region (⅓ API calls)
3. **Reduce Sample Size**: Use `RIOT_MATCHES_PER_REGION=10` for faster, cheaper fetches
4. **Pre-fetch Popular Champions**: Cache builds for meta champions during low-traffic periods

## Fallback Chain

```
User requests Ahri build
    ↓
Check server cache (< 1 hour old?)
    ├─ Yes → Return cached build
    └─ No → Continue
        ↓
Try Riot API (if RIOT_API_KEY set)
    ├─ Success → Cache and return
    └─ Fail (rate limit/error) → Continue
        ↓
Try Parse.bot (if PARSE_API_KEY set)
    ├─ Success → Cache and return
    └─ Fail → Continue
        ↓
Try LeagueBuilds (always available)
    ├─ Success → Cache and return
    └─ Fail → Continue
        ↓
Use hardcoded builds from data.js
```

## Testing

### Run Tests

```bash
npm test
```

### Test Coverage

- ✅ Configuration loading
- ✅ Regional host validation
- ✅ Cache functions (store, retrieve, TTL)
- ✅ Rate limit queue (sequential execution)
- ✅ Build aggregation logic
- ✅ Error handling (missing API key, unknown champions)
- ✅ Module exports

### Manual Testing

```bash
# Start server with Riot API
export RIOT_API_KEY=your_key
node server.js

# Test endpoint
curl http://localhost:3000/api/build/ahri
```

## Troubleshooting

### "RIOT_API_KEY not set" Warning

Server will automatically fall back to LeagueBuilds. To use Riot API:
```bash
export RIOT_API_KEY=RGAPI-your-key
```

### Rate Limit Errors

- Reduce `RIOT_MAX_CONCURRENT` to 3
- Increase `RIOT_REQUEST_DELAY` to 200
- Reduce `RIOT_MATCHES_PER_REGION` to 10
- Use fewer regions in `RIOT_REGIONS`

### "No summoner named X in region"

This is expected for uncommon champion names. The system:
1. Searches for summoners with the champion name
2. If found, analyzes their match history
3. Filters matches where they played that champion
4. Aggregates item builds

For better coverage, consider:
- Adding more regions
- Maintaining a list of OTP (One Trick Pony) summoners per champion
- Using alternative summoner discovery methods

## Comparison: Riot API vs Alternatives

| Feature | Riot API | Parse.bot | LeagueBuilds |
|---------|----------|-----------|--------------|
| Data Source | Real matches | Mobalytics curation | Community builds |
| Authenticity | ★★★★★ | ★★★★☆ | ★★★☆☆ |
| Freshness | Real-time | Updated daily | Updated hourly |
| Rate Limits | Strict | Moderate | None |
| Setup | API key required | API key required | None |
| Cost | Free (dev key) | Free (limited) | Free |
| Regions | All | Varies | Varies |
| Reliability | High | Medium | High |

## Recommendations

### For Development
- Use `RIOT_REGIONS=na1` to minimize API calls
- Set `RIOT_MATCHES_PER_REGION=10` for faster testing
- Keep `RIOT_CACHE_TTL=3600000` (1 hour)

### For Production
- Apply for production Riot API key
- Use all major regions: `na1,euw1,kr`
- Set `RIOT_MATCHES_PER_REGION=20-30` for accuracy
- Consider Redis for multi-instance caching
- Monitor API usage and adjust accordingly

### For High Traffic
- Implement pre-caching for popular champions
- Use longer cache TTL (2-4 hours)
- Consider hybrid approach:
  - Riot API for Daily Challenge
  - LeagueBuilds for Unlimited mode
  - Fallback chain for reliability

## Files Modified/Created

- `js/riotApiFetcher.js` - New: Riot API client with rate limiting
- `tests/riotApiFetcher.test.js` - New: Test suite
- `server.js` - Updated: Added Riot API support
- `.env.example` - Should add: Riot API configuration template

## Next Steps

1. Get Riot API key from developer.riotgames.com
2. Add to `.env` file or environment variables
3. Test with a few champions
4. Monitor API usage
5. Adjust configuration as needed
6. Consider implementing OTP summoner list for better coverage
