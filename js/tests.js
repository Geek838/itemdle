/* tests.js — Test script for dynamic build fetching */

// Run this in browser console to test: copy-paste this file content

async function testBuildFetcher() {
  console.log('=== Testing Dynamic Build Fetcher ===\n');
  
  const championsToTest = ['Ahri', 'Lux', 'Yasuo', 'Garen', 'Darius'];
  
  for (const champ of championsToTest) {
    console.log(`\nTesting: ${champ}`);
    console.log('---');
    
    try {
      // Test direct fetch
      if (typeof window !== 'undefined' && window.fetchChampionBuild) {
        const startTime = Date.now();
        const build = await window.fetchChampionBuild(champ);
        const duration = Date.now() - startTime;
        
        if (build) {
          console.log(`✅ Success (${duration}ms)`);
          console.log(`  Role: ${build.role}`);
          console.log(`  Core items: ${build.builds[0].core.join(', ')}`);
          console.log(`  Situational: ${build.builds[0].sit.slice(0, 4).join(', ')}...`);
          console.log(`  Source: ${build.source?.primary || 'unknown'}`);
        } else {
          console.log(`⚠️  No build found, using fallback`);
          const hardcoded = getHardcodedBuild(champ);
          if (hardcoded) {
            console.log(`  Hardcoded core: ${hardcoded.builds[0].core.join(', ')}`);
          } else {
            console.log(`  No hardcoded build either!`);
          }
        }
      } else {
        console.log('❌ buildFetcher not loaded');
      }
    } catch (e) {
      console.error(`❌ Error:`, e.message);
    }
  }
  
  console.log('\n=== Testing Cache ===');
  if (typeof window !== 'undefined' && window.getCachedBuild) {
    // Check if Ahri is cached
    const cached = window.getCachedBuild('Ahri');
    console.log('Ahri cached?', cached ? 'Yes' : 'No');
    
    // Clear cache
    if (window.clearBuildCache) {
      window.clearBuildCache();
      console.log('Cache cleared');
    }
  }
  
  console.log('\n=== Testing Complete ===');
}

// Auto-run in browser
if (typeof window !== 'undefined' && window.location && window.location.href.includes('itemdle')) {
  // Only run if on the itemdle page
  setTimeout(testBuildFetcher, 2000);
}
