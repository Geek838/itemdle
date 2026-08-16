# Riot API Background Collection Setup

## Problem Solved

The previous implementation was querying matches from a single summoner per region (named after the champion), which led to:
- Biased data (one player's build preferences)
- Limited sample size
- Inaccurate meta representation

## New Solution

### 1. Diverse Match Collection (`collectChampionMatches`)
Now collects matches from **random high-elo summoners** (Challenger/Master tier) across multiple regions:
- Queries league leaderboards for diverse player pool
- Filters matches by specific champion ID
- Collects up to 100+ matches per champion
- Avoids duplicate match processing

### 2. Two-Tier Caching System
- **Match Cache**: Stores raw match data per champion (1 hour TTL)
- **Build Cache**: Stores aggregated build results (1 hour TTL)

### 3. Background Collection Script (`js/collectChampionData.js`)

Run this periodically via cron to pre-collect data:

```bash
# Collect data for all champions (takes ~30-60 minutes)
RIOT_API_KEY=your-key node js/collectChampionData.js

# Collect only popular champions (~10 minutes)
RIOT_API_KEY=your-key node js/collectChampionData.js --popular-only

# Collect single champion for testing
RIOT_API_KEY=your-key node js/collectChampionData.js --champion Ahri
```

### 4. Recommended Cron Schedule

```bash
# Option A: Full refresh every 6 hours (production API key recommended)
0 */6 * * * cd /path/to/workspace && RIOT_API_KEY=your-key node js/collectChampionData.js >> logs/riot-collection.log 2>&1

# Option B: Popular champions every 3 hours, full refresh daily at 4 AM
0 */3 * * * cd /path/to/workspace && RIOT_API_KEY=your-key POPULAR_ONLY=true node js/collectChampionData.js >> logs/riot-collection.log 2>&1
0 4 * * * cd /path/to/workspace && RIOT_API_KEY=your-key node js/collectChampionData.js >> logs/riot-collection.log 2>&1

# Option C: Development/testing - manual runs only
# Run before testing specific champions
```

## API Call Estimates

| Scenario | Champions | Regions | Target Matches | Est. API Calls | Est. Time |
|----------|-----------|---------|----------------|----------------|-----------|
| Single champion | 1 | 3 | 100 | ~120 | 30 sec |
| Popular only | 50 | 3 | 100 | ~6,000 | 15 min |
| All champions | 173 | 3 | 100 | ~20,760 | 52 min |

**Note:** Each match collection requires:
- 1 call to get challenger league
- 1 call per summoner to get their info (up to 15)
- 1 call per summoner to get match IDs (up to 15)
- Multiple calls to fetch match details (varies based on champion play rate)

## Rate Limit Handling

Development API Key limits:
- 20 requests/second
- 100 requests/2 minutes

Production API Key limits (apply for partnership):
- Much higher limits available
- Contact Riot Games for partnership

Our implementation:
- Queues requests with max 5 concurrent
- 150ms delay between requests
- Automatic retry on 429 (rate limit) responses
- Respects `Retry-After` headers

## Configuration Options

```bash
# Environment variables
export RIOT_API_KEY=RGAPI-your-key-here
export RIOT_REGIONS=na1,euw1,kr        # Default: na1,euw1,kr
export RIOT_MIN_GAMES=10                # Minimum games for valid build
export RIOT_CACHE_TTL=3600000           # 1 hour cache
export RIOT_MAX_CONCURRENT=5            # Max parallel requests
export RIOT_REQUEST_DELAY=150           # ms between requests
```

## How It Works At Runtime

1. **User requests champion build** → Server checks build cache
2. **Cache miss or expired** → Check match cache
3. **Insufficient cached matches** → Trigger live collection via `collectChampionMatches()`
   - Fetches challenger/master players from each region
   - Gets their recent matches
   - Filters for games with the requested champion
   - Aggregates item builds
4. **Returns aggregated build** → Caches result for future requests

## Best Practices

1. **Use production API key** for regular cron jobs
2. **Run during off-peak hours** if possible (lower server load)
3. **Monitor logs** for rate limit issues
4. **Start with popular-only** mode to test setup
5. **Consider Redis** for multi-server deployments (current implementation uses file-based cache)

## Troubleshooting

```bash
# Check if API key is valid
curl -H "X-Riot-Token: YOUR_KEY" https://americas.api.riotgames.com/riot/account/v1/accounts/by-name/test

# View collection logs
tail -f logs/riot-collection.log

# Test single champion collection
DEBUG=* RIOT_API_KEY=your-key node js/collectChampionData.js --champion Yasuo 2>&1 | head -100

# Clear cache and retry
rm .riot_cache.json
```
