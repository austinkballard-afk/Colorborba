// Colorborba — a precision pigment-pouring puzzle.
//
// Press and hold a pigment jar to pour it into the central well. Because the
// well's color is the mass-weighted average of everything in it, only the
// *ratio* of pigments matters — and every pour shifts all ratios at once, so
// landing an exact target color is a game of feel, planning, and recovery.
//
// This file owns the game loop, the pour/scrape/wash mechanics, scoring flow,
// rendering of the play field, and all the juice.

(function () {
  'use strict';

  const C = window.Color;

  // --- Tunables ---
  const POUR_RATE = 1.6;            // mass units per second at full flow
  const MIN_POUR = 0.05;           // a quick tap still adds this much
  const MATCH_DIST_MAX = 0.62;     // RYB distance mapped to 0% on the meter
  const WELL_BASE_RADIUS = 44;
  const WELL_MAX_RADIUS = 84;
  const PIG_BASE_RADIUS = 17;
  const OVERLAY_DELAY_MS = 660;

  // --- DOM ---
  const canvas = document.getElementById('game');
  const ctx2d = canvas.getContext('2d');
  const levelValueEl = document.getElementById('level-value');
  const scoreValueEl = document.getElementById('score-value');
  const bestValueEl = document.getElementById('best-value');
  const streakChipEl = document.getElementById('streak-chip');
  const streakValueEl = document.getElementById('streak-value');
  const targetSwatchEl = document.getElementById('target-swatch');
  const targetNameEl = document.getElementById('target-name');
  const matchFillEl = document.getElementById('match-fill');
  const matchPctEl = document.getElementById('match-pct');
  const scrapeBtn = document.getElementById('scrape-btn');
  const scrapeCountEl = document.getElementById('scrape-count');
  const washBtn = document.getElementById('wash-btn');
  const hintToast = document.getElementById('hint-toast');
  const overlay = document.getElementById('overlay');
  const overlayStars = document.getElementById('overlay-stars');
  const overlayTitle = document.getElementById('overlay-title');
  const overlaySubtitle = document.getElementById('overlay-subtitle');
  const overlayAward = document.getElementById('overlay-award');
  const overlayBreakdown = document.getElementById('overlay-breakdown');
  const overlayBtn = document.getElementById('overlay-btn');

  // --- Canvas sizing ---
  let dpr = Math.max(1, window.devicePixelRatio || 1);
  let width = 0, height = 0, centerX = 0, wellY = 0;

  // --- Game state ---
  let state = 'playing';            // 'playing' | 'solved'
  let levelData = null;
  let well = null;                  // Blob; well.mass is real, color is the mix
  let pigments = [];                // Blob[] with { id, reserve, capacity }
  let target = null;                // RYB target color
  let targetName = '';
  let tolerance = 0.08;

  let pouring = null;               // { pigment, chunk:{id,color,mass}, elapsed }
  let pourHistory = [];             // stack of poured chunks for scrape/undo
  let undosLeft = 3;
  let undoCount = 0;
  let washCount = 0;
  let totalPoured = 0;
  let wastedMass = 0;
  let pourDropAccum = 0;

  let ripples = [];
  let firstPourDone = false;
  let solveTimer = 0;

  const scoreState = new window.Score.ScoreState();
  const particles = new window.Particles.ParticleSystem();

  // --- Layout ---
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
    wellY = Math.min(Math.max(height * 0.40, 230), height - 250);
    if (well) { well.x = centerX; well.y = wellY; }
    layoutPigments();
  }

  function layoutPigments() {
    if (!pigments.length) return;
    const n = pigments.length;
    const margin = Math.max(42, width * 0.13);
    const span = Math.max(1, width - margin * 2);
    const baseY = Math.min(height - 110, height * 0.74);
    const amp = Math.min(48, span * 0.10);
    for (let i = 0; i < n; i++) {
      const f = n === 1 ? 0.5 : i / (n - 1);
      const x = margin + f * span;
      const y = baseY - Math.sin(f * Math.PI) * amp;
      pigments[i].homeX = x;
      pigments[i].homeY = y;
      pigments[i].bobPhase = pigments[i].bobPhase || Math.random() * Math.PI * 2;
    }
  }

  // --- Level lifecycle ---
  function loadLevel(level) {
    levelData = window.Level.generateLevel(level);
    target = levelData.target.slice();
    tolerance = levelData.tolerance;

    well = new window.Blob({ x: centerX, y: wellY, color: [0, 0, 0], radius: WELL_BASE_RADIUS, mass: 0.0001, mode: 'free' });
    well.mass = 0;

    pigments = levelData.tray.map((entry) => {
      const b = new window.Blob({
        x: centerX, y: height * 0.74,
        color: entry.color,
        radius: PIG_BASE_RADIUS,
        mass: levelData.reserveCap,
        mode: 'orbit',
        wobbleAmp: 0, wobbleFreq: 0,
      });
      b.id = entry.id;
      b.capacity = levelData.reserveCap;
      b.reserve = levelData.reserveCap;
      b.bobPhase = Math.random() * Math.PI * 2;
      b.bobSpeed = 0.6 + Math.random() * 0.5;
      return b;
    });
    layoutPigments();

    pouring = null;
    pourHistory = [];
    undosLeft = levelData.undos;
    undoCount = 0;
    washCount = 0;
    totalPoured = 0;
    wastedMass = 0;
    ripples = [];
    state = 'playing';

    scoreState.beginLevel(level);
    overlay.classList.add('hidden');

    targetSwatchEl.style.backgroundColor = C.rybToCss(target);
    targetName = window.Namer.nameColor(C.rybToRgb(target));
    targetNameEl.innerHTML = `${targetName}<span class="blend-hint">${levelData.recipeSize}-mix</span>`;

    if (level === 1 && !firstPourDone) {
      hintToast.classList.remove('hidden');
    } else {
      hintToast.classList.add('hidden');
    }

    refreshHud();
    updateMatchMeter();
  }

  // --- Pour mechanics ---
  function applyPourAmount(pig, dm) {
    if (dm <= 0) return;
    well.color = C.mix(well.color, well.mass, pig.color, dm);
    well.mass += dm;
    pig.reserve = Math.max(0, pig.reserve - dm);
    pig.mass = pig.reserve;
    totalPoured += dm;
    well.squashImpulse = Math.min(0.45, well.squashImpulse + dm * 0.5);
  }

  function onPourStart(pig) {
    if (state !== 'playing' || pig.reserve <= 0.0001) return;
    pouring = { pigment: pig, chunk: { id: pig.id, color: pig.color.slice(), mass: 0 }, elapsed: 0 };
  }

  function onPourEnd(pig) {
    if (!pouring || pouring.pigment !== pig) return;
    // A brief tap should still register a small, usable amount.
    if (pouring.chunk.mass < MIN_POUR && pig.reserve > 0.0001) {
      const topUp = Math.min(MIN_POUR - pouring.chunk.mass, pig.reserve);
      applyPourAmount(pig, topUp);
      pouring.chunk.mass += topUp;
    }
    if (pouring.chunk.mass > 0) {
      pourHistory.push(pouring.chunk);
      if (!firstPourDone) {
        firstPourDone = true;
        hintToast.classList.add('hidden');
      }
      ripples.push(makeRipple(well.x, well.y, well.radius, well.color, 420));
    }
    pouring = null;
    checkSolve();
    refreshHud();
    updateMatchMeter();
  }

  function scrape() {
    if (state !== 'playing' || !pourHistory.length || undosLeft <= 0) return;
    const chunk = pourHistory.pop();
    well.color = C.unmix(well.color, well.mass, chunk.color, chunk.mass);
    well.mass = Math.max(0, well.mass - chunk.mass);
    if (well.mass < 0.0005) well.mass = 0;
    const pig = pigments.find((p) => p.id === chunk.id);
    if (pig) {
      pig.reserve = Math.min(pig.capacity, pig.reserve + chunk.mass);
      pig.mass = pig.reserve;
    }
    wastedMass += chunk.mass;
    undosLeft--;
    undoCount++;
    well.squashImpulse = 0.4;
    ripples.push(makeRipple(well.x, well.y, well.radius, chunk.color, 380));
    refreshHud();
    updateMatchMeter();
  }

  function wash() {
    if (state !== 'playing') return;
    well.color = [0, 0, 0];
    well.mass = 0;
    for (const p of pigments) { p.reserve = p.capacity; p.mass = p.reserve; }
    pourHistory = [];
    undosLeft = levelData.undos;
    washCount++;
    pouring = null;
    scoreState.breakStreak();
    well.squashImpulse = 0.5;
    ripples.push(makeRipple(well.x, well.y, well.radius * 1.3, [0.4, 0.5, 0.7], 520));
    refreshHud();
    updateMatchMeter();
  }

  function checkSolve() {
    if (state !== 'playing' || well.mass <= 0) return;
    const dist = C.distance(well.color, target);
    if (dist < tolerance) onSolved(dist);
  }

  function onSolved(dist) {
    state = 'solved';
    solveTimer = 0;

    const distRatio = Math.min(1, dist / tolerance);
    const scrapesUsed = undoCount + washCount * 2;
    const wasteFrac = Math.min(1, wastedMass / Math.max(0.001, totalPoured));
    const result = scoreState.onSolve({ distRatio, scrapesUsed, wasteFrac });

    particles.burst(well.x, well.y, target, 42);
    ripples.push(makeRipple(well.x, well.y, well.radius * 0.9, target, 900, well.radius * 4.2));

    refreshHud();
    window.setTimeout(() => showOverlay(result), OVERLAY_DELAY_MS);
  }

  function showOverlay(result) {
    overlayStars.innerHTML = [0, 1, 2]
      .map((i) => `<span class="star${i < result.stars ? ' on' : ''}">&#9733;</span>`)
      .join('');
    overlayTitle.textContent = result.stars === 3 ? 'Bullseye!' : result.stars === 2 ? 'Matched!' : 'Close enough';
    overlaySubtitle.textContent = `You mixed ${targetName}.`;
    overlayAward.textContent = `+${result.award.toLocaleString()}`;
    const fmt = (m) => `×${m.toFixed(2)}`;
    overlayBreakdown.innerHTML =
      `<span>Accuracy <b>${fmt(result.accuracy)}</b></span>` +
      `<span>Efficiency <b>${fmt(result.efficiency)}</b></span>` +
      `<span>Speed <b>${fmt(result.speed)}</b></span>` +
      (result.streakLevel > 0 ? `<span>Streak <b>${fmt(result.streak)}</b></span>` : '');
    overlay.classList.remove('hidden');
  }

  function nextLevel() {
    loadLevel(levelData.level + 1);
  }

  // --- HUD / meter ---
  function refreshHud() {
    levelValueEl.textContent = String(levelData ? levelData.level : 1);
    scoreValueEl.textContent = scoreState.score.toLocaleString();
    bestValueEl.textContent = scoreState.bestScore.toLocaleString();
    if (scoreState.streakLevel > 0) {
      streakChipEl.classList.remove('hidden');
      streakValueEl.textContent = `×${scoreState.streakLevel}`;
    } else {
      streakChipEl.classList.add('hidden');
    }
    scrapeCountEl.textContent = String(undosLeft);
    scrapeBtn.disabled = state !== 'playing' || undosLeft <= 0 || pourHistory.length === 0;
    washBtn.disabled = state !== 'playing' || (well && well.mass <= 0);
  }

  function matchColorFor(pct, matched) {
    if (matched) return '#ffd45e';
    if (pct >= 88) return '#57c98a';
    if (pct >= 72) return '#9fd24f';
    if (pct >= 50) return '#e0b84f';
    return '#e0556b';
  }

  function currentMatch() {
    if (!well || well.mass <= 0.0005) return { pct: 0, matched: false, dist: 1 };
    const dist = C.distance(well.color, target);
    const pct = Math.max(0, Math.min(100, Math.round(100 * (1 - dist / MATCH_DIST_MAX))));
    return { pct, matched: dist < tolerance, dist };
  }

  function updateMatchMeter() {
    const m = currentMatch();
    matchFillEl.style.width = m.pct + '%';
    const col = matchColorFor(m.pct, m.matched);
    matchFillEl.style.backgroundColor = col;
    matchPctEl.textContent = m.matched ? 'MATCH' : m.pct + '%';
    matchPctEl.classList.toggle('matched', m.matched);
  }

  function makeRipple(x, y, startR, color, life, endR) {
    return { x, y, born: performance.now(), life: life || 440, color: color.slice(),
             startR: startR * 0.9, endR: endR || startR * 2.6 };
  }

  // --- Loop ---
  let lastT = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    update(dt, now / 1000, now);
    render(now / 1000, now);
    requestAnimationFrame(frame);
  }

  function update(dt, t, nowMs) {
    const intensity = window.Score.intensityFromStreak(scoreState.streakLevel);

    // Well jiggle.
    well.intensity = Math.max(intensity, pouring ? 0.5 : 0);
    well.tickAnim(dt);

    // Active pour.
    if (pouring && state === 'playing') {
      const pig = pouring.pigment;
      if (pig.reserve > 0.0001) {
        pouring.elapsed += dt;
        // Ease-in so quick taps stay gentle; full flow after ~0.18s.
        const ramp = Math.min(1, 0.35 + pouring.elapsed / 0.18 * 0.65);
        const dm = Math.min(pig.reserve, POUR_RATE * ramp * dt);
        applyPourAmount(pig, dm);
        pouring.chunk.mass += dm;
        updateMatchMeter();

        // Stream droplets falling into the well.
        pourDropAccum += dt;
        const interval = 0.045;
        while (pourDropAccum >= interval) {
          pourDropAccum -= interval;
          particles.spawnPourDroplet(pig.x, pig.y + pig.radius * 0.5, well.x, well.y - well.radius * 0.3, pig.color);
        }
      } else {
        // Ran dry mid-pour.
        onPourEnd(pig);
      }
    }

    // Pigment idle bob + jiggle.
    for (const p of pigments) {
      p.mass = p.reserve;
      p.intensity = intensity * 0.6;
      p.tickAnim(dt);
      const bob = Math.sin(t * p.bobSpeed + p.bobPhase) * 3;
      p.x = p.homeX;
      p.y = p.homeY + bob;
    }

    // Ambient sparkle around the well on a hot streak.
    if (intensity > 0 && well.mass > 0) {
      particles.emitAmbient(dt, [{ x: well.x, y: well.y, radius: well.radius, color: well.color, rate: 1 + 5 * intensity }]);
    }
    particles.update(dt);

    if (state === 'solved') solveTimer += dt;
  }

  function wellRadius() {
    if (!well || well.mass <= 0) return WELL_BASE_RADIUS * 0.62;
    return Math.min(WELL_MAX_RADIUS, well.radius);
  }

  function render(t, nowMs) {
    ctx2d.clearRect(0, 0, width, height);

    const wr = wellRadius();
    const m = currentMatch();

    // Background tint that drifts toward the current mix.
    if (well.mass > 0) {
      const rgb = C.rybToRgb(well.color);
      const g = ctx2d.createRadialGradient(centerX, wellY, wr * 0.5, centerX, wellY, Math.max(width, height) * 0.7);
      g.addColorStop(0, `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.10)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx2d.fillStyle = g;
      ctx2d.fillRect(0, 0, width, height);
    }

    // Target reference ring (outer) so you can eyeball well vs target.
    drawRing(centerX, wellY, wr + 36, 5, C.rybToCss(target), 0.5);

    // Match meter ring (arc grows with closeness).
    drawMatchRing(centerX, wellY, wr + 20, m);

    // Empty vessel hint when the well has no paint.
    if (well.mass <= 0) {
      drawRing(centerX, wellY, wr, 2, 'rgba(255,255,255,0.18)', 1, [5, 7]);
    } else {
      well.draw(ctx2d, t);
    }

    // Pour stream.
    if (pouring && pouring.pigment.reserve > 0.0001) {
      drawPourStream(pouring.pigment, t);
    }

    // Pigment jars.
    for (const p of pigments) {
      drawJar(p, t);
    }

    particles.draw(ctx2d);

    // Ripples.
    if (ripples.length) {
      ctx2d.save();
      const alive = [];
      for (const r of ripples) {
        const age = (nowMs - r.born) / r.life;
        if (age >= 1) continue;
        const eased = 1 - Math.pow(1 - age, 2);
        const radius = r.startR + (r.endR - r.startR) * eased;
        ctx2d.globalAlpha = 0.5 * (1 - age);
        ctx2d.strokeStyle = C.rybToCss(r.color);
        ctx2d.lineWidth = 3 * (1 - age) + 1;
        ctx2d.beginPath();
        ctx2d.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx2d.stroke();
        alive.push(r);
      }
      ripples = alive;
      ctx2d.restore();
    }
  }

  // --- Render helpers ---
  function drawRing(x, y, radius, lineWidth, stroke, alpha, dash) {
    ctx2d.save();
    ctx2d.globalAlpha = alpha == null ? 1 : alpha;
    ctx2d.strokeStyle = stroke;
    ctx2d.lineWidth = lineWidth;
    if (dash) ctx2d.setLineDash(dash);
    ctx2d.beginPath();
    ctx2d.arc(x, y, radius, 0, Math.PI * 2);
    ctx2d.stroke();
    ctx2d.restore();
  }

  function drawMatchRing(x, y, radius, m) {
    // Faint full track.
    drawRing(x, y, radius, 4, 'rgba(255,255,255,0.08)', 1);
    if (well.mass <= 0) return;
    const frac = Math.max(0.02, m.pct / 100);
    const col = matchColorFor(m.pct, m.matched);
    ctx2d.save();
    ctx2d.strokeStyle = col;
    ctx2d.lineWidth = m.matched ? 6 : 4;
    ctx2d.lineCap = 'round';
    if (m.matched) {
      ctx2d.shadowColor = col;
      ctx2d.shadowBlur = 18;
    }
    ctx2d.globalAlpha = 0.95;
    const start = -Math.PI / 2;
    ctx2d.beginPath();
    ctx2d.arc(x, y, radius, start, start + Math.PI * 2 * frac);
    ctx2d.stroke();
    ctx2d.restore();
  }

  function drawJar(p, t) {
    if (p.reserve <= 0.0001) {
      // Empty jar: just a faint socket so the player sees it's spent.
      drawRing(p.x, p.y, PIG_BASE_RADIUS * 0.7, 1.5, 'rgba(255,255,255,0.10)', 1, [3, 4]);
      return;
    }
    // Capacity ghost ring behind the (shrinking) jar.
    const capR = PIG_BASE_RADIUS * Math.cbrt(p.capacity);
    drawRing(p.x, p.y, capR + 4, 1.5, 'rgba(255,255,255,0.08)', 1);
    p.draw(ctx2d, t);
    // Rim light so dark/black jars stay visible on the dark field.
    drawRing(p.x, p.y, p.radius * 1.06, 1.5, 'rgba(255,255,255,0.16)', 1);
    if (pouring && pouring.pigment === p) {
      drawRing(p.x, p.y, p.radius * 1.18, 2, 'rgba(255,255,255,0.55)', 1);
    }
  }

  function drawPourStream(pig, t) {
    const sx = pig.x;
    const sy = pig.y + pig.radius * 0.4;
    const ex = well.x;
    const ey = well.y - well.radius * 0.2;
    const midX = (sx + ex) / 2 + Math.sin(t * 7) * 5;
    const midY = (sy + ey) / 2 + 18;
    ctx2d.save();
    ctx2d.strokeStyle = C.rybToCss(pig.color);
    ctx2d.globalAlpha = 0.8;
    ctx2d.lineWidth = 6;
    ctx2d.lineCap = 'round';
    ctx2d.beginPath();
    ctx2d.moveTo(sx, sy);
    ctx2d.quadraticCurveTo(midX, midY, ex, ey);
    ctx2d.stroke();
    ctx2d.restore();
  }

  // --- Wiring ---
  window.Input.attachInput(canvas, {
    getPigments: () => pigments,
    isPlaying: () => state === 'playing',
    onPourStart,
    onPourEnd,
  });

  scrapeBtn.addEventListener('click', scrape);
  washBtn.addEventListener('click', wash);
  overlayBtn.addEventListener('click', nextLevel);

  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', resize);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);

  // --- Boot ---
  resize();
  loadLevel(1);
  requestAnimationFrame((t) => { lastT = t; frame(t); });
})();
