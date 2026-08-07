/* storage.js — localStorage wrapper */

const store = {
  get(k) {
    try { return JSON.parse(localStorage.getItem(k)); }
    catch (e) { return null; }
  },
  set(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); }
    catch (e) { /* quota exceeded or private mode */ }
  }
};

function getStats() {
  return store.get("itemdle.stats") || { played: 0, won: 0, streak: 0, best: 0 };
}

function saveStats(s) {
  store.set("itemdle.stats", s);
}
