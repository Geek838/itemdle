/* api.js — data fetching with offline fallback */

let VER = "", SRC = "live", ITEMS = [], ITEM_BY_NORM = {}, CHAMP = {}, POOL = [];

function buildPool() {
  POOL = [];
  
  // Build a map of hardcoded builds for quick lookup
  const hardcodedBuildsMap = {};
  for (const entry of BUILDS) {
    const normalized = norm(entry.ch);
    hardcodedBuildsMap[normalized] = entry;
  }
  
  // Add all champions from CHAMP
  for (const [champName, champData] of Object.entries(CHAMP)) {
    const normalized = norm(champName);
    
    // Check if we have a hardcoded build for this champion
    const hardcodedEntry = hardcodedBuildsMap[normalized];
    if (hardcodedEntry) {
      // Use the resolved champion with hardcoded build
      const r = resolveChampion(hardcodedEntry);
      if (r) {
        POOL.push(r);
      }
    } else {
      // Add champion without pre-resolved build
      POOL.push({
        name: champName,
        key: champData.key,
        num: champData.num,
        role: 'Mid',
        core: [],
        sit: [],
        coreSet: new Set(),
        sitSet: new Set(),
        source: 'dynamic'
      });
    }
  }
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
 * Build pool - Include ALL champions from Data Dragon
 * Champions with hardcoded builds will have their builds pre-resolved
 * For other champions, we'll fetch builds dynamically when selected
 * This allows supporting all 170+ League champions
 */
async function buildPoolDynamic() {
  POOL = [];
  
  // Build a map of hardcoded builds for quick lookup
  const hardcodedBuildsMap = {};
  for (const entry of BUILDS) {
    const normalized = norm(entry.ch);
    hardcodedBuildsMap[normalized] = entry;
  }
  
  // Add all champions from Data Dragon
  for (const [champName, champData] of Object.entries(CHAMP)) {
    const normalized = norm(champName);
    
    // Check if we have a hardcoded build for this champion
    const hardcodedEntry = hardcodedBuildsMap[normalized];
    if (hardcodedEntry) {
      // Use the resolved champion with hardcoded build
      const r = resolveChampion(hardcodedEntry);
      if (r) {
        POOL.push(r);
      }
    } else {
      // Add champion without pre-resolved build
      // Build will be fetched dynamically when selected
      POOL.push({
        name: champName,
        key: champData.key,
        num: champData.num,
        role: 'Mid', // Default role, will be updated from dynamic fetch
        core: [],
        sit: [],
        coreSet: new Set(),
        sitSet: new Set(),
        source: 'dynamic'
      });
    }
  }
  
  console.log(`[api] Built pool with ${POOL.length} champions (${Object.keys(hardcodedBuildsMap).length} with hardcoded builds, rest dynamic)`);
}
