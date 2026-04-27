// Drag-and-flick input. Supports mouse + touch via Pointer Events.
// While grabbed, the held blob follows the pointer. On release, we compute
// a velocity from a short ring buffer of recent samples (~80ms) and hand
// the blob back to game logic.

(function (global) {
  'use strict';

  const SAMPLE_WINDOW_MS = 80;
  const MAX_FLICK_SPEED = 2200; // px/sec, clamp so wild flicks don't overshoot
  const TAP_RELEASE_NUDGE = 280; // px/sec when released without motion

  function attachInput(canvas, ctx) {
    // ctx provides:
    //   getOrbiters() -> Blob[]
    //   getCenter() -> Blob
    //   onGrab(blob) / onRelease(blob, vx, vy)

    let activePointerId = null;
    let grabbed = null;
    let samples = []; // {t, x, y}

    function localXY(ev) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ev.clientX - rect.left,
        y: ev.clientY - rect.top,
      };
    }

    function pushSample(t, x, y) {
      samples.push({ t, x, y });
      const cutoff = t - SAMPLE_WINDOW_MS;
      while (samples.length > 1 && samples[0].t < cutoff) samples.shift();
    }

    function onPointerDown(ev) {
      if (activePointerId !== null) return;
      const { x, y } = localXY(ev);
      const orbiters = ctx.getOrbiters();
      // Hit-test top-down (last drawn wins) — orbiters are drawn in order.
      let hit = null;
      for (let i = orbiters.length - 1; i >= 0; i--) {
        if (orbiters[i].mode === 'orbit' && orbiters[i].hitTest(x, y)) {
          hit = orbiters[i];
          break;
        }
      }
      if (!hit) return;

      ev.preventDefault();
      activePointerId = ev.pointerId;
      grabbed = hit;
      samples = [];
      const now = performance.now();
      pushSample(now, x, y);

      grabbed.mode = 'grabbed';
      grabbed.vx = 0;
      grabbed.vy = 0;
      grabbed.x = x;
      grabbed.y = y;

      try { canvas.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      canvas.classList.add('grabbing');
      if (ctx.onGrab) ctx.onGrab(grabbed);
    }

    function onPointerMove(ev) {
      if (ev.pointerId !== activePointerId || !grabbed) return;
      const { x, y } = localXY(ev);
      const now = performance.now();
      grabbed.x = x;
      grabbed.y = y;
      pushSample(now, x, y);
    }

    function onPointerEnd(ev) {
      if (ev.pointerId !== activePointerId) return;
      if (!grabbed) {
        activePointerId = null;
        return;
      }

      const now = performance.now();
      const { x, y } = localXY(ev);
      pushSample(now, x, y);

      // Velocity from oldest-vs-newest sample in the window.
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

      // If they basically didn't flick, give it a tiny nudge toward the
      // center so a simple tap still does something forgiving.
      const speed = Math.hypot(vx, vy);
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

      const released = grabbed;
      grabbed = null;
      activePointerId = null;
      samples = [];
      canvas.classList.remove('grabbing');

      if (ctx.onRelease) ctx.onRelease(released, vx, vy);

      try { canvas.releasePointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);

    return {
      cancel() {
        if (grabbed) {
          grabbed.mode = 'orbit';
          grabbed = null;
        }
        activePointerId = null;
        samples = [];
        canvas.classList.remove('grabbing');
      },
    };
  }

  global.Input = { attachInput };
})(window);
