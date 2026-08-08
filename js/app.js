/* app.js — event wiring and boot */

function setMode(m) {
  if (activeMode === m) return;
  // Unlimited mode disabled temporarily
  if (m === "free") {
    toast("Unlimited mode is coming soon!");
    return;
  }
  const G = currentG();
  const go = () => {
    activeMode = m;
    $("#tabDaily").classList.toggle("active", m === "daily");
    $("#tabFree").classList.toggle("active", m === "free");
    render();
  };
  if (G && !G.done && G.guesses.length > 0) {
    askConfirm("Switch mode?", "Your current round on " + G.champ.name + " will be abandoned.", async () => {
      if (m === "free" && !freeG) await newFree();
      go();
    });
  } else {
    (async () => {
      if (m === "free" && !freeG) await newFree();
      go();
    })();
  }
}

document.addEventListener("click", e => {
  const el = e.target.closest("[data-act]");
  if (!el) return;
  switch (el.dataset.act) {
    case "pick": pickItem(+el.dataset.id); break;
    case "chip": chipClick(+el.dataset.id); break;
    case "slot": slotClick(+el.dataset.i); break;
    case "clear-order": clearOrder(); break;
    case "submit-order": submitOrder(); break;
    case "giveup":
      askConfirm("Give up?", "The full build of " + currentG().champ.name + " will be revealed and the round counts as lost.", () => finishGame(false));
      break;
    case "share": copyShare(); break;
    case "newfree": {
      const G = freeG;
      if (G && !G.done && G.guesses.length > 0)
        askConfirm("Start a new round?", "Current progress will be lost.", async () => { await newFree(); render(); });
      else { (async () => { await newFree(); render(); })(); }
      break;
    }
    case "ov-newfree": closeAll(); (async () => { await newFree(); render(); })(); break;
    case "close-result": $("#ovResult").classList.remove("open"); break;
    case "close-how": $("#ovHow").classList.remove("open"); break;
    case "close-stats": $("#ovStats").classList.remove("open"); break;
    case "cf-yes": { const cb = confirmCb; closeAll(); if (cb) cb(); break; }
    case "cf-no": closeAll(); break;
  }
});

document.addEventListener("click", e => {
  if (e.target.classList && e.target.classList.contains("overlay")) closeAll();
});

$("#btnHow").addEventListener("click", () => $("#ovHow").classList.add("open"));
$("#btnStats").addEventListener("click", openStats);
$("#tabDaily").addEventListener("click", () => setMode("daily"));
// Unlimited mode disabled temporarily
// $("#tabFree").addEventListener("click", () => setMode("free"));

addEventListener("resize", () => {
  const cv = $("#fx");
  cv.width = innerWidth;
  cv.height = innerHeight;
});

/* boot */
(async function boot() {
  setupSearch();
  await loadRiotData();
  await initDaily();
  // Unlimited mode disabled temporarily - don't call newFree()
  // await newFree();
  $("#loader").style.display = "none";
  render();
  if (SRC === "offline") toast("⚠️ Riot CDN unreachable — loaded offline patch 16.15 cache.");
})();
