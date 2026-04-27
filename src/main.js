// Game entry point. Boots the canvas, builds a puzzle, runs the rAF loop,
// and orchestrates absorption + win/lose state.

(function () {
  'use strict';

  const ORBITER_COUNT = 6;
  const ORBITER_RADIUS = 26;
  const CENTER_RADIUS = 56;
  const ORBITER_MASS = 1;
  const CENTER_START_MASS = 1;
  const WIN_TOLERANCE = 0.085; // RYB-space distance

  const canvas = document.getElementById('game');
  const ctx2d = canvas.getContext('2d');
  const targetSwatch = document.getElementById('target-swatch');
  const resetBtn = document.getElementById('reset-btn');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlaySubtitle = document.getElementById('overlay-subtitle');
  const overlayBtn = document.getElementById('overlay-btn');

  let dpr = Math.max(1, window.devicePixelRatio || 1);
  let width = 0;
  let height = 0;
  let centerX = 0;
  let centerY = 0;

  let state = 'playing'; // 'playing' | 'won' | 'lost'
  let center = null;
  let orbiters = [];
  let target = null; // { color: [r,y,b] }
  let ripples = []; // {x, y, born, life, color}

  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
    // Prefer visualViewport on mobile so URL-bar collapse / pinch zoom
    // give us the actual visible area.
    const vv = window.visualViewport;
    width = vv ? vv.width : window.innerWidth;
    height = vv ? vv.height : window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    centerX = width / 2;
    centerY = height / 2 + 12;
    if (center) {
      center.x = centerX;
      center.y = centerY;
    }
    // Re-clamp any free orbiters so they're not stuck outside the new bounds
    // after an orientation change.
    for (const o of orbiters) {
      if (!o.alive) continue;
      const r = o.radius;
      o.x = Math.min(Math.max(o.x, r), width - r);
      o.y = Math.min(Math.max(o.y, r), height - r);
    }
  }

  function buildPuzzle() {
    const colors = window.Puzzle.pickOrbiterColors(ORBITER_COUNT);

    center = new window.Blob({
      x: centerX,
      y: centerY,
      color: window.Puzzle.STARTER_CENTER,
      radius: CENTER_RADIUS,
      mass: CENTER_START_MASS,
      mode: 'free', // sits in place; we don't apply orbit physics to it
    });
    center.vx = 0;
    center.vy = 0;

    // Lay orbiters out around the center.
    orbiters = [];
    const baseR = Math.min(width, height) * 0.32;
    for (let i = 0; i < ORBITER_COUNT; i++) {
      const ang = (i / ORBITER_COUNT) * Math.PI * 2 + Math.random() * 0.4;
      const r = baseR + (Math.random() - 0.5) * 30;
      const dir = Math.random() < 0.5 ? -1 : 1;
      orbiters.push(new window.Blob({
        x: centerX + Math.cos(ang) * r,
        y: centerY + Math.sin(ang) * r,
        color: colors[i],
        radius: ORBITER_RADIUS,
        mass: ORBITER_MASS,
        mode: 'orbit',
        orbitRadius: r,
        orbitAngle: ang,
        orbitSpeed: dir * (0.18 + Math.random() * 0.18),
        wobbleAmp: 8 + Math.random() * 6,
        wobbleFreq: 0.6 + Math.random() * 0.7,
        wobblePhase: Math.random() * Math.PI * 2,
      }));
    }

    target = window.Puzzle.generateTarget(colors, ORBITER_MASS, CENTER_START_MASS);
    targetSwatch.style.backgroundColor = window.Color.rybToCss(target.color);

    state = 'playing';
    ripples = [];
    overlay.classList.add('hidden');
  }

  function absorb(o) {
    const before = center.color.slice();
    center.color = window.Color.mix(center.color, center.mass, o.color, o.mass);
    center.mass += o.mass;
    center.squashImpulse = Math.min(0.6, 0.25 + 0.1 * o.mass);
    ripples.push({
      x: o.x,
      y: o.y,
      born: performance.now(),
      life: 460,
      color: o.color,
      startR: o.radius * 1.0,
      endR: o.radius * 3.2,
    });
    o.alive = false;

    // Cheap "did the color actually change" guard so identical-color absorbs
    // don't break anything.
    void before;
  }

  function checkEnd() {
    if (state !== 'playing') return;
    const d = window.Color.distance(center.color, target.color);
    if (d < WIN_TOLERANCE) {
      state = 'won';
      overlayTitle.textContent = 'Nice mix!';
      overlaySubtitle.textContent = 'You matched the target color.';
      overlayBtn.textContent = 'Play again';
      overlay.classList.remove('hidden');
      return;
    }
    const remaining = orbiters.filter((o) => o.alive && o.mode === 'orbit').length;
    const inFlight = orbiters.filter((o) => o.alive && (o.mode === 'free' || o.mode === 'grabbed')).length;
    if (remaining === 0 && inFlight === 0) {
      state = 'lost';
      overlayTitle.textContent = 'Out of blobs';
      overlaySubtitle.textContent = "Couldn't quite match it. Try a new puzzle.";
      overlayBtn.textContent = 'Try again';
      overlay.classList.remove('hidden');
    }
  }

  // --- Loop ---

  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const t = now / 1000;

    update(dt, t);
    render(t, now);

    requestAnimationFrame(frame);
  }

  function update(dt, t) {
    center.tickAnim(dt);

    for (const o of orbiters) {
      if (!o.alive) continue;
      o.tickAnim(dt);
      if (o.mode === 'orbit') {
        o.updateOrbit(dt, centerX, centerY, t);
      } else if (o.mode === 'free') {
        o.updateFree(dt);

        // Bounce off the visible edges of the canvas. Restitution slightly
        // damps so the orbiter eventually settles instead of pinballing.
        const r = o.radius;
        const restitution = 0.78;
        if (o.x - r < 0) { o.x = r; o.vx = Math.abs(o.vx) * restitution; }
        if (o.x + r > width) { o.x = width - r; o.vx = -Math.abs(o.vx) * restitution; }
        if (o.y - r < 0) { o.y = r; o.vy = Math.abs(o.vy) * restitution; }
        if (o.y + r > height) { o.y = height - r; o.vy = -Math.abs(o.vy) * restitution; }

        // Absorption check.
        const dx = o.x - center.x;
        const dy = o.y - center.y;
        const dist = Math.hypot(dx, dy);
        if (dist < center.radius + o.radius * 0.4) {
          absorb(o);
        }
      }
      // 'grabbed' — position is set by input.js; no physics here.
    }

    // Remove dead orbiters from the active list.
    const before = orbiters.length;
    orbiters = orbiters.filter((o) => o.alive);
    if (before !== orbiters.length) checkEnd();
  }

  function render(t, nowMs) {
    ctx2d.clearRect(0, 0, width, height);

    // Faint goal ring at center to telegraph the absorption zone.
    ctx2d.save();
    ctx2d.globalAlpha = 0.07;
    ctx2d.strokeStyle = '#ffffff';
    ctx2d.lineWidth = 1;
    ctx2d.setLineDash([5, 7]);
    ctx2d.beginPath();
    ctx2d.arc(centerX, centerY, center.radius * 1.45, 0, Math.PI * 2);
    ctx2d.stroke();
    ctx2d.restore();

    // Center first (so orbiters render on top when they pass in front).
    center.draw(ctx2d, t);

    for (const o of orbiters) {
      if (!o.alive) continue;
      o.draw(ctx2d, t);
    }

    // Ripples on absorption.
    if (ripples.length) {
      ctx2d.save();
      const stillAlive = [];
      for (const r of ripples) {
        const age = (nowMs - r.born) / r.life;
        if (age >= 1) continue;
        const eased = 1 - Math.pow(1 - age, 2);
        const radius = r.startR + (r.endR - r.startR) * eased;
        ctx2d.globalAlpha = 0.55 * (1 - age);
        ctx2d.strokeStyle = window.Color.rybToCss(r.color);
        ctx2d.lineWidth = 3 * (1 - age) + 1;
        ctx2d.beginPath();
        ctx2d.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx2d.stroke();
        stillAlive.push(r);
      }
      ripples = stillAlive;
      ctx2d.restore();
    }

    // Live target swatch update (center color shows progress via the actual
    // center blob; target stays static, but in case devicePixelRatio shifts
    // we keep the swatch in sync with target).
    targetSwatch.style.backgroundColor = window.Color.rybToCss(target.color);
  }

  // --- Wire up input + UI ---

  const input = window.Input.attachInput(canvas, {
    getOrbiters: () => orbiters,
    getCenter: () => center,
    onGrab: () => {},
    onRelease: (blob, vx, vy) => {
      if (state !== 'playing') {
        // Snap back to orbit if the game is over.
        blob.mode = 'orbit';
        return;
      }
      blob.mode = 'free';
      blob.vx = vx;
      blob.vy = vy;
    },
  });

  resetBtn.addEventListener('click', () => {
    input.cancel();
    buildPuzzle();
  });

  overlayBtn.addEventListener('click', () => {
    input.cancel();
    buildPuzzle();
  });

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize);
  }

  // --- Boot ---

  resize();
  buildPuzzle();
  requestAnimationFrame((t) => { lastT = t; frame(t); });
})();
