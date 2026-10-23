// Page-turn swipe between the bottom tabs: the page follows the finger with a slight 3D turn,
// then flips out and the next page turns in, with a short paper sound and a tiny vibration.
// The sound is synthesised (filtered noise), so there is no audio file to load.

let ctx = null;
// page-turn sound: 'book' (default), 'wood', 'air' or 'off'; task-done chime on/off
export const SOUNDS = [['book', 'ورقة كتاب'], ['wood', 'نقرة خشب'], ['air', 'هوا خفيف'], ['off', 'بدون صوت']];
export const soundKind = () => { try { const v = localStorage.getItem('masar.flipSound'); return v === 'on' || !v ? 'book' : v; } catch { return 'book'; } };
export const soundOn = () => soundKind() !== 'off';
export function setSound(v) { try { localStorage.setItem('masar.flipSound', v === true ? 'book' : v === false ? 'off' : v); } catch {} }
export const chimeOn = () => { try { return localStorage.getItem('masar.chime') !== 'off'; } catch { return true; } };
export function setChime(on) { try { localStorage.setItem('masar.chime', on ? 'on' : 'off'); } catch {} }

function ac() {
  ctx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
// filtered noise burst: the body of paper and air sounds
function noise(a, t, len, { type = 'bandpass', f0, f1, q = 0.8, peak = 0.15, attack = 0.015 }) {
  const n = Math.floor(a.sampleRate * len), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + len);
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  src.connect(f).connect(g).connect(a.destination); src.start(t); src.stop(t + len + 0.02);
}
function tone(a, t, freq, len, { type = 'sine', peak = 0.12, to } = {}) {
  const o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + len);
  const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + len + 0.02);
}

/** The page-turn sound, as chosen in settings. */
export function paperSound(kind = soundKind()) {
  if (kind === 'off') return;
  try {
    const a = ac(), t = a.currentTime;
    if (kind === 'wood') { tone(a, t, 620, 0.09, { type: 'triangle', peak: 0.16, to: 420 }); noise(a, t, 0.04, { f0: 2500, f1: 1800, peak: 0.05 }); return; }
    if (kind === 'air') { noise(a, t, 0.32, { type: 'lowpass', f0: 600, f1: 2400, q: 0.4, peak: 0.09, attack: 0.12 }); return; }
    // book: the page lifts (crisp), sweeps across (swish), then lands (soft tap)
    noise(a, t, 0.06, { type: 'highpass', f0: 5200, f1: 3800, peak: 0.05, attack: 0.005 });
    noise(a, t + 0.03, 0.26, { f0: 2600, f1: 650, q: 0.7, peak: 0.14, attack: 0.04 });
    tone(a, t + 0.25, 150, 0.07, { peak: 0.07, to: 90 });
  } catch {}
}
/** Soft two-note chime when a task is done; a short rising run when the whole day is done. */
export function doneSound(all = false) {
  if (!chimeOn()) return;
  try {
    const a = ac(), t = a.currentTime;
    const notes = all ? [523.25, 659.25, 783.99, 1046.5] : [1318.5, 1975.5];
    notes.forEach((f, i) => tone(a, t + i * (all ? 0.09 : 0.07), f, all ? 0.5 : 0.35, { peak: all ? 0.09 : 0.07 }));
  } catch {}
  try { navigator.vibrate?.(all ? [12, 40, 12, 40, 30] : 10); } catch {}
}

/** A short burst of confetti from the top, for finishing everything due today. */
export function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas'), W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
  Object.assign(c.style, { position: 'fixed', inset: '0', width: W + 'px', height: H + 'px', pointerEvents: 'none', zIndex: 40 });
  c.width = W * dpr; c.height = H * dpr; document.body.appendChild(c);
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const cols = ['#1D6A50', '#4CB089', '#E2AA48', '#A86E14', '#2F5D8A', '#E3806B'];
  const ps = [...Array(90)].map(() => ({ x: W / 2 + (Math.random() - .5) * W * .5, y: -10, vx: (Math.random() - .5) * 7, vy: Math.random() * 3 + 2, r: Math.random() * 6 + 4, a: Math.random() * 6, va: (Math.random() - .5) * .3, c: cols[Math.random() * cols.length | 0] }));
  const t0 = performance.now();
  (function frame(now) {
    g.clearRect(0, 0, W, H);
    ps.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.vx *= 0.99; p.a += p.va; g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.fillStyle = p.c; g.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); g.restore(); });
    if (now - t0 < 2200) requestAnimationFrame(frame); else c.remove();
  })(t0);
}

/**
 * el: the page container. neighbour(dir) → route key or null (dir: +1 next / -1 previous).
 * go(key): navigate. enabled(): whether swiping is allowed right now.
 */
export function attachFlip(el, { neighbour, go, enabled }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let s = null; // {x, y, t, lock, dir, target}
  const W = () => el.clientWidth || innerWidth;
  const set = (dx, anim) => {
    el.style.transition = anim ? `transform ${anim}ms cubic-bezier(.2,.7,.2,1), opacity ${anim}ms` : 'none';
    const k = Math.max(-1, Math.min(1, dx / W()));
    // hinge on the side the page is leaving from, like turning a page in a book
    el.style.transformOrigin = dx < 0 ? 'left center' : 'right center';
    el.style.transform = dx ? `perspective(1400px) translateX(${dx}px) rotateY(${k * 28}deg)` : '';
    el.style.opacity = dx ? String(1 - Math.abs(k) * 0.45) : '';
  };
  const clear = () => { el.style.transition = el.style.transform = el.style.opacity = el.style.transformOrigin = ''; el.style.willChange = ''; };

  el.addEventListener('touchstart', e => {
    if (e.touches.length !== 1 || !enabled() || e.target.closest('input,textarea,select,.chips,.hscroll,.nosw,canvas')) { s = null; return; }
    const p = e.touches[0]; s = { x: p.clientX, y: p.clientY, t: Date.now(), lock: null, dx: 0 };
  }, { passive: true });

  el.addEventListener('touchmove', e => {
    if (!s) return;
    const p = e.touches[0], dx = p.clientX - s.x, dy = p.clientY - s.y;
    if (!s.lock) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }
      if (Math.abs(dx) < 12) return;
      // like an Arabic book: pull the page to the right to go forward
      s.lock = 'x'; s.dir = dx > 0 ? 1 : -1; s.target = neighbour(s.dir); el.style.willChange = 'transform';
    }
    s.dx = dx;
    // no page on that side: let it give a little, then resist
    set(s.target ? dx : dx * 0.18, 0);
  }, { passive: true });

  const end = () => {
    if (!s || s.lock !== 'x') { s = null; return; }
    const { dx, target, dir } = s, v = Math.abs(dx) / Math.max(1, Date.now() - s.t); s = null;
    if (!target || (Math.abs(dx) < W() * 0.28 && v < 0.45) || Math.sign(dx) !== dir) { set(0, 220); setTimeout(clear, 230); return; }
    paperSound(); navigator.vibrate?.(8);
    if (reduce) { clear(); go(target); return; }
    set(dir * W() * 1.05, 190);
    setTimeout(() => {
      go(target);
      // the new page starts turned from the other side and settles flat
      requestAnimationFrame(() => {
        set(-dir * W() * 0.45, 0);
        requestAnimationFrame(() => requestAnimationFrame(() => { set(0, 260); setTimeout(clear, 270); }));
      });
    }, 190);
  };
  el.addEventListener('touchend', end, { passive: true });
  el.addEventListener('touchcancel', () => { if (s) { s = null; set(0, 200); setTimeout(clear, 210); } }, { passive: true });
}
