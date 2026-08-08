/* api.js — data fetching with offline fallback */

let VER = "", SRC = "live", ITEMS = [], ITEM_BY_NORM = {}, CHAMP = {}, POOL = [];

function buildPool() {
  POOL = [];
  for (const entry of BUILDS) {
    const r = resolveChampion(entry);
    if (r) POOL.push(r);
  }
}

/**
 * Resolve champion with dynamic build fetching
 * Tries to fetch from online sources first, then falls back to hardcoded
 * @param {Object} entry - Build entry from BUILDS array
 * @returns {Object|null} Resolved champion with builds
 */
async function resolveChampionWithDynamic(entry) {
  // First try to fetch dynamic build
  if (typeof window !== 'undefined' && window.getChampionBuild) {
    try {
      const dynamicBuild = await window.getChampionBuild(entry.ch);
      if (dynamicBuild) {
        // Dynamic build found, use it
        console.log(`[api] Using dynamic build for ${entry.ch}`);
        const cm = CHAMP[norm(entry.ch)];
        if (!cm) return null;
        
        // Extract builds from dynamic data
        for (const b of dynamicBuild.builds) {
          const core = b.core.map(findItem);
          if (core.every(Boolean) && new Set(core.map(i => String(i.id))).size === 6) {
            const ids = new Set(core.map(i => String(i.id)));
            const sit = (b.sit || []).map(findItem).filter(Boolean).filter(i => !ids.has(String(i.id)));
            return {
              name: dynamicBuild.ch,
              key: cm.key,
              num: cm.num,
              role: dynamicBuild.role || entry.role,
              core,
              sit,
              coreSet: ids,
              sitSet: new Set(sit.map(i => String(i.id))),
              source: 'dynamic'
            };
          }
        }
      }
    } catch (e) {
      console.warn(`[api] Dynamic build fetch failed for ${entry.ch}, falling back to hardcoded`);
    }
  }
  
  // Fall back to hardcoded
  return resolveChampion(entry);
}

function isCanonicalId(id) {
  const s = String(id);
  return /^\d{3,4}$/.test(s) && !s.startsWith("9");
}

function findItem(name) {
  for (const c of [name, ...(ALIAS[name] || [])]) {
    const hit = ITEM_BY_NORM[norm(c)];
    if (hit) return hit;
  }
  return null;
}

function isAlias(name) {
  const n = norm(name);
  for (const [canonical, aliases] of Object.entries(ALIAS)) {
    if (aliases.some(a => norm(a) === n)) return true;
  }
  return false;
}

function resolveChampion(entry) {
  const cm = CHAMP[norm(entry.ch)];
  if (!cm) return null;
  for (const b of entry.builds) {
    const core = b.core.map(findItem);
    if (core.every(Boolean) && new Set(core.map(i => String(i.id))).size === 6) {
      const ids = new Set(core.map(i => String(i.id)));
      const sit = (b.sit || []).map(findItem).filter(Boolean).filter(i => !ids.has(String(i.id)));
      return { name: entry.ch, key: cm.key, num: cm.num, role: entry.role, core, sit, coreSet: ids, sitSet: new Set(sit.map(i => String(i.id))) };
    }
  }
  return null;
}

function useOffline() {
  VER = "16.15";
  SRC = "offline";
  ITEMS = OFF_ITEMS.filter(p => isCanonicalId(p[0])).map(p => ({ id: String(p[0]), name: p[1] }));
  ITEM_BY_NORM = {};
  ITEMS.forEach(it => ITEM_BY_NORM[norm(it.name)] = it);
  CHAMP = {};
  for (const [n, v] of Object.entries(OFF_CHAMPS)) CHAMP[norm(n)] = { key: String(v[0]), num: v[1] };
  buildPool();
}

async function loadRiotData() {
  let liveOK = false;
  try {
    $("#loadMsg").textContent = "Fetching latest patch version…";
    const vr = await fetch(`${DD}/api/versions.json`, { cache: "no-store" });
    if (!vr.ok) throw 0;
    const va = await vr.json();
    if (!Array.isArray(va) || !va[0]) throw 0;
    VER = va[0];

    $("#loadMsg").textContent = "Loading items & champions for patch " + VER + "…";
    const [ir, cr] = await Promise.all([
      fetch(`${DD}/cdn/${VER}/data/en_US/item.json`, { cache: "no-store" }),
      fetch(`${DD}/cdn/${VER}/data/en_US/champion.json`, { cache: "no-store" })
    ]);
    if (!ir.ok || !cr.ok) throw 0;
    const ij = await ir.json(), cj = await cr.json();

    const RAW = [];
    for (const [k, d] of Object.entries(ij.data)) {
      const id = String(k);
      if (!isCanonicalId(id)) continue;
      RAW.push({ id, name: d.name, total: (d.gold && d.gold.total) || 0, purch: !(d.gold && d.gold.purchasable === false) });
    }
    const RAW_BY_NORM = {};
    RAW.forEach(it => { if (!RAW_BY_NORM[norm(it.name)]) RAW_BY_NORM[norm(it.name)] = it; });

    ITEMS = RAW.filter(it => it.purch && it.total >= 900 && !JUNK.test(it.name) && !isAlias(it.name));
    ITEM_BY_NORM = {};
    ITEMS.forEach(it => ITEM_BY_NORM[norm(it.name)] = it);

    for (const name of BUILD_NAMES) {
      const n = norm(name);
      if (!ITEM_BY_NORM[n] && RAW_BY_NORM[n]) {
        const candidate = RAW_BY_NORM[n];
        if (!isAlias(candidate.name)) {
          ITEMS.push(candidate);
          ITEM_BY_NORM[n] = candidate;
        }
      }
    }

    CHAMP = {};
    for (const d of Object.values(cj.data)) {
      if (String(d.id).includes("_")) continue;
      CHAMP[norm(d.name)] = { key: String(d.id), num: d.key };
    }
    SRC = "live";
    
    // Build pool with dynamic builds
    await buildPoolDynamic();
    liveOK = POOL.length > 0 && ITEMS.length > 40;
  } catch (e) {
    liveOK = false;
  }
  if (!liveOK) useOffline();
}

/**
 * Build pool using dynamic build fetching
 * Falls back to hardcoded builds for champions without dynamic data
 */
async function buildPoolDynamic() {
  POOL = [];
  
  // For each hardcoded entry, try to fetch dynamic build
  for (const entry of BUILDS) {
    const resolved = await resolveChampionWithDynamic(entry);
    if (resolved) {
      POOL.push(resolved);
    } else {
      // Fall back to hardcoded
      const r = resolveChampion(entry);
      if (r) POOL.push(r);
    }
  }
  
  // Also try to add champions that have dynamic builds but no hardcoded entry
  // Get all champion names from CHAMP
  for (const [champName, champData] of Object.entries(CHAMP)) {
    // Check if we already have this champion from hardcoded builds
    const alreadyInPool = POOL.some(p => norm(p.name) === champName);
    if (alreadyInPool) continue;
    
    // Try to fetch dynamic build for this champion
    try {
      const dynamicBuild = typeof window !== 'undefined' && window.getChampionBuild 
        ? await window.getChampionBuild(champData.key || champName) 
        : null;
      
      if (dynamicBuild) {
        // Resolve the dynamic build with our item/champion data
        for (const b of dynamicBuild.builds) {
          const core = b.core.map(findItem);
          if (core.every(Boolean) && new Set(core.map(i => String(i.id))).size === 6) {
            const ids = new Set(core.map(i => String(i.id)));
            const sit = (b.sit || []).map(findItem).filter(Boolean).filter(i => !ids.has(String(i.id)));
            POOL.push({
              name: dynamicBuild.ch,
              key: champData.key,
              num: champData.num,
              role: dynamicBuild.role || 'Mid',
              core,
              sit,
              coreSet: ids,
              sitSet: new Set(sit.map(i => String(i.id))),
              source: 'dynamic'
            });
            break;
          }
        }
      }
    } catch (e) {
      // Skip if dynamic fetch fails for this champion
      console.warn(`[api] Skipping ${champName} due to dynamic fetch error`);
    }
  }
  
  console.log(`[api] Built pool with ${POOL.length} champions`);
}
