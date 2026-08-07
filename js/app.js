/* app.js — event wiring and boot */

function setMode(m) {
  if (activeMode === m) return;
  const G = currentG();
  const go = () => {
    activeMode = m;
    $("#tabDaily").classList.toggle("active", m === "daily");
    $("#tabFree").classList.toggle("active", m === "free");
    render();
  };
  if (G && !G.done && G.guesses.length > 0) {
    askConfirm("Switch mode?", "Your current round on " + G.champ.name + " will be abandoned.", () => {
      if (m === "free" && !freeG) newFree();
      go();
    });
  } else {
    if (m === "free" && !freeG) newFree();
    go();
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
        askConfirm("Start a new round?", "Current progress will be lost.", () => { newFree(); render(); });
      else { newFree(); render(); }
      break;
    }
    case "ov-newfree": closeAll(); newFree(); render(); break;
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
$("#tabFree").addEventListener("click", () => setMode("free"));

addEventListener("resize", () => {
  const cv = $("#fx");
  cv.width = innerWidth;
  cv.height = innerHeight;
});

/* boot */
(async function boot() {
  setupSearch();
  await loadRiotData();
  initDaily();
  newFree();
  $("#loader").style.display = "none";
  render();
  if (SRC === "offline") toast("⚠️ Riot CDN unreachable — loaded offline patch 16.15 cache.");
})();
