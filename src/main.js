// Game entry point. Boots the canvas, builds puzzles back-to-back,
// runs the rAF loop, and orchestrates absorption, pull-out, scoring,
// and visual escalation.

(function () {
  'use strict';

  const ORBITER_COUNT = 6;
  const ORBITER_RADIUS = 26;
  const CENTER_RADIUS = 56;
  const ORBITER_MASS = 1;
  const CENTER_START_MASS = 1;
  const WIN_TOLERANCE = 0.085;
  const PULLOUT_THRESHOLD = 28; // px drag before a center grab counts as a pull
  const CELEBRATION_MS = 1200;
  const SCORE_POPUP_MS = 1050;

  const canvas = document.getElementById('game');
  const ctx2d = canvas.getContext('2d');
  const targetSwatch = document.getElementById('target-swatch');
  const resetBtn = document.getElementById('reset-btn');
  const scoreValueEl = document.getElementById('score-value');
  const streakChipEl = document.getElementById('streak-chip');
  const streakValueEl = document.getElementById('streak-value');
  const bestValueEl = document.getElementById('best-value');
  const scorePopupEl = document.getElementById('score-popup');
  const overlay = document.getElementById('overlay');

  let dpr = Math.max(1, window.devicePixelRatio || 1);
  let width = 0;
  let height = 0;
  let centerX = 0;
  let centerY = 0;

  let state = 'playing'; // 'playing' | 'celebrating'
  let center = null;
  let orbiters = [];
  let target = null;
  let ripples = [];
  let centerHistory = []; // stack of { color, mass } pushed on absorb

  // While the player is dragging the center to pull a blob out.
  // null when not pulling.
  let pulling = null; // { startX, startY, x, y, color, mass }

  let celebrationStartMs = 0;

  const scoreState = new window.Score.ScoreState();
  const particles = new window.Particles.ParticleSystem();

  // --- Sizing ---

  function resize() {
    dpr = Math.max(1, window.devicePixelRatio || 1);
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
    for (const o of orbiters) {
      if (!o.alive) continue;
      const r = o.radius;
      o.x = Math.min(Math.max(o.x, r), width - r);
      o.y = Math.min(Math.max(o.y, r), height - r);
    }
  }

  // --- Puzzle lifecycle ---

  function buildPuzzle() {
    const colors = window.Puzzle.pickOrbiterColors(ORBITER_COUNT);

    center = new window.Blob({
      x: centerX,
      y: centerY,
      color: window.Puzzle.STARTER_CENTER,
      radius: CENTER_RADIUS,
      mass: CENTER_START_MASS,
      mode: 'free',
    });
    center.vx = 0;
    center.vy = 0;

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

    centerHistory = [];
    ripples = [];
    pulling = null;
    state = 'playing';
    overlay.classList.add('hidden');

    scoreState.beginPuzzle();
    refreshHud();
  }

  function absorb(o) {
    centerHistory.push({ color: o.color.slice(), mass: o.mass });
    center.color = window.Color.mix(center.color, center.mass, o.color, o.mass);
    center.mass += o.mass;
    center.squashImpulse = Math.min(0.6, 0.25 + 0.1 * o.mass);
    ripples.push({
      x: o.x,
      y: o.y,
      born: performance.now(),
      life: 460,
      color: o.color.slice(),
      startR: o.radius * 1.0,
      endR: o.radius * 3.2,
    });
    o.alive = false;
  }

  function performPullOut(releaseX, releaseY, vx, vy) {
    if (!centerHistory.length) return;
    const last = centerHistory.pop();
    center.color = window.Color.unmix(center.color, center.mass, last.color, last.mass);
    center.mass = Math.max(CENTER_START_MASS, center.mass - last.mass);
    center.squashImpulse = Math.min(0.6, 0.3);

    // Spawn the extracted blob as a free orbiter at the release point.
    const spawn = new window.Blob({
      x: releaseX,
      y: releaseY,
      color: last.color,
      radius: ORBITER_RADIUS,
      mass: last.mass,
      mode: 'free',
      orbitRadius: Math.min(width, height) * 0.32,
      orbitAngle: Math.atan2(releaseY - centerY, releaseX - centerX),
      orbitSpeed: 0.2,
      wobbleAmp: 6,
      wobbleFreq: 0.8,
      wobblePhase: Math.random() * Math.PI * 2,
    });
    spawn.vx = vx;
    spawn.vy = vy;
    orbiters.push(spawn);

    scoreState.notePull();
    refreshHud();
  }

  function checkSolved() {
    if (state !== 'playing') return;
    const d = window.Color.distance(center.color, target.color);
    if (d < WIN_TOLERANCE) {
      onSolved();
    }
  }

  function onSolved() {
    state = 'celebrating';
    celebrationStartMs = performance.now();

    const result = scoreState.onSolve();
    refreshHud();

    // Particle burst in the matched color.
    particles.burst(centerX, centerY, target.color, 36);
    // Big celebration ripple.
    ripples.push({
      x: centerX,
      y: centerY,
      born: performance.now(),
      life: 900,
      color: target.color.slice(),
      startR: center.radius * 0.9,
      endR: center.radius * 4.0,
    });

    showScorePopup(result);
  }

  function showScorePopup(result) {
    const streakBit = result.oneShot && result.streakLevel > 1
      ? `  <span style="opacity:0.85;font-size:0.7em;">streak ×${result.streakLevel}</span>`
      : '';
    scorePopupEl.innerHTML = `+${result.award.toLocaleString()}${streakBit}`;
    scorePopupEl.classList.remove('show');
    scorePopupEl.classList.remove('hidden');
    // Force reflow so the animation restarts even on rapid solves.
    void scorePopupEl.offsetWidth;
    scorePopupEl.classList.add('show');
    window.setTimeout(() => {
      scorePopupEl.classList.remove('show');
      scorePopupEl.classList.add('hidden');
    }, SCORE_POPUP_MS);
  }

  function refreshHud() {
    scoreValueEl.textContent = scoreState.score.toLocaleString();
    bestValueEl.textContent = scoreState.bestScore.toLocaleString();
    if (scoreState.streakLevel > 0) {
      streakChipEl.classList.remove('hidden');
      streakValueEl.textContent = `×${scoreState.streakLevel}`;
    } else {
      streakChipEl.classList.add('hidden');
    }
  }

  // --- Loop ---

  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    const t = now / 1000;

    update(dt, t, now);
    render(t, now);

    requestAnimationFrame(frame);
  }

  function update(dt, t, nowMs) {
    const intensity = window.Score.intensityFromStreak(scoreState.streakLevel);

    // Center jiggles harder while being pulled, plus baseline streak intensity.
    center.intensity = Math.max(intensity, pulling ? 0.7 : 0);
    center.tickAnim(dt);

    for (const o of orbiters) {
      if (!o.alive) continue;
      o.intensity = intensity * 0.85;
      o.tickAnim(dt);
      if (o.mode === 'orbit') {
        o.updateOrbit(dt, centerX, centerY, t);
      } else if (o.mode === 'free') {
        o.updateFree(dt);

        const r = o.radius;
        const restitution = 0.78;
        if (o.x - r < 0) { o.x = r; o.vx = Math.abs(o.vx) * restitution; }
        if (o.x + r > width) { o.x = width - r; o.vx = -Math.abs(o.vx) * restitution; }
        if (o.y - r < 0) { o.y = r; o.vy = Math.abs(o.vy) * restitution; }
        if (o.y + r > height) { o.y = height - r; o.vy = -Math.abs(o.vy) * restitution; }

        const dx = o.x - center.x;
        const dy = o.y - center.y;
        const dist = Math.hypot(dx, dy);
        if (state === 'playing' && dist < center.radius + o.radius * 0.4) {
          absorb(o);
        }
      }
    }

    const before = orbiters.length;
    orbiters = orbiters.filter((o) => o.alive);
    if (before !== orbiters.length) checkSolved();

    // Ambient particles around active blobs, scaled by streak intensity.
    if (intensity > 0) {
      const sources = [
        { x: center.x, y: center.y, radius: center.radius, color: center.color, rate: 1 + 4 * intensity },
      ];
      for (const o of orbiters) {
        if (!o.alive || o.mode !== 'orbit') continue;
        sources.push({ x: o.x, y: o.y, radius: o.radius, color: o.color, rate: 0.3 + 1.6 * intensity });
      }
      particles.emitAmbient(dt, sources);
    }
    particles.update(dt);

    // Celebration auto-advance.
    if (state === 'celebrating' && nowMs - celebrationStartMs >= CELEBRATION_MS) {
      buildPuzzle();
    }
  }

  function render(t, nowMs) {
    ctx2d.clearRect(0, 0, width, height);

    const intensity = window.Score.intensityFromStreak(scoreState.streakLevel);

    // Streak halo behind the center.
    if (intensity > 0) {
      ctx2d.save();
      const haloR = center.radius * (1.7 + 0.4 * intensity);
      const grad = ctx2d.createRadialGradient(center.x, center.y, center.radius * 0.6, center.x, center.y, haloR);
      const rgb = window.Color.rybToRgb(center.color);
      grad.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${0.18 * intensity})`);
      grad.addColorStop(1, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0)`);
      ctx2d.fillStyle = grad;
      ctx2d.beginPath();
      ctx2d.arc(center.x, center.y, haloR, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.restore();
    }

    // Faint goal ring at center.
    ctx2d.save();
    ctx2d.globalAlpha = 0.07;
    ctx2d.strokeStyle = '#ffffff';
    ctx2d.lineWidth = 1;
    ctx2d.setLineDash([5, 7]);
    ctx2d.beginPath();
    ctx2d.arc(centerX, centerY, center.radius * 1.45, 0, Math.PI * 2);
    ctx2d.stroke();
    ctx2d.restore();

    center.draw(ctx2d, t);

    for (const o of orbiters) {
      if (!o.alive) continue;
      o.draw(ctx2d, t);
    }

    // Pulling ghost: a stretchy "string" from center to pointer, in the
    // color of the next-to-pop absorbed blob, with a small ghost disk.
    if (pulling) {
      const dx = pulling.x - center.x;
      const dy = pulling.y - center.y;
      const dist = Math.hypot(dx, dy);
      const ghostX = pulling.x;
      const ghostY = pulling.y;
      const rgb = window.Color.rybToRgb(pulling.color);
      const css = window.Color.rgbToCss(rgb);

      // String
      ctx2d.save();
      ctx2d.strokeStyle = css;
      ctx2d.globalAlpha = Math.min(1, dist / 80);
      ctx2d.lineWidth = 6 - Math.min(4, dist / 40);
      ctx2d.lineCap = 'round';
      ctx2d.beginPath();
      ctx2d.moveTo(center.x, center.y);
      ctx2d.quadraticCurveTo(
        (center.x + ghostX) / 2 + dy * 0.05,
        (center.y + ghostY) / 2 - dx * 0.05,
        ghostX, ghostY
      );
      ctx2d.stroke();
      ctx2d.restore();

      // Ghost disk
      ctx2d.save();
      ctx2d.shadowColor = 'rgba(0, 0, 0, 0.4)';
      ctx2d.shadowBlur = 14;
      ctx2d.shadowOffsetY = 4;
      ctx2d.fillStyle = css;
      ctx2d.globalAlpha = 0.92;
      ctx2d.beginPath();
      ctx2d.arc(ghostX, ghostY, ORBITER_RADIUS * 0.9, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.restore();

      // Threshold ring hint.
      if (dist < PULLOUT_THRESHOLD) {
        ctx2d.save();
        ctx2d.strokeStyle = 'rgba(255, 255, 255, 0.35)';
        ctx2d.lineWidth = 1.5;
        ctx2d.setLineDash([3, 4]);
        ctx2d.beginPath();
        ctx2d.arc(center.x, center.y, PULLOUT_THRESHOLD, 0, Math.PI * 2);
        ctx2d.stroke();
        ctx2d.restore();
      }
    }

    // Particles (additive).
    particles.draw(ctx2d);

    // Ripples on absorption + celebration.
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

    targetSwatch.style.backgroundColor = window.Color.rybToCss(target.color);
  }

  // --- Input wiring ---

  const input = window.Input.attachInput(canvas, {
    getOrbiters: () => orbiters,
    getCenter: () => center,
    canPullCenter: () => state === 'playing' && centerHistory.length > 0,
    onGrab: ({ kind, x, y }) => {
      if (kind === 'center' && centerHistory.length > 0) {
        const last = centerHistory[centerHistory.length - 1];
        pulling = { startX: x, startY: y, x, y, color: last.color, mass: last.mass };
      }
    },
    onMove: ({ kind, x, y }) => {
      if (kind === 'center' && pulling) {
        pulling.x = x;
        pulling.y = y;
      }
    },
    onRelease: ({ kind, blob, vx, vy, releaseX, releaseY, dragDist }) => {
      if (state !== 'playing') {
        if (kind === 'orbiter' && blob) blob.mode = 'orbit';
        pulling = null;
        return;
      }

      if (kind === 'orbiter') {
        blob.mode = 'free';
        blob.vx = vx;
        blob.vy = vy;
        return;
      }

      if (kind === 'center') {
        if (dragDist >= PULLOUT_THRESHOLD) {
          performPullOut(releaseX, releaseY, vx, vy);
        }
        pulling = null;
      }
    },
  });

  resetBtn.addEventListener('click', () => {
    input.cancel();
    pulling = null;
    scoreState.notePlayerReset();
    refreshHud();
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
  refreshHud();
  requestAnimationFrame((t) => { lastT = t; frame(t); });
})();
