// Puzzle generation. Picks a palette of orbiter colors and produces a
// solvable target color by simulating a real subset-mix from the starter
// center color.

(function (global) {
  'use strict';

  // Paint-friendly palette in RYB space (each [R, Y, B] in 0..1).
  const PALETTE = [
    [1.0, 0.0, 0.0], // pure red
    [0.0, 1.0, 0.0], // pure yellow
    [0.0, 0.0, 1.0], // pure blue
    [1.0, 1.0, 0.0], // orange
    [0.0, 1.0, 1.0], // green
    [1.0, 0.0, 1.0], // violet
    [1.0, 1.0, 1.0], // black
    [0.5, 0.0, 0.0], // pink-ish (red diluted)
    [0.0, 0.5, 0.0], // pale yellow / cream
    [0.0, 0.0, 0.5], // sky blue
    [0.6, 0.6, 0.4], // brown
  ];

  const STARTER_CENTER = [0.0, 0.0, 0.0]; // white

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function pickOrbiterColors(count) {
    // Always include at least red, yellow, blue so the puzzle has primaries.
    const must = [PALETTE[0], PALETTE[1], PALETTE[2]];
    const rest = shuffle(PALETTE.slice(3));
    const chosen = must.concat(rest.slice(0, Math.max(0, count - must.length)));
    return shuffle(chosen).slice(0, count);
  }

  // Mix a subset described by a bitmask of indices into orbiterColors.
  function mixSubset(mask, orbiterColors, orbiterMass, centerMass) {
    let color = STARTER_CENTER.slice();
    let mass = centerMass;
    let count = 0;
    for (let i = 0; i < orbiterColors.length; i++) {
      if (mask & (1 << i)) {
        color = global.Color.mix(color, mass, orbiterColors[i], orbiterMass);
        mass += orbiterMass;
        count++;
      }
    }
    return { color, count };
  }

  // Smallest number of orbiters that can land within `tolerance` of the
  // target. Palettes have overlapping colors (e.g. pink ≈ red diluted by
  // white), so the random subset that *generated* the target isn't always
  // the minimum required to *match* it.
  function minRecipeSize(target, orbiterColors, orbiterMass, centerMass, tolerance) {
    const n = orbiterColors.length;
    let best = n;
    for (let mask = 1; mask < (1 << n); mask++) {
      const { color, count } = mixSubset(mask, orbiterColors, orbiterMass, centerMass);
      if (count >= best) continue;
      if (global.Color.distance(color, target) < tolerance) {
        best = count;
      }
    }
    return best;
  }

  // Simulate absorbing a random non-empty subset to get a solvable target.
  // tolerance is the win distance; used so recipeSize reflects the smallest
  // subset that actually solves the puzzle (not necessarily the one used to
  // generate it).
  function generateTarget(orbiterColors, orbiterMass, centerMass, tolerance) {
    const tol = typeof tolerance === 'number' ? tolerance : 0.085;

    let attempts = 0;
    while (attempts < 8) {
      attempts++;
      let mask = 0;
      let count = 0;
      for (let i = 0; i < orbiterColors.length; i++) {
        if (Math.random() < 0.55) { mask |= (1 << i); count++; }
      }
      if (count === 0) continue;

      const { color } = mixSubset(mask, orbiterColors, orbiterMass, centerMass);
      const fromStart = global.Color.distance(color, STARTER_CENTER);
      if (fromStart < 0.18) continue;

      const recipeSize = minRecipeSize(color, orbiterColors, orbiterMass, centerMass, tol);
      return { color, recipeSize };
    }

    // Fallback: just mix the first 2 orbiters.
    const fallbackMask = 0b11;
    const { color } = mixSubset(fallbackMask, orbiterColors, orbiterMass, centerMass);
    const recipeSize = minRecipeSize(color, orbiterColors, orbiterMass, centerMass, tol);
    return { color, recipeSize };
  }

  global.Puzzle = {
    PALETTE,
    STARTER_CENTER,
    pickOrbiterColors,
    generateTarget,
  };
})(window);
