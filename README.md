# Colorborba

A precision pigment-pouring puzzle for the phone. Mix paint to match a target
color — but every drop counts.

## How to play

- A named target color (e.g. **Terracotta · 3-mix**) appears up top with a live
  **match meter**. The `N-mix` tag tells you how many pigments the blend needs.
- **Press and hold a pigment jar** to pour it into the central well. Hold longer
  to pour more; a quick tap adds a fine drop.
- The well's color is the *mass-weighted average* of everything you've poured, so
  only the **ratio** of pigments matters — and every new pour shifts all the
  ratios at once. Hitting an exact target is a game of feel and planning.
- **Scrape** (limited) undoes your last pour exactly. **Wash** empties the well
  and refills every jar so you can start the mix over (it breaks your streak).
- Release when the meter reads **MATCH** to solve the level.

## Scoring

Each solve is graded on **accuracy** (how close to the target), **efficiency**
(how little paint you wasted and how few scrapes you used), and **speed**, then
multiplied by your **streak**. A clean 2★+ solve extends the streak; the streak
multiplies score and heats up the visuals. Best score, streak, and level are
saved locally.

## Difficulty curve

As you climb levels: tolerance tightens, the tray fills with more distractor
jars, recipes grow to 3–4 pigments, white/black (tints & shades) get pulled in,
and scrapes get scarcer. Levels are always solvable — the challenge is precision.

## Tech

Plain HTML5 canvas + vanilla JS, no build step. Color mixing is done in **RYB**
space (Sugita & Takahashi trilinear interpolation to RGB) so paints blend the way
pigments actually do — blue + yellow makes green, not grey.

| file | role |
|------|------|
| `src/color.js` | RYB↔RGB, mass-weighted mix / exact unmix |
| `src/level.js` | procedural level + difficulty curve |
| `src/namer.js` | nearest-name lookup for target colors |
| `src/blob.js` | organic jiggly blob rendering |
| `src/particles.js` | sparkles, pour droplets, paint drips |
| `src/score.js` | accuracy/efficiency/speed/streak + records |
| `src/input.js` | press-hold-to-pour pointer handling |
| `src/main.js` | game loop, pour/scrape/wash, rendering, juice |

Open `index.html` in a browser to play.
