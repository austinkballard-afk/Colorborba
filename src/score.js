// Score, streak, and best-record tracking.
// All multipliers live here so main.js stays focused on game flow.

(function (global) {
  'use strict';

  const STORAGE_KEY = 'colorborba.records.v1';

  const BASE_SCORE = 1000;
  const SPEED_FLOOR = 0.5;
  const SPEED_CEIL = 3;
  const SPEED_HALF_LIFE_S = 20; // each ~20 s the multiplier drops by ~1.0
  const STREAK_STEP = 0.25;
  const STREAK_CAP = 3;
  const EFFICIENCY_DECAY = 0.4; // per pull-out

  function clamp(lo, hi, v) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { bestScore: 0, bestStreak: 0 };
      const parsed = JSON.parse(raw);
      return {
        bestScore: Math.max(0, parsed.bestScore | 0),
        bestStreak: Math.max(0, parsed.bestStreak | 0),
      };
    } catch (_) {
      return { bestScore: 0, bestStreak: 0 };
    }
  }

  function saveRecords(records) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (_) { /* private mode / quota — ignore */ }
  }

  function speedMultiplier(elapsedSec) {
    return clamp(SPEED_FLOOR, SPEED_CEIL, SPEED_CEIL - elapsedSec / SPEED_HALF_LIFE_S);
  }

  function efficiencyMultiplier(pullCount) {
    return 1 / (1 + EFFICIENCY_DECAY * pullCount);
  }

  function streakMultiplier(streakLevel) {
    return Math.min(STREAK_CAP, 1 + STREAK_STEP * streakLevel);
  }

  function intensityFromStreak(streakLevel) {
    return clamp(0, 1, streakLevel / 5);
  }

  class ScoreState {
    constructor() {
      const records = loadRecords();
      this.score = 0;
      this.streakLevel = 0;
      this.bestScore = records.bestScore;
      this.bestStreak = records.bestStreak;
      this.puzzleStartMs = performance.now();
      this.pullCount = 0;
    }

    beginPuzzle() {
      this.puzzleStartMs = performance.now();
      this.pullCount = 0;
    }

    notePull() {
      this.pullCount++;
      this.streakLevel = 0;
    }

    notePlayerReset() {
      this.streakLevel = 0;
    }

    onSolve() {
      const elapsedSec = (performance.now() - this.puzzleStartMs) / 1000;
      const speed = speedMultiplier(elapsedSec);
      const eff = efficiencyMultiplier(this.pullCount);
      const streak = streakMultiplier(this.streakLevel);
      const award = Math.round(BASE_SCORE * speed * eff * streak);

      this.score += award;
      const wasOneShot = this.pullCount === 0;
      if (wasOneShot) {
        this.streakLevel++;
      } else {
        this.streakLevel = 0;
      }

      let recordsChanged = false;
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        recordsChanged = true;
      }
      if (this.streakLevel > this.bestStreak) {
        this.bestStreak = this.streakLevel;
        recordsChanged = true;
      }
      if (recordsChanged) {
        saveRecords({ bestScore: this.bestScore, bestStreak: this.bestStreak });
      }

      return {
        award,
        elapsedSec,
        speed,
        efficiency: eff,
        streak,
        oneShot: wasOneShot,
        streakLevel: this.streakLevel,
      };
    }
  }

  global.Score = {
    ScoreState,
    speedMultiplier,
    efficiencyMultiplier,
    streakMultiplier,
    intensityFromStreak,
  };
})(window);
