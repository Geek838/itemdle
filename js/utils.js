/* utils.js — helpers, DOM shortcuts, image URLs */

const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");

function hashStr(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = h << 13 | h >>> 19;
  }
  return h >>> 0;
}

const $ = q => document.querySelector(q);

function toast(m) {
  const t = $("#toast");
  t.textContent = m;
  t.classList.add("show");
  clearTimeout(t._tm);
  t._tm = setTimeout(() => t.classList.remove("show"), 2400);
}

function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function dailyNum() {
  const D0 = Date.UTC(2025, 0, 1);
  return Math.floor((Date.now() - D0) / 864e5) + 1;
}

const ord = i => ["1st", "2nd", "3rd", "4th", "5th", "6th"][i];

function phTile(label) {
  const t = String(label).split(/\s+/).map(w => w[0]).join("").replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "?";
  return "data:image/svg+xml," + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#141d3a"/><rect x="2.5" y="2.5" width="59" height="59" rx="10" fill="none" stroke="#31436e" stroke-width="2.5"/><text x="32" y="41" font-size="23" font-family="Arial,sans-serif" font-weight="700" text-anchor="middle" fill="#8ea0bd">${t}</text></svg>`
  );
}

window.imgErr = function (im) {
  const a = im.getAttribute("data-alt");
  if (a && im.getAttribute("src") !== a) { im.src = a; return; }
  im.onerror = null;
  im.src = im.getAttribute("data-ph") || phTile(im.alt || "?");
};

function imgTag(src, alt, altSrc) {
  return `<img src="${src}"${altSrc ? ` data-alt="${altSrc}"` : ""} data-ph="${phTile(alt)}" alt="${alt}" loading="lazy" onerror="imgErr(this)">`;
}

const itemIconURL = it => `${DD}/cdn/${VER}/img/item/${it.id}.png`;
const champIconURL = c => `${DD}/cdn/${VER}/img/champion/${c.key}.png`;
const champAltURL = c => `${CD}/champion-icons/${c.num}.png`;
