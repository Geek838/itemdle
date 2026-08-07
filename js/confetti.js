/* confetti.js — canvas confetti animation */

function confetti() {
  const cv = $("#fx"), ctx = cv.getContext("2d");
  cv.width = innerWidth;
  cv.height = innerHeight;
  const cols = ["#c8aa6e", "#0ac8b9", "#3fb950", "#ff4d5e", "#ffa63d", "#f0e6d2", "#0acbe6"];
  const parts = Array.from({ length: 160 }, () => ({
    x: Math.random() * cv.width,
    y: -20 - Math.random() * cv.height * 0.4,
    w: 6 + Math.random() * 7,
    h: 8 + Math.random() * 8,
    vy: 2 + Math.random() * 3.4,
    vx: -1.4 + Math.random() * 2.8,
    r: Math.random() * Math.PI,
    vr: -0.12 + Math.random() * 0.24,
    c: cols[Math.floor(Math.random() * cols.length)]
  }));
  const t0 = performance.now();
  (function tick(t) {
    const el = t - t0;
    ctx.clearRect(0, 0, cv.width, cv.height);
    parts.forEach(p => {
      p.y += p.vy;
      p.x += p.vx + Math.sin(p.y / 38);
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = p.c;
      ctx.globalAlpha = Math.max(0, 1 - el / 2600);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    if (el < 2700) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  })(t0);
}
