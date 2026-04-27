// Pointer-driven input. Two kinds of grabs:
//   'orbiter' — flick a satellite into the center.
//   'center'  — drag-out to pull the most recent absorbed blob back out.
//
// On release we hand main.js a unified payload with the resolved velocity,
// the kind, and the drag distance so main.js can decide how to interpret it.

(function (global) {
  'use strict';

  const SAMPLE_WINDOW_MS = 80;
  const MAX_FLICK_SPEED = 2200; // px/sec
  const TAP_RELEASE_NUDGE = 280; // px/sec for slow orbiter releases

  function attachInput(canvas, ctx) {
    // ctx provides:
    //   getOrbiters()          -> Blob[]
    //   getCenter()            -> Blob
    //   canPullCenter()        -> boolean    // history non-empty + game playing
    //   onGrab({ kind, blob, x, y })
    //   onMove({ kind, blob, x, y })
    //   onRelease({ kind, blob, vx, vy, releaseX, releaseY, dragDist })

    let activePointerId = null;
    let kind = null; // 'orbiter' | 'center'
    let grabbed = null;
    let startX = 0, startY = 0;
    let samples = [];

    function localXY(ev) {
      const rect = canvas.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    }

    function pushSample(t, x, y) {
      samples.push({ t, x, y });
      const cutoff = t - SAMPLE_WINDOW_MS;
      while (samples.length > 1 && samples[0].t < cutoff) samples.shift();
    }

    function tryGrab(x, y) {
      const orbiters = ctx.getOrbiters();
      for (let i = orbiters.length - 1; i >= 0; i--) {
        if (orbiters[i].mode === 'orbit' && orbiters[i].hitTest(x, y)) {
          return { kind: 'orbiter', blob: orbiters[i] };
        }
      }
      const center = ctx.getCenter();
      if (center && center.hitTest(x, y) && ctx.canPullCenter && ctx.canPullCenter()) {
        return { kind: 'center', blob: center };
      }
      return null;
    }

    function onPointerDown(ev) {
      if (activePointerId !== null) return;
      const { x, y } = localXY(ev);
      const target = tryGrab(x, y);
      if (!target) return;

      ev.preventDefault();
      activePointerId = ev.pointerId;
      kind = target.kind;
      grabbed = target.blob;
      startX = x;
      startY = y;
      samples = [];
      pushSample(performance.now(), x, y);

      if (kind === 'orbiter') {
        grabbed.mode = 'grabbed';
        grabbed.vx = 0;
        grabbed.vy = 0;
        grabbed.x = x;
        grabbed.y = y;
      }

      try { canvas.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
      canvas.classList.add('grabbing');
      if (ctx.onGrab) ctx.onGrab({ kind, blob: grabbed, x, y });
    }

    function onPointerMove(ev) {
      if (ev.pointerId !== activePointerId || !grabbed) return;
      const { x, y } = localXY(ev);
      const now = performance.now();
      pushSample(now, x, y);
      if (kind === 'orbiter') {
        grabbed.x = x;
        grabbed.y = y;
      }
      if (ctx.onMove) ctx.onMove({ kind, blob: grabbed, x, y });
    }

    function onPointerEnd(ev) {
      if (ev.pointerId !== activePointerId) return;
      if (!grabbed) {
        activePointerId = null;
        kind = null;
        return;
      }

      const { x, y } = localXY(ev);
      const now = performance.now();
      pushSample(now, x, y);

      let vx = 0, vy = 0;
      if (samples.length >= 2) {
        const a = samples[0];
        const b = samples[samples.length - 1];
        const dt = (b.t - a.t) / 1000;
        if (dt > 0.005) {
          vx = (b.x - a.x) / dt;
          vy = (b.y - a.y) / dt;
        }
      }

      const speed = Math.hypot(vx, vy);

      if (kind === 'orbiter') {
        // Slow release becomes a forgiving nudge toward the center.
        if (speed < 80) {
          const center = ctx.getCenter();
          const dx = center.x - grabbed.x;
          const dy = center.y - grabbed.y;
          const d = Math.hypot(dx, dy) || 1;
          vx = (dx / d) * TAP_RELEASE_NUDGE;
          vy = (dy / d) * TAP_RELEASE_NUDGE;
        } else if (speed > MAX_FLICK_SPEED) {
          const k = MAX_FLICK_SPEED / speed;
          vx *= k;
          vy *= k;
        }
      } else if (kind === 'center') {
        if (speed > MAX_FLICK_SPEED) {
          const k = MAX_FLICK_SPEED / speed;
          vx *= k;
          vy *= k;
        }
      }

      const dragDist = Math.hypot(x - startX, y - startY);
      const payload = {
        kind,
        blob: grabbed,
        vx,
        vy,
        releaseX: x,
        releaseY: y,
        dragDist,
      };

      grabbed = null;
      kind = null;
      activePointerId = null;
      samples = [];
      canvas.classList.remove('grabbing');

      if (ctx.onRelease) ctx.onRelease(payload);

      try { canvas.releasePointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);

    return {
      cancel() {
        if (kind === 'orbiter' && grabbed) grabbed.mode = 'orbit';
        grabbed = null;
        kind = null;
        activePointerId = null;
        samples = [];
        canvas.classList.remove('grabbing');
      },
    };
  }

  global.Input = { attachInput };
})(window);
