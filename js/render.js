/* render.js — rendering, search, overlays */

let dropList = [];

function render() {
  const pb = $("#patchBadge");
  pb.textContent = SRC === "live" ? ("patch " + VER) : ("patch " + VER + " · offline cache");
  pb.classList.toggle("off", SRC !== "live");

  const strip = $("#modeStrip"), G = currentG();
  if (activeMode === "daily") {
    const d = new Date(), done = G && G.done;
    strip.innerHTML = `<span class="dayNum">#${dailyNum()}</span>·
      <span>${d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
      ${done ? `<span class="pill ${G.won ? "core" : "miss"}">${G.won ? "COMPLETED ✓" : "GAVE UP"}</span>` : ""}
      <span style="flex:1"></span>
      <button class="btn small" data-act="share">📤 Share result</button>`;
  } else {
    strip.innerHTML = `<span>Endless mode — random champion every round.</span>
      <span style="flex:1"></span>
      <button class="btn small" data-act="newfree">🎲 New random build</button>`;
  }
  $("#gameArea").innerHTML = gameHTML(G);
  const inp = $("#guessInput");
  if (inp && !G.done && G.phase === "items") inp.focus();
}

function gameHTML(G) {
  if (!G) return `<div class="panelBox"><p style="color:var(--mut)">No data available.</p></div>`;
  const c = G.champ, foundN = G.found.length;

  const tray = Array.from({ length: 6 }, (_, i) => {
    const id = G.found[i];
    const it = id ? ITEMS.find(x => String(x.id) === String(id)) : null;
    return `<div class="slot ${it ? "filled" : ""}" title="${it ? it.name : "???"}">${it ? imgTag(itemIconURL(it), it.name) : ""}</div>`;
  }).join("");

  const hist = G.guesses.slice().reverse().map((g, ri) => {
    const n = G.guesses.length - ri;
    const pill = g.v === "core" ? `<span class="pill core">CORE ITEM</span>`
      : g.v === "sit" ? `<span class="pill sit">SITUATIONAL</span>`
      : `<span class="pill miss">NOT BUILT</span>`;
    return `<div class="hRow"><span class="n">#${n}</span>${imgTag(itemIconURL(g.item), g.item.name)}<span class="nm">${g.item.name}</span>${pill}</div>`;
  }).join("") || `<div class="emptyNote">Type an item name above to make your first guess…</div>`;

  let orderHTML = "";
  if (G.phase === "order" && !G.done) {
    const placed = new Set(G.orderSlots.filter(Boolean));
    const chips = G.found.filter(id => !placed.has(id)).map(id => {
      const it = ITEMS.find(x => String(x.id) === String(id));
      return it ? `<button class="iChip" data-act="chip" data-id="${it.id}" title="${it.name}">${imgTag(itemIconURL(it), it.name)}<span class="tip">${it.name}</span></button>` : "";
    }).join("");

    const slots = G.orderSlots.map((id, i) => {
      const it = id ? ITEMS.find(x => String(x.id) === String(id)) : null;
      const fb = G.orderFeedback ? (G.orderFeedback[i] ? "ok" : "bad") : "";
      return `<button class="oSlot ${id ? "filled" : ""} ${fb}" data-act="slot" data-i="${i}" ${!id ? 'style="cursor:default"' : ""}>
        <span class="ord">${ord(i)}</span>
        <span class="imgBox">${it ? imgTag(itemIconURL(it), it.name) : ""}</span></button>`;
    }).join("");

    const fbMsg = G.orderFeedback ? `<span class="orderMsg">Positions correct: <b>${G.orderFeedback.filter(Boolean).length}/6</b> — keep rearranging!</span>` : "";
    orderHTML = `
    <div class="panelBox orderBox" id="orderPanel">
      <h3>🏆 BONUS ROUND — Guess the purchase order!</h3>
      <p class="orderSub">All 6 items found! Now place them in the order they are most commonly bought — <b>1st item</b> (left) to <b>6th item</b> (right). Click a chip to place it, click a slot to remove it.</p>
      <div class="chipPool">${chips || `<span style="color:var(--mut2);font-size:12.5px;margin:auto">All items placed — submit or rearrange!</span>`}</div>
      <div class="orderSlots">${slots}</div>
      <div class="orderCtl">
        <button class="btn" data-act="submit-order" ${G.orderSlots.some(x => x === null) ? "disabled" : ""}>Submit order</button>
        <button class="btn ghost" data-act="clear-order">Clear</button>
        ${fbMsg}<span style="flex:1"></span>
        <span class="orderMsg">Attempts: <b>${G.orderAttempts}</b></span>
      </div>
    </div>`;
  }

  let revealHTML = "";
  if (G.done) {
    const rows = G.champ.core.map((it, i) => {
      const item = typeof it === 'string' ? ITEMS.find(x => String(x.id) === String(it)) : it;
      return item ? `<div class="rRow"><span class="rk">${ord(i)}</span>${imgTag(itemIconURL(item), item.name)}<span class="nm">${item.name}</span></div>` : "";
    }).join("");
    revealHTML = `
    <div class="panelBox"><h3>📜 Most common build — ${G.champ.name}</h3><div class="revealList">${rows}</div></div>
    <div class="panelBox doneBanner ${G.won ? "win" : "loss"}">
      <span class="big">${G.won ? "✅ Challenge complete!" : "❌ " + (G.mode === "daily" ? "Daily failed" : "Build revealed")}</span>
      <span style="flex:1"></span>
      <button class="btn small" data-act="share">📤 Share result</button>
      ${G.mode === "free" ? `<button class="btn small ghost" data-act="newfree">🎲 Next champion</button>` : ""}
    </div>`;
  }

  const guessUI = (G.done || G.phase !== "items") ? "" : `
    <div class="panelBox">
      <h3>🔍 Guess an item</h3>
      <div class="searchWrap">
        <div class="searchRow">
          <div class="searchBox">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.8-3.8"/></svg>
            <input id="guessInput" type="text" autocomplete="off" placeholder="Type an item name…">
          </div>
        </div>
        <div class="drop" id="drop"></div>
      </div>
    </div>`;

  return `
  <div class="gameGrid">
    <aside class="champCard"><div class="inner">
      <div class="champImgWrap">${imgTag(champIconURL(c), c.name, champAltURL(c))}</div>
      <div class="champName">${c.name}</div>
      <div class="champMeta"><span class="chip gold">${c.role}</span><span class="chip teal">Patch ${VER}</span></div>
      <p class="hintTxt">Guess the <b>${foundN}/6</b> items of this champion's most commonly built item set.</p>
    </div></aside>
    <div class="playCol">
      <div class="panelBox">
        <h3>🎒 Core build progress <span class="countBadge">${foundN} / 6</span></h3>
        <div class="tray">${tray}</div>
        <div class="trayNote">Found items are shown here — their <b>purchase order</b> stays hidden until you unlock the bonus round.</div>
      </div>
      ${guessUI}
      <div class="panelBox">
        <h3>📋 Guesses <span class="countBadge">${G.guesses.length}</span></h3>
        <div class="hist">${hist}</div>
        ${!G.done ? `<div class="giveRow"><button class="linkBtn" data-act="giveup">🏳️ Give up &amp; reveal build</button></div>` : ""}
      </div>
      ${orderHTML}
      ${revealHTML}
    </div>
  </div>`;
}

/* ---- search ---- */
function setupSearch() {
  document.addEventListener("input", e => {
    if (e.target.id !== "guessInput") return;
    const q = e.target.value.trim(), drop = $("#drop");
    if (!drop) return;
    if (!q) { drop.classList.remove("open"); drop.innerHTML = ""; return; }
    const nq = norm(q);
    const G = currentG();
    const guessedIds = G ? G.guessed : new Set();
    dropList = ITEMS.filter(it => norm(it.name).includes(nq) && !guessedIds.has(String(it.id))).sort((a, b) => {
      const an = norm(a.name).startsWith(nq) ? 0 : 1;
      const bn = norm(b.name).startsWith(nq) ? 0 : 1;
      return an - bn || a.name.localeCompare(b.name);
    }).slice(0, 40);
    drop.innerHTML = dropList.length ? dropList.map((it, i) => {
      const nm = it.name.replace(new RegExp("(" + q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "i"), "<mark>$1</mark>");
      return `<div class="dropItem ${i === 0 ? "hl" : ""}" data-act="pick" data-id="${it.id}">${imgTag(itemIconURL(it), it.name)}<span>${nm}</span></div>`;
    }).join("") : `<div class="dropEmpty">No item found for "${q}"</div>`;
    drop.classList.add("open");
  });

  document.addEventListener("keydown", e => {
    const inp = $("#guessInput");
    if (document.activeElement !== inp) return;
    if (e.key === "Enter") { e.preventDefault(); if (dropList.length) pickItem(dropList[0].id); }
    else if (e.key === "Escape") { const d = $("#drop"); d && d.classList.remove("open"); inp.blur(); }
    else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = $("#drop"); if (!d) return;
      const rows = [...d.querySelectorAll(".dropItem")];
      let idx = rows.findIndex(r => r.classList.contains("hl"));
      idx = e.key === "ArrowDown" ? Math.min(idx + 1, rows.length - 1) : Math.max(idx - 1, 0);
      rows.forEach(r => r.classList.remove("hl"));
      if (rows[idx]) { rows[idx].classList.add("hl"); rows[idx].scrollIntoView({ block: "nearest" }); }
    }
  });

  document.addEventListener("focusout", e => {
    if (e.target.id === "guessInput") setTimeout(() => { const d = $("#drop"); d && d.classList.remove("open"); }, 160);
  });
}

function pickItem(id) {
  const it = ITEMS.find(x => String(x.id) === String(id));
  if (!it) return;
  const inp = $("#guessInput");
  if (inp) inp.value = "";
  const d = $("#drop");
  d && d.classList.remove("open");
  dropList = [];
  doGuess(it);
}

/* ---- overlays ---- */
function showResult(G) {
  const card = $("#ovResultCard");
  const sq = G.guesses.map(g => ({ core: "🟩", sit: "🟧", miss: "🟥" }[g.v])).join("");
  const oT = G.won ? `${G.orderAttempts} ${G.orderAttempts === 1 ? "try" : "tries"} to nail the order` : G.done ? "Build order: DNF" : "—";
  card.innerHTML = `
    <button class="xClose" data-act="close-result">✕</button>
    ${imgTag(champIconURL(G.champ), G.champ.name, champAltURL(G.champ)).replace("<img ", '<img class="miniChamp" ')}
    <div class="emj" style="margin-top:10px">${G.won ? "🎉" : ""}</div>
    <h2>${G.won ? "Build mastered!" : "Better luck next time"}</h2>
    <p class="sub">${G.champ.name} · ${G.champ.role} · ${G.mode === "daily" ? "Daily #" + dailyNum() : "Unlimited"}</p>
    <div class="statGrid">
      <div class="st"><div class="v">${G.guesses.length}</div><div class="k">Guesses</div></div>
      <div class="st"><div class="v" style="color:#5ad06c">${G.guesses.filter(g => g.v === "core").length}</div><div class="k">Core hits</div></div>
      <div class="st"><div class="v" style="color:var(--orange)">${G.guesses.filter(g => g.v === "sit").length}</div><div class="k">Situational</div></div>
      <div class="st"><div class="v">${G.won ? G.orderAttempts : "—"}</div><div class="k">Order tries</div></div>
    </div>
    <div class="squares">${sq}</div>
    <p class="sub" style="margin-top:-6px">${oT}</p>
    <div class="oBtns">
      <button class="btn" data-act="share">📤 Share</button>
      ${G.mode === "free" ? `<button class="btn ghost" data-act="ov-newfree">🎲 Next champion</button>` : `<button class="btn ghost" data-act="close-result">Close</button>`}
    </div>`;
  $("#ovResult").classList.add("open");
}

function openStats() {
  const s = getStats(), wr = s.played ? Math.round(s.won / s.played * 100) : 0;
  $("#ovStatsCard").innerHTML = `
    <button class="xClose" data-act="close-stats">✕</button>
    <h2>📊 Your statistics</h2>
    <div class="statGrid">
      <div class="st"><div class="v">${s.played}</div><div class="k">Played</div></div>
      <div class="st"><div class="v">${wr}%</div><div class="k">Win rate</div></div>
      <div class="st"><div class="v">${s.streak}</div><div class="k">Streak</div></div>
      <div class="st"><div class="v">${s.best}</div><div class="k">Best</div></div>
    </div>
    <p style="margin-bottom:14px">Win a game by finding all 6 core items <b style="color:var(--gold2)">and</b> solving the bonus purchase-order round.</p>
    <div class="oBtns"><button class="btn" data-act="close-stats">Close</button></div>`;
  $("#ovStats").classList.add("open");
}

function askConfirm(t, m, cb) {
  $("#cfTitle").textContent = t;
  $("#cfMsg").textContent = m;
  confirmCb = cb;
  $("#ovConfirm").classList.add("open");
}

const closeAll = () => {
  document.querySelectorAll(".overlay").forEach(o => o.classList.remove("open"));
  confirmCb = null;
};
