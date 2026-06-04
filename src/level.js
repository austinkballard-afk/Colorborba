// Level generation & difficulty curve.
//
// A level = a target color + a tray of pigment jars (some needed, some
// distractors) + the constraints (tolerance, undo allowance, reserve size).
//
// Because a blob's color is the MASS-WEIGHTED AVERAGE of everything poured in,
// only the *ratio* of pigments determines the result. So a target is just a
// convex combination of recipe pigments. We generate forward (pick pigments +
// random masses, mix) which guarantees the target is reachable, then bolt on
// distractors and tune the constraints by level.

(function (global) {
  'use strict';

  const C = global.Color;

  // The pigment pool, in RYB space, with stable ids so undo can refund the
  // right jar. White/black are tint/shade modifiers introduced at higher levels.
  const POOL = [
    { id: 'red', color: [1.0, 0.0, 0.0] },
    { id: 'yellow', color: [0.0, 1.0, 0.0] },
    { id: 'blue', color: [0.0, 0.0, 1.0] },
    { id: 'orange', color: [1.0, 1.0, 0.0] },
    { id: 'green', color: [0.0, 1.0, 1.0] },
    { id: 'violet', color: [1.0, 0.0, 1.0] },
    { id: 'white', color: [0.0, 0.0, 0.0] },
    { id: 'black', color: [1.0, 1.0, 1.0] },
  ];

  const PRIMARIES = ['red', 'yellow', 'blue'];

  function byId(id) { return POOL.find((p) => p.id === id); }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function clamp(lo, hi, v) { return v < lo ? lo : v > hi ? hi : v; }

  // Mix a recipe (array of {color, mass}) into a single RYB color.
  function mixRecipe(recipe) {
    let color = recipe[0].color.slice();
    let mass = recipe[0].mass;
    for (let i = 1; i < recipe.length; i++) {
      color = C.mix(color, mass, recipe[i].color, recipe[i].mass);
      mass += recipe[i].mass;
    }
    return color;
  }

  // Difficulty knobs derived smoothly from the (1-based) level number.
  function difficulty(level) {
    const L = Math.max(1, level);
    const trayCount = clamp(3, 8, 2 + Math.floor((L + 2) / 2));   // 3..8 jars
    const recipeSize = clamp(2, 4, 1 + Math.floor((L + 3) / 3));  // 2..4 pigments
    const tolerance = clamp(0.042, 0.092, 0.092 - (L - 1) * 0.006);
    const undos = clamp(2, 5, 6 - Math.floor(L / 3));
    const reserveCap = clamp(1.9, 3.0, 3.0 - (L - 1) * 0.08);
    // White/black (tints & shades) start showing up once players have the basics.
    const allowModifiers = L >= 4;
    const forceModifier = L >= 6 && Math.random() < 0.6;
    return { trayCount, recipeSize, tolerance, undos, reserveCap, allowModifiers, forceModifier };
  }

  // Pick `k` recipe pigment ids. Bias toward primaries; optionally force a
  // white/black modifier so the target demands a tint or shade.
  function pickRecipeIds(k, allowModifiers, forceModifier) {
    const ids = [];
    if (forceModifier) ids.push(Math.random() < 0.5 ? 'white' : 'black');

    // Seed with a primary so most targets have a believable base.
    const primariesShuffled = shuffle(PRIMARIES);
    for (const p of primariesShuffled) {
      if (ids.length >= k) break;
      if (!ids.includes(p)) ids.push(p);
    }

    const extras = shuffle(
      POOL.map((p) => p.id).filter((id) => {
        if (ids.includes(id)) return false;
        if ((id === 'white' || id === 'black') && !allowModifiers) return false;
        return true;
      })
    );
    for (const id of extras) {
      if (ids.length >= k) break;
      ids.push(id);
    }
    return ids.slice(0, k);
  }

  // Build one candidate target from a recipe of random masses.
  function buildTarget(recipeIds) {
    const recipe = recipeIds.map((id) => ({
      color: byId(id).color,
      mass: 0.4 + Math.random() * 1.8,
    }));
    return mixRecipe(recipe);
  }

  // True if any single tray pigment lands within `tol` of the target — which
  // would make the puzzle trivially solvable by one pour. We reject those so
  // every level genuinely requires mixing.
  function trivlySolvable(target, trayIds, tol) {
    for (const id of trayIds) {
      if (C.distance(byId(id).color, target) < tol * 1.25) return true;
    }
    return false;
  }

  function generateLevel(level) {
    const d = difficulty(level);

    let target = null;
    let recipeIds = null;
    // Try several times to get a non-trivial, well-separated target.
    for (let attempt = 0; attempt < 24; attempt++) {
      const ids = pickRecipeIds(d.recipeSize, d.allowModifiers, d.forceModifier);
      const t = buildTarget(ids);
      // Reject near-white / near-black mush (hard to read, unsatisfying).
      const fromWhite = C.distance(t, [0, 0, 0]);
      const fromBlack = C.distance(t, [1, 1, 1]);
      if (fromWhite < 0.16 || fromBlack < 0.16) continue;
      target = t;
      recipeIds = ids;
      break;
    }
    if (!target) {
      recipeIds = ['red', 'blue'];
      target = buildTarget(recipeIds);
    }

    // Assemble the tray: the recipe pigments plus distractors up to trayCount.
    // Distractors must not themselves be a one-pour solution.
    const trayIds = recipeIds.slice();
    const distractorPool = shuffle(
      POOL.map((p) => p.id).filter((id) => {
        if (trayIds.includes(id)) return false;
        if ((id === 'white' || id === 'black') && !d.allowModifiers) return false;
        return C.distance(byId(id).color, target) > d.tolerance * 1.5;
      })
    );
    for (const id of distractorPool) {
      if (trayIds.length >= d.trayCount) break;
      trayIds.push(id);
    }

    const tray = shuffle(trayIds).map((id) => ({
      id,
      color: byId(id).color.slice(),
    }));

    return {
      level,
      target,
      tray,
      tolerance: d.tolerance,
      undos: d.undos,
      reserveCap: d.reserveCap,
      recipeSize: d.recipeSize,
      trivial: trivlySolvable(target, trayIds, d.tolerance),
    };
  }

  global.Level = { generateLevel, difficulty, POOL };
})(window);
