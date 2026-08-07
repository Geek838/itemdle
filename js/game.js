/* game.js — game state management and actions */

let activeMode = "daily", dailyG = null, freeG = null, lastFreeId = null, confirmCb = null;

function newGame(c, mode) {
  return {
    mode, champ: c,
    coreSet: c.coreSet || new Set(c.core.map(i => String(i.id))),
    sitSet: c.sitSet || new Set(c.sit.map(i => String(i.id))),
    guesses: [], guessed: new Set(), found: [],
    phase: "items",
    orderSlots: [null, null, null, null, null, null],
    orderAttempts: 0, orderFeedback: null,
    done: false, won: false
  };
}

function G_pushGuess(G, item, v) {
  const id = String(item.id);
  G.guesses.push({ item, v, id });
  G.guessed.add(id);
  if (v === "core") G.found.push(id);
  if (G.found.length === 6 && !G.done) {
    G.phase = "order";
    G.orderSlots = [null, null, null, null, null, null];
  }
}

function initDaily() {
  if (!POOL.length) return;
  const saved = store.get("itemdle.daily." + todayKey());
  const champ = POOL[hashStr(todayKey()) % POOL.length];
  const G = newGame(champ, "daily");
  if (saved && saved.guesses) {
    saved.guesses.forEach(g => {
      const it = ITEMS.find(x => String(x.id) === String(g.id)) || { id: String(g.id), name: g.nm };
      G_pushGuess(G, it, g.v);
    });
  }
  if (saved && saved.done) {
    G.done = true;
    G.won = !!saved.won;
    G.phase = "done";
    G.orderAttempts = saved.orderAttempts || 0;
  }
  dailyG = G;
}

function saveDaily(G) {
  store.set("itemdle.daily." + todayKey(), {
    done: G.done, won: G.won, orderAttempts: G.orderAttempts,
    guesses: G.guesses.map(g => ({ id: g.id || String(g.item.id), nm: g.item.name, v: g.v }))
  });
}

function newFree() {
  if (!POOL.length) return;
  let pick;
  do { pick = POOL[Math.floor(Math.random() * POOL.length)]; }
  while (POOL.length > 1 && pick && lastFreeId === pick.key);
  lastFreeId = pick && pick.key;
  freeG = newGame(pick, "free");
}

const currentG = () => activeMode === "daily" ? dailyG : freeG;

function doGuess(item) {
  const G = currentG();
  if (!G || G.done || G.phase !== "items") return;
  const id = String(item.id);
  if (G.guessed.has(id)) { toast("Already guessed " + item.name + "!"); return; }
  const v = G.coreSet.has(id) ? "core" : G.sitSet.has(id) ? "sit" : "miss";
  G_pushGuess(G, item, v);
  if (G.phase === "order") toast("🏆 Bonus round unlocked — guess the purchase order!");
  if (G.mode === "daily") saveDaily(G);
  render();
  if (G.phase === "order") setTimeout(() => {
    const p = $("#orderPanel");
    p && p.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 120);
}

function chipClick(id) {
  const G = currentG();
  if (!G || G.phase !== "order" || G.done) return;
  const s = G.orderSlots.indexOf(null);
  if (s === -1 || G.orderSlots.some(slot => slot === id)) return;
  G.orderSlots[s] = String(id);
  G.orderFeedback = null;
  render();
}

function slotClick(i) {
  const G = currentG();
  if (!G || G.done || G.phase !== "order") return;
  if (G.orderSlots[i] !== null) {
    G.orderSlots[i] = null;
    G.orderFeedback = null;
    render();
  }
}

function clearOrder() {
  const G = currentG();
  if (!G || G.done) return;
  G.orderSlots = [null, null, null, null, null, null];
  G.orderFeedback = null;
  render();
}

function submitOrder() {
  const G = currentG();
  if (!G || G.phase !== "order" || G.done) return;
  if (G.orderSlots.some(x => x === null)) { toast("Place all 6 items first!"); return; }
  G.orderAttempts++;
  G.orderFeedback = G.orderSlots.map((id, i) => String(id) === String(G.champ.core[i].id));
  if (G.orderFeedback.every(Boolean)) { finishGame(true); return; }
  render();
}

function finishGame(won) {
  const G = currentG();
  if (!G || G.done) return;
  G.done = true;
  G.won = won;
  G.phase = "done";
  G.orderFeedback = null;
  const st = getStats();
  st.played++;
  if (won) { st.won++; st.streak++; st.best = Math.max(st.best, st.streak); }
  else st.streak = 0;
  saveStats(st);
  if (G.mode === "daily") saveDaily(G);
  render();
  showResult(G);
  if (won) confetti();
}

function shareText(G) {
  const sq = G.guesses.map(g => ({ core: "🟩", sit: "🟧", miss: "🟥" }[g.v])).join("") || "—";
  const title = G.mode === "daily" ? `ITEMDLE #${dailyNum()} · Daily` : "ITEMDLE · Unlimited";
  const o = G.won ? `Order solved in ${G.orderAttempts} ${G.orderAttempts === 1 ? "try" : "tries"}` : G.done ? "Order: DNF" : "unfinished";
  return `${title}\n${sq}\n${G.guesses.length} guesses · ${o}\n${location.href}`;
}

async function copyShare() {
  const G = currentG();
  if (!G) return;
  const txt = shareText(G);
  try {
    await navigator.clipboard.writeText(txt);
    toast("📋 Result copied to clipboard!");
  } catch (e) {
    const ta = document.createElement("textarea");
    ta.value = txt;
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); toast("📋 Result copied!"); }
    catch (_) { prompt("Copy your result:", txt); }
    ta.remove();
  }
}
