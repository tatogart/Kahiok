// Конфетти и прочие визуальные эффекты.

const COLORS = ['#e21b3c', '#1368ce', '#ffa602', '#26890c', '#ffffff', '#b46bff'];
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function fire(opts) {
  if (!window.confetti || reduced()) return;
  window.confetti({ colors: COLORS, disableForReducedMotion: true, zIndex: 50, ...opts });
}

export function burst(x = 0.5, y = 0.6) {
  fire({ particleCount: 120, spread: 80, startVelocity: 45, origin: { x, y } });
}

export function celebrate(duration = 3500) {
  if (!window.confetti || reduced()) return;
  const end = Date.now() + duration;
  (function frame() {
    fire({ particleCount: 4, angle: 60, spread: 60, origin: { x: 0, y: 0.75 }, startVelocity: 60 });
    fire({ particleCount: 4, angle: 120, spread: 60, origin: { x: 1, y: 0.75 }, startVelocity: 60 });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

export function rain(duration = 4000) {
  if (!window.confetti || reduced()) return;
  const end = Date.now() + duration;
  (function frame() {
    fire({ particleCount: 3, startVelocity: 0, ticks: 300, gravity: 0.6, spread: 180, origin: { x: Math.random(), y: -0.05 }, scalar: 1.1 });
    if (Date.now() < end) setTimeout(frame, 40);
  })();
}
