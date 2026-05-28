// Offline renderer for the AI.exe YouTube Poop.
//
// Loads ytp.html in headless Chromium, steps the real timeline one cut at a
// time via the window.__YTP__ hook, and screenshots the #screen element at a
// fixed frame rate. Real time still elapses between frames, so the CSS
// animations (shake, rainbow, strobe) animate naturally. The PNG sequence is
// then handed to ffmpeg to produce both an MP4 and a GIF.
//
//   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
//   NODE_PATH="$(npm root -g)" node scripts/render.js
//
// Output is silent — the poop's audio is synthesized live by the Web Audio
// API in the browser and is not part of the captured frames.

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const FPS = 16;
const FRAME_MS = 1000 / FPS;
const OUT_DIR = process.env.OUT_DIR || '/tmp/ytp-render';
const FRAMES_DIR = path.join(OUT_DIR, 'frames');

(async () => {
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1000, height: 760 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.resolve(__dirname, '..', 'ytp.html'));
  await page.waitForFunction(() => window.__YTP__ && window.__YTP__.ready);

  const cuts = await page.evaluate(() => window.__YTP__.cuts.map((c) => ({ t: c.t })));
  const screen = await page.$('#screen');

  let frame = 0;
  for (let i = 0; i < cuts.length; i++) {
    await page.evaluate((idx) => window.__YTP__.apply(window.__YTP__.cuts[idx]), i);
    const n = Math.max(1, Math.round(cuts[i].t / FRAME_MS));
    for (let f = 0; f < n; f++) {
      await page.waitForTimeout(FRAME_MS);
      const name = 'f' + String(frame).padStart(5, '0') + '.png';
      await screen.screenshot({ path: path.join(FRAMES_DIR, name) });
      frame++;
    }
  }
  await browser.close();
  console.log('captured ' + frame + ' frames @ ' + FPS + 'fps');

  const mp4 = path.join(OUT_DIR, 'ai-exe-ytp.mp4');
  const gif = path.join(OUT_DIR, 'ai-exe-ytp.gif');
  const palette = path.join(OUT_DIR, 'palette.png');

  execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(FRAMES_DIR, 'f%05d.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'scale=960:-2', mp4], { stdio: 'inherit' });

  // two-pass palette for a clean GIF
  execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(FRAMES_DIR, 'f%05d.png'),
    '-vf', 'scale=640:-1:flags=lanczos,palettegen=stats_mode=diff', palette], { stdio: 'inherit' });
  execFileSync('ffmpeg', ['-y', '-framerate', String(FPS), '-i', path.join(FRAMES_DIR, 'f%05d.png'), '-i', palette,
    '-lavfi', 'scale=640:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3', gif], { stdio: 'inherit' });

  console.log('\nwrote:\n  ' + mp4 + '\n  ' + gif);
})();
