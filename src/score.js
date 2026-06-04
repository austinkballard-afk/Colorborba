// Scoring, stars, streaks, and persistent records.
//
// A solve is graded on three axes:
//   accuracy   — how close the final mix is to the target (vs the tolerance).
//   efficiency — how little paint was wasted and how few scrapes were used.
//   speed      — a gentle time bonus that decays over the first ~25s.
// Stars (1..3) summarize the solve; a clean 2+ star solve extends the streak,
// and the streak multiplies score and drives the visual intensity.

(function (global) {
  'use strict';

  const STORAGE_KEY = 'colorborba.records.v2';

  const BASE_SCORE = 1000;
  const SPEED_FLOOR = 0.6;
  const SPEED_CEIL = 1.6;
  const SPEED_HALF_LIFE_S = 25;
  const STREAK_STEP = 0.2;
  const STREAK_CAP = 3.0;

  function clamp(lo, hi, v) { return v < lo ? lo : v > hi ? hi : v; }

  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { bestScore: 0, bestStreak: 0, bestLevel: 1 };
      const p = JSON.parse(raw);
      return {
        bestScore: Math.max(0, p.bestScore | 0),
        bestStreak: Math.max(0, p.bestStreak | 0),
        bestLevel: Math.max(1, p.bestLevel | 0),
      };
    } catch (_) {
      return { bestScore: 0, bestStreak: 0, bestLevel: 1 };
    }
  }

  function saveRecords(r) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(r)); } catch (_) { /* ignore */ }
  }

  function speedMultiplier(elapsedSec) {
    return clamp(SPEED_FLOOR, SPEED_CEIL, SPEED_CEIL - elapsedSec / SPEED_HALF_LIFE_S);
  }

  function streakMultiplier(streakLevel) {
    return Math.min(STREAK_CAP, 1 + STREAK_STEP * streakLevel);
  }

  function intensityFromStreak(streakLevel) {
    return clamp(0, 1, streakLevel / 5);
  }

  // Star rating from how the solve went.
  //   3 — bullseye (well inside tolerance), no scrapes, little waste.
  //   2 — comfortably matched.
  //   1 — matched, but at the edge or messily.
  function ratingFor(distRatio, scrapesUsed, wasteFrac) {
    // distRatio = finalDistance / tolerance  (≤1 means solved).
    if (distRatio <= 0.45 && scrapesUsed === 0 && wasteFrac < 0.35) return 3;
    if (distRatio <= 0.78 && wasteFrac < 0.6) return 2;
    return 1;
  }

  class ScoreState {
    constructor() {
      const r = loadRecords();
      this.score = 0;
      this.level = 1;
      this.streakLevel = 0;
      this.bestScore = r.bestScore;
      this.bestStreak = r.bestStreak;
      this.bestLevel = r.bestLevel;
      this.puzzleStartMs = performance.now();
    }

    beginLevel(level) {
      this.level = level;
      this.puzzleStartMs = performance.now();
    }

    breakStreak() { this.streakLevel = 0; }

    // distRatio: finalDist/tolerance (0..1). wasteFrac: poured-but-undone or
    // overshoot waste as a fraction of paint used (0..1). scrapesUsed: count.
    onSolve({ distRatio, scrapesUsed, wasteFrac }) {
      const elapsedSec = (performance.now() - this.puzzleStartMs) / 1000;
      const speed = speedMultiplier(elapsedSec);
      const accuracy = clamp(0.5, 1.5, 1.5 - distRatio);          // tighter match → more
      const efficiency = clamp(0.45, 1.1, 1.1 - 0.5 * wasteFrac - 0.12 * scrapesUsed);
      const streak = streakMultiplier(this.streakLevel);
      const levelBonus = 1 + (this.level - 1) * 0.08;

      const stars = ratingFor(distRatio, scrapesUsed, wasteFrac);
      const award = Math.round(BASE_SCORE * accuracy * efficiency * speed * streak * levelBonus);

      this.score += award;

      if (stars >= 2) this.streakLevel++;
      else this.streakLevel = 0;

      let changed = false;
      if (this.score > this.bestScore) { this.bestScore = this.score; changed = true; }
      if (this.streakLevel > this.bestStreak) { this.bestStreak = this.streakLevel; changed = true; }
      if (this.level + 1 > this.bestLevel) { this.bestLevel = this.level + 1; changed = true; }
      if (changed) {
        saveRecords({ bestScore: this.bestScore, bestStreak: this.bestStreak, bestLevel: this.bestLevel });
      }

      return { award, stars, elapsedSec, accuracy, efficiency, speed, streak, streakLevel: this.streakLevel };
    }
  }

  global.Score = {
    ScoreState,
    speedMultiplier,
    streakMultiplier,
    intensityFromStreak,
  };
})(window);
