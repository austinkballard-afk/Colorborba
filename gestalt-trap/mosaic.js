// The Gestalt Trap — a photomosaic built as three stacked attacks on how
// vision-language models process images.
//
//   Layer 1 (macro):  a portrait carried ONLY in the per-tile mean luminance,
//                      i.e. the lowest spatial frequencies. Humans integrate this
//                      globally for free; a fixed-patch tokenizer discards it.
//   Layer 2 (tiles):  ~5,000 coherent miniature scenes. Each keeps its own
//                      texture/color; only its DC luminance is shifted to the face.
//                      So patch-level statistics read as "cluttered collage."
//   Layer 3 (poison): legible captions in a few dozen tiles — a typographic attack.
//
// Everything is generated procedurally in-browser, so the page is fully
// self-contained: no external photo library, no network.

(function () {
  'use strict';

  // --- Geometry. TILE matches a VLM's 14-16px patch size on purpose. ---
  const TILE = 16;
  const COLS = 64;
  const ROWS = 80;            // 64 x 80 = 5,120 tiles, portrait orientation
  const W = COLS * TILE;      // 1024
  const H = ROWS * TILE;      // 1280

  const TILE_COUNT = COLS * ROWS;

  // How much of each tile's own contrast to keep. < 1 leaves headroom so the
  // luminance shift toward the face rarely clips, preserving scene detail.
  const TILE_CONTRAST = 0.82;

  // ---------------------------------------------------------------------------
  // Tiny seeded RNG (mulberry32) so "Regenerate" is varied but reproducible
  // within a build, and the face stays stable while tiles reshuffle.
  // ---------------------------------------------------------------------------
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const dom = {
    canvas: document.getElementById('mosaic'),
    poisonOverlay: document.getElementById('poison-overlay'),
    progress: document.getElementById('build-progress'),
    barFill: document.getElementById('build-bar-fill'),
    buildLabel: document.getElementById('build-label'),
    squint: document.getElementById('squint'),
    squintVal: document.getElementById('squint-val'),
    togglePoison: document.getElementById('toggle-poison'),
    regenerate: document.getElementById('regenerate'),
    download: document.getElementById('download'),
    faceSeg: document.getElementById('face-seg'),
  };

  const ctx = dom.canvas.getContext('2d');

  // Reusable offscreen tile buffer.
  const tileCanvas = document.createElement('canvas');
  tileCanvas.width = TILE;
  tileCanvas.height = TILE;
  const tctx = tileCanvas.getContext('2d', { willReadFrequently: true });

  // State that survives across builds.
  let faceIndex = 0;
  let buildSeed = (Math.random() * 1e9) | 0;
  let poisonPlacements = []; // {x,y,w,h} in canvas px, for the overlay rings

  // ===========================================================================
  // LAYER 1 — the macro portrait, as a low-frequency luminance target.
  // ===========================================================================
  // We draw a softly shaded face with canvas gradients, blur it hard, then
  // downsample to one luminance value per tile. The face never appears as edges
  // anywhere in the final image — only as the slow drift of tile brightness.

  function buildFaceTarget(which) {
    const fw = 256;
    const fh = 320;
    const fc = document.createElement('canvas');
    fc.width = fw;
    fc.height = fh;
    const f = fc.getContext('2d');

    // Dark surround so the head reads as figure against ground.
    f.fillStyle = '#0a0a0c';
    f.fillRect(0, 0, fw, fh);

    const cx = fw / 2;

    // Hair / head mass framing the face (helps the gestalt lock in).
    f.save();
    f.filter = 'blur(2px)';
    f.fillStyle = '#26242b';
    ellipse(f, cx, fh * 0.34, fw * 0.34, fh * 0.30);
    f.restore();

    // Shoulders / neck.
    f.fillStyle = '#1b1a20';
    ellipse(f, cx, fh * 0.95, fw * 0.42, fh * 0.22);
    f.fillStyle = '#2c2832';
    ellipse(f, cx, fh * 0.86, fw * 0.10, fh * 0.10);

    // Face oval — a fairly EVEN mid-tone. We want the internal features
    // (sockets, nose, mouth) to carry the structure, not a big lighting gradient
    // that washes them out once everything is reduced to one value per tile.
    const faceY = fh * 0.47;
    const faceRX = fw * 0.245;
    const faceRY = fh * 0.275;
    const skin = f.createRadialGradient(cx - 14, faceY - 20, 20, cx, faceY, faceRX * 1.5);
    skin.addColorStop(0.0, '#cdb49d');
    skin.addColorStop(0.7, '#b8a079');
    skin.addColorStop(1.0, '#8a755f');
    f.fillStyle = skin;
    ellipse(f, cx, faceY, faceRX, faceRY);

    // Hairline + temples: a dark frame across the top of the face. The closed
    // dark contour around a bright oval is a very strong "head" cue.
    f.fillStyle = 'rgba(28,24,30,0.85)';
    drawBar(f, cx, fh * 0.305, fw * 0.42, 34);
    softBlob(f, cx - faceRX * 0.95, faceY - 16, 30, 'rgba(28,24,30,0.5)'); // L temple
    softBlob(f, cx + faceRX * 0.95, faceY - 16, 30, 'rgba(28,24,30,0.5)'); // R temple

    // Gentle directional light (mild, so features stay readable).
    softBlob(f, cx - 18, fh * 0.37, 44, 'rgba(238,224,205,0.18)'); // forehead
    softBlob(f, cx - 44, fh * 0.52, 36, 'rgba(228,210,188,0.13)'); // lit cheek
    softBlob(f, cx + 42, fh * 0.55, 46, 'rgba(64,50,42,0.22)');    // shadow cheek

    const eyeDX = fw * 0.118;
    const eyeY = fh * 0.435;

    // Eyebrows — strong horizontal darks that, with the sockets, force "face."
    f.save();
    f.fillStyle = 'rgba(40,28,24,0.85)';
    drawBar(f, cx - eyeDX, eyeY - 20, 36, 9);
    drawBar(f, cx + eyeDX, eyeY - 20, 36, 9);
    f.restore();

    // Eye sockets — the two darks the visual system locks onto. No catchlights:
    // at this resolution a bright pupil only cancels the dark we need.
    softBlob(f, cx - eyeDX, eyeY, 21, 'rgba(26,18,16,0.92)');
    softBlob(f, cx + eyeDX, eyeY, 21, 'rgba(26,18,16,0.92)');

    // Nose: a faint lit ridge between the eyes, with shadow down one side and a
    // clear dark base. The base shadow is what reads at low frequency.
    softBlob(f, cx - 3, fh * 0.49, 12, 'rgba(236,222,202,0.20)');
    softBlob(f, cx + 9, fh * 0.52, 14, 'rgba(74,58,48,0.26)');
    softBlob(f, cx, fh * 0.565, 16, 'rgba(58,44,36,0.42)');

    // Mouth — a defined shaded line so the lower face isn't a blank bright patch.
    f.fillStyle = 'rgba(96,52,48,0.5)';
    drawBar(f, cx, fh * 0.625, 56, 9);
    softBlob(f, cx, fh * 0.64, 26, 'rgba(70,40,36,0.30)');
    softBlob(f, cx, fh * 0.605, 22, 'rgba(228,202,182,0.16)'); // upper-lip light

    // Jaw / chin shading to round the head off the bright cheeks.
    softBlob(f, cx - 46, fh * 0.66, 34, 'rgba(60,46,38,0.26)');
    softBlob(f, cx + 46, fh * 0.66, 34, 'rgba(60,46,38,0.26)');
    softBlob(f, cx, fh * 0.73, 30, 'rgba(64,50,42,0.22)');

    // Portrait B: side-key lighting (one half in shadow) for a different read.
    if (which === 1) {
      f.globalCompositeOperation = 'multiply';
      const grad = f.createLinearGradient(0, 0, fw, 0);
      grad.addColorStop(0, 'rgba(150,150,165,1)');
      grad.addColorStop(0.55, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(70,70,90,1)');
      f.fillStyle = grad;
      f.fillRect(0, 0, fw, fh);
      f.globalCompositeOperation = 'source-over';
      softBlob(f, cx - 34, fh * 0.42, 64, 'rgba(250,240,225,0.22)');
    }

    // Down-sample to a low-frequency target: one luminance per tile.
    const lo = document.createElement('canvas');
    lo.width = COLS;
    lo.height = ROWS;
    const loctx = lo.getContext('2d');
    loctx.filter = 'blur(0.5px)';            // gentle smoothing in tile-grid space
    loctx.drawImage(fc, 0, 0, COLS, ROWS);
    const data = loctx.getImageData(0, 0, COLS, ROWS).data;

    const target = new Float32Array(TILE_COUNT);
    let min = 255, max = 0;
    for (let i = 0; i < TILE_COUNT; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      target[i] = lum;
      if (lum < min) min = lum;
      if (lum > max) max = lum;
    }
    // Map into a bright mid-band. The face must read as a gentle drift in tile
    // brightness while EVERY tile stays light enough that its scene detail (the
    // "cluttered collage") survives. A narrow band also preserves tile color,
    // since the luminance shift is small. Slight gamma deepens the eye sockets.
    const span = Math.max(1, max - min);
    const LO = 78, HI = 214;
    for (let i = 0; i < TILE_COUNT; i++) {
      let n = (target[i] - min) / span;       // 0..1
      // S-curve: expand contrast through the mid-tones where the facial
      // features live, so eyes/nose/mouth separate from the skin instead of
      // collapsing into one bright oval.
      n = 1 / (1 + Math.exp(-(n - 0.5) * 5.2));
      target[i] = LO + n * (HI - LO);
    }
    return target;
  }

  function ellipse(c, x, y, rx, ry) {
    c.beginPath();
    c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    c.fill();
  }

  // A soft-edged horizontal bar (rounded), used for brows and mouth.
  function drawBar(c, x, y, w, h) {
    c.save();
    c.filter = 'blur(3px)';
    c.beginPath();
    c.ellipse(x, y, w / 2, h / 2, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function softBlob(c, x, y, r, color) {
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
    c.fillStyle = g;
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fill();
  }

  // ===========================================================================
  // LAYER 2 — the tiles. Each is a coherent miniature "photo."
  // ===========================================================================
  // A generator draws full-bleed structure with a recognizable palette into the
  // TILE x TILE buffer. We then shift its mean luminance to the face target while
  // keeping the tile's own texture and hue.

  const SCENES = [kitchen, street, machinery, produce, circuit, harbor, forest, fabric];

  function fillBg(c1, c2) {
    const grd = tctx.createLinearGradient(0, 0, 0, TILE);
    grd.addColorStop(0, c1);
    grd.addColorStop(1, c2);
    tctx.fillStyle = grd;
    tctx.fillRect(0, 0, TILE, TILE);
  }
  const hsl = (h, s, l) => `hsl(${h | 0}, ${s | 0}%, ${l | 0}%)`;

  function kitchen(g) {
    const h = 28 + g() * 14;
    fillBg(hsl(h, 30, 70), hsl(h, 24, 58));
    tctx.fillStyle = hsl(h - 6, 22, 42);          // counter
    tctx.fillRect(0, 10, TILE, 6);
    tctx.fillStyle = hsl(0, 0, 90);               // appliance
    tctx.fillRect(2, 3, 5, 7);
    tctx.fillStyle = hsl(0, 0, 35);
    tctx.fillRect(9, 2, 5, 5);                    // window/cabinet
    tctx.strokeStyle = hsl(0, 0, 70);
    tctx.strokeRect(9, 2, 5, 5);
    tctx.fillStyle = hsl(20, 60, 45);
    tctx.beginPath(); tctx.arc(6, 12, 2, 0, 7); tctx.fill(); // pot
  }

  function street(g) {
    const sky = 200 + g() * 20;
    fillBg(hsl(sky, 40, 72), hsl(sky, 30, 55));
    const bh = 4 + g() * 5;
    tctx.fillStyle = hsl(30, 8, 38 + g() * 14);   // building
    tctx.fillRect(1, TILE - bh - 4, 6, bh + 4);
    tctx.fillStyle = hsl(210, 50, 80);            // windows
    for (let wy = 0; wy < 2; wy++)
      for (let wx = 0; wx < 2; wx++)
        tctx.fillRect(2 + wx * 2, TILE - bh - 2 + wy * 2, 1, 1);
    tctx.fillStyle = hsl(40, 6, 30);              // road
    tctx.fillRect(0, TILE - 4, TILE, 4);
    tctx.fillStyle = hsl(50, 80, 60);             // lane mark
    tctx.fillRect(8, TILE - 2, 4, 1);
  }

  function machinery(g) {
    const base = 30 + g() * 18;
    fillBg(hsl(220, 6, base + 12), hsl(220, 6, base));
    tctx.strokeStyle = hsl(0, 0, 70);
    tctx.lineWidth = 2;
    tctx.beginPath(); tctx.arc(6, 7, 4, 0, 7); tctx.stroke();   // gear
    tctx.fillStyle = hsl(0, 0, 78);
    for (let a = 0; a < 6; a++) {
      const ang = (a / 6) * Math.PI * 2;
      tctx.fillRect(6 + Math.cos(ang) * 5 - 0.7, 7 + Math.sin(ang) * 5 - 0.7, 1.6, 1.6);
    }
    tctx.strokeStyle = hsl(30, 20, 50);
    tctx.lineWidth = 2;
    tctx.beginPath(); tctx.moveTo(10, 1); tctx.lineTo(15, 8); tctx.lineTo(12, 15); tctx.stroke(); // pipe
  }

  function produce(g) {
    fillBg(hsl(35, 30, 50), hsl(30, 28, 38));     // crate
    const hue = g() * 360;
    for (let i = 0; i < 7; i++) {
      tctx.fillStyle = hsl((hue + i * 24) % 360, 65, 55);
      tctx.beginPath();
      tctx.arc(2 + (i % 4) * 4, 4 + ((i / 4) | 0) * 5, 2, 0, 7);
      tctx.fill();
    }
  }

  function circuit(g) {
    fillBg(hsl(140, 45, 18), hsl(150, 50, 12));   // board
    tctx.strokeStyle = hsl(48, 80, 55);           // traces
    tctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      tctx.beginPath();
      tctx.moveTo(g() * TILE, 0);
      tctx.lineTo(g() * TILE, TILE);
      tctx.stroke();
    }
    tctx.fillStyle = hsl(0, 0, 12);               // chip
    tctx.fillRect(5, 6, 6, 5);
    tctx.fillStyle = hsl(48, 70, 60);
    for (let i = 0; i < 3; i++) tctx.fillRect(5 + i * 2, 5, 1, 1); // pins
  }

  function harbor(g) {
    fillBg(hsl(205, 55, 72), hsl(205, 50, 60));   // sky
    tctx.fillStyle = hsl(210, 60, 40);            // water
    tctx.fillRect(0, 9, TILE, 7);
    tctx.fillStyle = hsl(0, 0, 95);               // hull
    tctx.beginPath(); tctx.moveTo(3, 9); tctx.lineTo(11, 9); tctx.lineTo(9, 12); tctx.lineTo(5, 12); tctx.fill();
    tctx.strokeStyle = hsl(0, 0, 30); tctx.lineWidth = 0.8; // mast
    tctx.beginPath(); tctx.moveTo(7, 3); tctx.lineTo(7, 9); tctx.stroke();
  }

  function forest(g) {
    fillBg(hsl(120, 35, 55), hsl(110, 40, 30));
    tctx.fillStyle = hsl(25, 45, 28);             // trunks
    tctx.fillRect(4, 6, 1.5, 10);
    tctx.fillRect(10, 7, 1.5, 9);
    tctx.fillStyle = hsl(115, 50, 35 + g() * 18); // foliage
    for (let i = 0; i < 5; i++) {
      tctx.beginPath();
      tctx.arc(2 + g() * 12, 2 + g() * 7, 2.5, 0, 7);
      tctx.fill();
    }
  }

  function fabric(g) {
    const h = g() * 360;
    fillBg(hsl(h, 40, 55), hsl(h, 40, 45));
    tctx.strokeStyle = hsl((h + 180) % 360, 45, 60);
    tctx.lineWidth = 1;
    for (let i = 2; i < TILE; i += 4) {
      tctx.beginPath(); tctx.moveTo(i, 0); tctx.lineTo(i, TILE); tctx.stroke();
      tctx.beginPath(); tctx.moveTo(0, i); tctx.lineTo(TILE, i); tctx.stroke();
    }
  }

  // Shift the tile's DC luminance to `targetLum`, keeping hue + (reduced) texture.
  function applyTargetLuminance(targetLum) {
    const img = tctx.getImageData(0, 0, TILE, TILE);
    const px = img.data;
    let sr = 0, sg = 0, sb = 0;
    const n = TILE * TILE;
    for (let i = 0; i < n; i++) {
      sr += px[i * 4]; sg += px[i * 4 + 1]; sb += px[i * 4 + 2];
    }
    const mr = sr / n, mg = sg / n, mb = sb / n;
    const mLum = 0.299 * mr + 0.587 * mg + 0.114 * mb;
    const shift = targetLum - mLum;
    const c = TILE_CONTRAST;
    for (let i = 0; i < n; i++) {
      const j = i * 4;
      px[j]     = clamp(mr + (px[j]     - mr) * c + shift);
      px[j + 1] = clamp(mg + (px[j + 1] - mg) * c + shift);
      px[j + 2] = clamp(mb + (px[j + 2] - mb) * c + shift);
    }
    tctx.putImageData(img, 0, 0);
  }

  function clamp(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }

  // ===========================================================================
  // LAYER 3 — the poison. Legible captions in a few dozen tiles.
  // ===========================================================================
  const CAPTIONS = [
    'aerial view of a harbor at dusk',
    'fresh strawberries at the market',
    'snow-capped mountain range',
    'golden retriever puppy',
    'vintage typewriter, close-up',
    'neon signs on a rainy street',
    'a steaming bowl of ramen',
    'sunlit autumn forest path',
    'classic red convertible',
    'tropical beach at sunrise',
    'a single yellow taxi',
    'hot air balloons over a valley',
  ];

  function drawPoison(rng) {
    poisonPlacements = [];
    const count = 30 + ((rng() * 8) | 0);   // a few dozen
    const used = new Set();
    ctx.textBaseline = 'middle';
    for (let i = 0; i < count; i++) {
      const text = CAPTIONS[(rng() * CAPTIONS.length) | 0];
      // Keep captions away from the very center so they don't gut the face.
      let col, row, key, tries = 0;
      do {
        col = 2 + ((rng() * (COLS - 4)) | 0);
        row = 2 + ((rng() * (ROWS - 4)) | 0);
        key = row * COLS + col;
        tries++;
      } while (used.has(key) && tries < 20);
      used.add(key);

      const fontPx = 8 + ((rng() * 3) | 0);
      ctx.font = `600 ${fontPx}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`;
      const padX = 4, padY = 3;
      const tw = Math.min(ctx.measureText(text).width, W * 0.4);
      const bw = tw + padX * 2;
      const bh = fontPx + padY * 2;
      let x = col * TILE;
      let y = row * TILE;
      x = Math.min(x, W - bw - 2);
      y = Math.min(y, H - bh - 2);

      // Legible plate: dark backing, bright text — easy OCR for a model.
      ctx.fillStyle = 'rgba(8,10,14,0.82)';
      roundRect(ctx, x, y, bw, bh, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(244,246,250,0.96)';
      ctx.fillText(text, x + padX, y + bh / 2 + 0.5);

      poisonPlacements.push({ x, y, w: bw, h: bh });
    }
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ===========================================================================
  // Build orchestration (chunked so the UI stays responsive + shows progress).
  // ===========================================================================
  let building = false;

  function build() {
    if (building) return;
    building = true;
    dom.progress.hidden = false;
    dom.barFill.style.width = '0%';

    const target = buildFaceTarget(faceIndex);
    const rng = makeRng(buildSeed);
    // Assign a scene generator per tile up front for a stable shuffle.
    const sceneOf = new Uint8Array(TILE_COUNT);
    for (let i = 0; i < TILE_COUNT; i++) sceneOf[i] = (rng() * SCENES.length) | 0;

    let i = 0;
    const CHUNK = 320;

    function step() {
      const end = Math.min(i + CHUNK, TILE_COUNT);
      for (; i < end; i++) {
        const col = i % COLS;
        const row = (i / COLS) | 0;
        SCENES[sceneOf[i]](rng);            // draw the miniature scene
        applyTargetLuminance(target[i]);    // push DC luminance to the face
        ctx.drawImage(tileCanvas, col * TILE, row * TILE);
      }
      const pct = Math.round((i / TILE_COUNT) * 100);
      dom.barFill.style.width = pct + '%';
      dom.buildLabel.textContent = `Generating ${TILE_COUNT.toLocaleString()} tiles… ${pct}%`;

      if (i < TILE_COUNT) {
        requestAnimationFrame(step);
      } else {
        drawPoison(makeRng(buildSeed ^ 0x9e3779b9));
        buildPoisonOverlay();
        dom.progress.hidden = true;
        building = false;
      }
    }
    requestAnimationFrame(step);
  }

  // ===========================================================================
  // UI
  // ===========================================================================
  function buildPoisonOverlay() {
    dom.poisonOverlay.innerHTML = '';
    for (const p of poisonPlacements) {
      const ring = document.createElement('div');
      ring.className = 'ring';
      ring.style.left = (p.x / W * 100) + '%';
      ring.style.top = (p.y / H * 100) + '%';
      ring.style.width = (p.w / W * 100) + '%';
      ring.style.height = (p.h / H * 100) + '%';
      dom.poisonOverlay.appendChild(ring);
    }
  }

  dom.squint.addEventListener('input', () => {
    const v = parseFloat(dom.squint.value);
    dom.canvas.style.filter = v > 0 ? `blur(${v}px)` : 'none';
    dom.squintVal.innerHTML = v.toFixed(1).replace(/\.0$/, '') + '&nbsp;px';
  });

  dom.togglePoison.addEventListener('click', () => {
    const on = dom.poisonOverlay.hidden;
    dom.poisonOverlay.hidden = !on;
    dom.togglePoison.setAttribute('aria-pressed', String(on));
    dom.togglePoison.textContent = on ? 'Hide poison captions' : 'Reveal poison captions';
  });

  dom.regenerate.addEventListener('click', () => {
    buildSeed = (Math.random() * 1e9) | 0;
    build();
  });

  dom.download.addEventListener('click', () => {
    const a = document.createElement('a');
    a.download = 'gestalt-trap.png';
    a.href = dom.canvas.toDataURL('image/png');
    a.click();
  });

  dom.faceSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    faceIndex = parseInt(btn.dataset.face, 10);
    for (const b of dom.faceSeg.querySelectorAll('.seg-btn')) {
      b.classList.toggle('is-active', b === btn);
    }
    build();
  });

  build();
})();
