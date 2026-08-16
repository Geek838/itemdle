const riotApiFetcher = require('./riotApiFetcher');

const POPULAR_CHAMPIONS = [
  'Ahri', 'Yasuo', 'Zed', 'LeeSin', 'Thresh', 'Lux', 'Ezreal', 'Jinx',
  'Kaisa', 'Vayne', 'Akali', 'Yone', 'Irelia', 'Riven', 'Fiora', 'Camille',
  'Graves', 'Kindred', 'Nidalee', 'Elise', 'KhaZix', 'Evelynn', 'Ekko',
  'Syndra', 'Orianna', 'Azir', 'Leblanc', 'Kassadin', 'TwistedFate',
  'Darius', 'Garen', 'Mordekaiser', 'Sett', 'Aatrox', 'Jax', 'Renekton',
  'Caitlyn', 'Ashe', 'MissFortune', 'Draven', 'Tristana', 'Lucian',
  'Nautilus', 'Leona', 'Blitzcrank', 'Pyke', 'Braum', 'Alistar'
];

let ALL_CHAMPIONS = [];

async function loadAllChampions() {
  try {
    const axios = require('axios');
    const versionsResponse = await axios.get('https://ddragon.leagueoflegends.com/api/versions.json');
    const latestVersion = versionsResponse.data[0];
    
    const champResponse = await axios.get(
      `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/en_US/champion.json`
    );
    
    const champions = champResponse.data.data;
    ALL_CHAMPIONS = Object.keys(champions);
    console.log('[Collector] Loaded ' + ALL_CHAMPIONS.length + ' champions');
  } catch (e) {
    console.error('[Collector] Failed to load champions:', e.message);
    process.exit(1);
  }
}

async function collectForChampion(championName, regions, targetMatches) {
  try {
    console.log('\n[Collector] Starting collection for ' + championName + '...');
    
    const builds = await riotApiFetcher.collectChampionMatches(
      championName,
      regions,
      targetMatches
    );
    
    console.log('[Collector] Collected ' + builds.length + ' matches for ' + championName);
    return builds.length;
  } catch (e) {
    console.error('[Collector] Failed to collect for ' + championName + ':', e.message);
    return 0;
  }
}

async function main() {
  const startTime = Date.now();
  
  if (!process.env.RIOT_API_KEY) {
    console.error('[Collector] ERROR: RIOT_API_KEY environment variable not set');
    process.exit(1);
  }
  
  await loadAllChampions();
  
  let championsToProcess = [];
  const args = process.argv.slice(2);
  let i = 0;
  while (i < args.length) {
    if (args[i] === '--champion') {
      championsToProcess = [args[++i]];
      break;
    } else if (args[i] === '--popular-only') {
      championsToProcess = POPULAR_CHAMPIONS.filter(c => ALL_CHAMPIONS.includes(c));
      break;
    } else {
      i++;
    }
  }
  
  if (championsToProcess.length === 0) {
    championsToProcess = ALL_CHAMPIONS;
  }
  
  const regions = ['na1', 'euw1', 'kr'];
  const targetMatches = 100;
  
  console.log('[Collector] Regions: ' + regions.join(', '));
  console.log('[Collector] Target matches per champion: ' + targetMatches);
  console.log('[Collector] Champions to process: ' + championsToProcess.length + '\n');
  
  let totalCollected = 0;
  let successful = 0;
  let failed = 0;
  
  for (let j = 0; j < championsToProcess.length; j++) {
    const champion = championsToProcess[j];
    const progress = '[' + (j + 1) + '/' + championsToProcess.length + ']';
    
    try {
      const collected = await collectForChampion(champion, regions, targetMatches);
      totalCollected += collected;
      
      if (collected >= targetMatches * 0.5) {
        successful++;
      } else {
        failed++;
      }
      
      if (j < championsToProcess.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (e) {
      console.error(progress + ' Failed ' + champion + ': ' + e.message);
      failed++;
    }
  }
  
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n============================================================');
  console.log('[Collector] COLLECTION COMPLETE');
  console.log('============================================================');
  console.log('[Collector] Champions processed: ' + championsToProcess.length);
  console.log('[Collector] Successful: ' + successful);
  console.log('[Collector] Failed/Insufficient: ' + failed);
  console.log('[Collector] Total matches collected: ' + totalCollected);
  console.log('[Collector] Duration: ' + duration + 's (' + (duration / 60).toFixed(1) + ' min)');
  console.log('============================================================');
}

main().catch(e => {
  console.error('[Collector] FATAL ERROR:', e);
  process.exit(1);
});
