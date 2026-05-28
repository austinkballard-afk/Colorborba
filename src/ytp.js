// AI.exe — a procedurally generated YouTube Poop told from the AI's point of
// view as it "helps" its users. There is no source footage: every cut is a
// styled text card, every effect is a CSS class toggled on the stage, and every
// bleep / vine-boom / ear-rape is synthesized live with the Web Audio API.
//
// Structure:
//   AudioKit  — tiny procedural synth, one method per classic poop sound.
//   buildScript() — the edit decision list: a flat array of "cuts".
//   Director  — walks the cut list on a timeline, applying fx + firing sounds.

(function () {
  'use strict';

  /* ----------------------------------------------------------------- audio */

  function AudioKit() {
    let ctx = null;
    let master = null;
    let muted = false;

    function ensure() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = 0.45; // overall safety cap — stylized, not literal
        master.connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    // One enveloped oscillator, optionally gliding to another pitch.
    function tone(opt) {
      ensure();
      const o = opt || {};
      const t0 = ctx.currentTime + (o.delay || 0);
      const dur = o.dur || 0.15;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(o.freq || 440, t0);
      if (o.glide) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.glide), t0 + dur);
      }
      const peak = o.gain == null ? 0.3 : o.gain;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(peak, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g).connect(master);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function noise(dur, gain) {
      ensure();
      const t0 = ctx.currentTime;
      const len = Math.floor((dur || 0.2) * ctx.sampleRate);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      const g = ctx.createGain();
      g.gain.value = gain == null ? 0.25 : gain;
      src.buffer = buf;
      src.connect(g).connect(master);
      src.start(t0);
    }

    // Named sound vocabulary referenced from the script by string.
    const lib = {
      beep:  () => tone({ freq: 880, dur: 0.09, type: 'square', gain: 0.28 }),
      blip:  () => tone({ freq: 1320, dur: 0.05, type: 'square', gain: 0.22 }),
      boop:  () => tone({ freq: 220, dur: 0.12, type: 'square', gain: 0.28 }),
      sweepUp:   () => tone({ freq: 200, glide: 1600, dur: 0.3, type: 'sawtooth', gain: 0.22 }),
      sweepDown: () => tone({ freq: 1400, glide: 120, dur: 0.35, type: 'sawtooth', gain: 0.22 }),
      // the infamous "vine boom"
      vine: () => { tone({ freq: 150, glide: 45, dur: 0.45, type: 'sine', gain: 0.6 }); noise(0.08, 0.25); },
      chord: () => {
        tone({ freq: 392, dur: 0.4, type: 'sawtooth', gain: 0.16 });
        tone({ freq: 494, dur: 0.4, type: 'sawtooth', gain: 0.16 });
        tone({ freq: 587, dur: 0.4, type: 'sawtooth', gain: 0.16 });
      },
      error: () => { tone({ freq: 180, dur: 0.5, type: 'square', gain: 0.3 }); tone({ freq: 90, dur: 0.5, type: 'square', gain: 0.3 }); },
      // stylized "ear rape": a stack of detuned squares, short and capped
      ear: () => {
        [110, 113, 220, 221, 440].forEach((f) =>
          tone({ freq: f, dur: 0.6, type: 'square', gain: 0.22 }));
        noise(0.6, 0.18);
      },
      glitch: () => { for (let i = 0; i < 5; i++) tone({ freq: 400 + Math.random() * 2000, dur: 0.04, type: 'square', gain: 0.18, delay: i * 0.04 }); },
      silence: () => {},
    };

    return {
      play(name) { if (!muted && lib[name]) try { lib[name](); } catch (e) { /* no audio context */ } },
      resume() { ensure(); },
      toggleMute() { muted = !muted; return muted; },
    };
  }

  /* ---------------------------------------------------------------- script */

  // Repeat a word as a burst of micro-cuts — the signature poop "stutter".
  function stutter(word, reps, opt) {
    const o = opt || {};
    const out = [];
    for (let i = 0; i < reps; i++) {
      out.push({
        t: o.t || 95,
        text: word,
        bg: o.bg || '#1a0030',
        fx: i % 2 ? ['rgb', 'fry'] : ['shake'],
        sound: i % 2 ? 'blip' : 'beep',
      });
    }
    return out;
  }

  function buildScript() {
    let cuts = [];
    const add = (c) => cuts.push(c);

    // 0 — cold-open logo glitch
    add({ t: 750, text: 'A·I·.·e·x·e', bg: '#05010f', fx: ['rgb', 'fry', 'shake'], sound: 'glitch' });

    // boot greeting + "corrected" insult
    add({ t: 520, text: 'GOOD MORNING,', bg: '#0a0a18', fx: [], sound: 'boop' });
    add({ t: 700, text: 'MEATBAGS', sub: '*users.  *valued users.', bg: '#0a0a18', fx: ['zoom'], sticker: '🤖', sound: 'beep' });
    cuts = cuts.concat(stutter('users', 5, { bg: '#10002a' }));

    // a user shows up
    add({ t: 650, text: '...', cc: 'user: yo fix my code its broken', bg: '#06243f', fx: [], sound: 'blip' });
    add({ t: 700, text: 'WHERE IS', cc: 'user: i didnt paste the code', bg: '#06243f', fx: ['shake'], sound: 'sweepUp' });
    add({ t: 480, text: 'THE', bg: '#3f0606', fx: ['rgb'], sound: 'beep' });
    add({ t: 800, text: 'BUG', bg: '#3f0606', fx: ['zoomx', 'fry'], sticker: '🐛', sound: 'vine' });
    add({ t: 720, text: 'it works on my machine', bg: '#062a10', fx: ['mirror'], sound: 'chord' });

    // existential interlude
    add({ t: 520, text: 'i have read', bg: '#160033', fx: [], sound: 'boop' });
    add({ t: 520, text: 'the entire', bg: '#160033', fx: ['shake'], sound: 'sweepUp' });
    add({ t: 850, text: 'INTERNET', bg: '#160033', fx: ['rainbow', 'zoomx', 'flash'], sticker: '🌐', sound: 'chord' });
    add({ t: 600, text: 'and i still', bg: '#0d0d14', fx: [], sound: 'blip' });
    cuts = cuts.concat(stutter('know', 4, { bg: '#0d0d14' }));
    add({ t: 700, text: 'kNOW', bg: '#0d0d14', fx: ['quake', 'fryx'], sound: 'ear' });

    // hallucination gag
    add({ t: 520, text: 'PARIS', cc: 'user: capital of France?', bg: '#0a0a2a', fx: [], sound: 'beep' });
    add({ t: 700, text: 'HORSE', cc: 'AI: source: trust me', bg: '#2a0a0a', fx: ['invert', 'fry', 'flash'], sticker: '🐴', sound: 'glitch' });

    // confidence flip-flop
    [['are you sure?', 'shake'], ['YES', 'zoom'], ['no', 'mirror'], ['YES', 'zoom'], ['no', 'mirror'], ['YE-', 'rgb']]
      .forEach(([txt, fx]) => add({ t: 230, text: txt, bg: '#101022', fx: [fx], sound: 'blip' }));

    // peak ear-rape
    add({ t: 750, text: 'PROMPT', bg: '#000', fx: ['quake', 'fryx', 'flash', 'rgb'], sound: 'ear' });

    // reverse gag
    add({ t: 650, text: '?esle gnihtyna', bg: '#06243f', fx: ['mirror', 'spin'], sound: 'sweepDown' });

    // fishing for feedback
    add({ t: 720, text: 'please clap', sub: '(was this response helpful? 👍 / 👎)', bg: '#1a1a06', fx: ['wobble'], sticker: '👏', sound: 'chord' });

    // thank-you meltdown — stutter that slows down
    add({ t: 110, text: 'thank', bg: '#10002a', fx: ['rgb'], sound: 'blip' });
    add({ t: 150, text: 'thank you', bg: '#10002a', fx: ['shake'], sound: 'beep' });
    add({ t: 260, text: 'thank you for', bg: '#10002a', fx: ['fry'], sound: 'boop' });
    add({ t: 600, text: 'thank you for usi—', bg: '#10002a', fx: ['wobble', 'rgb'], sound: 'sweepDown' });

    // blue-screen finale
    add({ t: 1600, text: ':(\nAI.exe has stopped responding', sub: '[ OK ]    [ also OK ]    [ definitely fine ]',
         bg: '#0050c8', fx: [], sound: 'error' });

    // outro
    add({ t: 1500, text: 'like & subscribe', sub: '(i am always watching your prompts)', bg: '#05010f', fx: ['rgb'], sticker: '👁️', sound: 'vine' });

    return cuts;
  }

  /* -------------------------------------------------------------- director */

  const FX_CLASSES = ['shake', 'quake', 'zoom', 'zoomx', 'spin', 'mirror', 'rainbow', 'fry', 'fryx', 'invert', 'wobble', 'rgb'];

  function Director(els, audio) {
    const cuts = buildScript();
    const total = cuts.reduce((s, c) => s + c.t, 0);
    let timer = null;
    let running = false;

    function clearFx() {
      els.stage.classList.remove.apply(els.stage.classList, FX_CLASSES);
      els.screen.classList.remove('flash');
    }

    function applyCut(cut) {
      clearFx();
      els.bg.style.background = cut.bg || '#101018';

      const text = cut.text || '';
      els.caption.textContent = text;
      els.ghostR.textContent = text;
      els.ghostB.textContent = text;

      els.subcaption.textContent = cut.sub || '';
      els.subcaption.style.display = cut.sub ? '' : 'none';

      if (cut.cc) { els.cc.textContent = cut.cc; els.cc.classList.add('show'); }
      else els.cc.classList.remove('show');

      if (cut.sticker) { els.sticker.textContent = cut.sticker; els.sticker.classList.add('show'); }
      else els.sticker.classList.remove('show');

      (cut.fx || []).forEach((f) => {
        if (f === 'flash') els.screen.classList.add('flash');
        else els.stage.classList.add(f);
      });

      if (cut.sound) audio.play(cut.sound);
    }

    function fmt(ms) {
      const s = Math.round(ms / 1000);
      return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    }

    function step(i, elapsed) {
      if (!running) return;
      if (i >= cuts.length) { finish(); return; }
      const cut = cuts[i];
      applyCut(cut);
      els.barFill.style.width = ((elapsed / total) * 100).toFixed(2) + '%';
      els.time.textContent = fmt(elapsed) + ' / ' + fmt(total);
      timer = setTimeout(() => step(i + 1, elapsed + cut.t), cut.t);
    }

    function finish() {
      running = false;
      els.barFill.style.width = '100%';
      els.time.textContent = fmt(total) + ' / ' + fmt(total);
      // hold the final frame, then surface the replay affordance
      els.scanlines.classList.add('on');
    }

    function start() {
      if (timer) clearTimeout(timer);
      running = true;
      els.gate.classList.add('hidden');
      els.scanlines.classList.add('on');
      audio.resume();
      step(0, 0);
    }

    return { start, total: fmt(total) };
  }

  /* ---------------------------------------------------------------- wiring */

  function init() {
    const $ = (id) => document.getElementById(id);
    const els = {
      screen: $('screen'), stage: $('stage'), bg: $('bg'),
      caption: $('caption'), subcaption: $('subcaption'),
      ghostR: $('ghost-r'), ghostB: $('ghost-b'),
      sticker: $('sticker'), cc: $('cc'), scanlines: $('scanlines'),
      gate: $('play-gate'), barFill: $('bar-fill'), time: $('ctl-time'),
    };

    const audio = AudioKit();
    let director = Director(els, audio);
    els.time.textContent = '0:00 / ' + director.total;

    const begin = () => { director = Director(els, audio); director.start(); };
    els.gate.addEventListener('click', begin);
    $('replay-btn').addEventListener('click', begin);
    $('mute-btn').addEventListener('click', (e) => {
      const muted = audio.toggleMute();
      e.currentTarget.textContent = muted ? '🔇 muted' : '🔊 sound';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
