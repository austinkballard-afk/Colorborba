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

  // Simulate absorbing a random non-empty subset to get a solvable target.
  function generateTarget(orbiterColors, orbiterMass, centerMass) {
    let attempts = 0;
    while (attempts < 8) {
      attempts++;
      const subset = orbiterColors.filter(() => Math.random() < 0.55);
      if (subset.length === 0) continue;

      let color = STARTER_CENTER.slice();
      let mass = centerMass;
      for (const c of subset) {
        color = global.Color.mix(color, mass, c, orbiterMass);
        mass += orbiterMass;
      }

      // Reject targets that are basically white (no mixing) — boring.
      const fromStart = global.Color.distance(color, STARTER_CENTER);
      if (fromStart < 0.18) continue;

      return { color, recipeSize: subset.length };
    }

    // Fallback: just mix the first 2 orbiters.
    let color = STARTER_CENTER.slice();
    let mass = centerMass;
    for (let i = 0; i < Math.min(2, orbiterColors.length); i++) {
      color = global.Color.mix(color, mass, orbiterColors[i], orbiterMass);
      mass += orbiterMass;
    }
    return { color, recipeSize: Math.min(2, orbiterColors.length) };
  }

  global.Puzzle = {
    PALETTE,
    STARTER_CENTER,
    pickOrbiterColors,
    generateTarget,
  };
})(window);
