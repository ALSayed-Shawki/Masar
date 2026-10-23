// Page-turn swipe between the bottom tabs: the page follows the finger with a slight 3D turn,
// then flips out and the next page turns in, with a short paper sound and a tiny vibration.
// The sound is synthesised (filtered noise), so there is no audio file to load.

let ctx = null;
export const soundOn = () => { try { return localStorage.getItem('masar.flipSound') !== 'off'; } catch { return true; } };
export function setSound(on) { try { localStorage.setItem('masar.flipSound', on ? 'on' : 'off'); } catch {} }

export function paperSound() {
  if (!soundOn()) return;
  try {
    ctx ||= new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    const t = ctx.currentTime, len = 0.2, n = Math.floor(ctx.sampleRate * len);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(900, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(bp).connect(g).connect(ctx.destination); src.start(t); src.stop(t + len);
  } catch {}
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
