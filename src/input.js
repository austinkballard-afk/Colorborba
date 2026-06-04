// Pointer input for the pour mechanic.
//
// Press and hold a pigment jar to start pouring it into the well; release to
// stop. That's the whole gesture — duration controls how much paint goes in,
// which is what makes hitting an exact ratio a matter of feel. main.js does the
// actual pouring each frame based on which jar is currently held.

(function (global) {
  'use strict';

  function attachInput(canvas, ctx) {
    // ctx provides:
    //   getPigments()  -> [{ x, y, radius, reserve, id, ... }]
    //   isPlaying()    -> boolean
    //   onPourStart(pigment)
    //   onPourEnd(pigment)

    let activePointerId = null;
    let held = null;

    function localXY(ev) {
      const rect = canvas.getBoundingClientRect();
      return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
    }

    function pigmentAt(x, y) {
      const pigments = ctx.getPigments();
      // Front-to-back so the topmost jar wins if any overlap.
      for (let i = pigments.length - 1; i >= 0; i--) {
        const p = pigments[i];
        if (p.reserve <= 0.0001) continue;
        const dx = x - p.x;
        const dy = y - p.y;
        const r = p.radius * 1.35 + 10; // generous touch target
        if (dx * dx + dy * dy <= r * r) return p;
      }
      return null;
    }

    function onPointerDown(ev) {
      if (activePointerId !== null || !ctx.isPlaying()) return;
      const { x, y } = localXY(ev);
      const p = pigmentAt(x, y);
      if (!p) return;

      ev.preventDefault();
      activePointerId = ev.pointerId;
      held = p;
      try { canvas.setPointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
      canvas.classList.add('grabbing');
      if (ctx.onPourStart) ctx.onPourStart(p);
    }

    function onPointerEnd(ev) {
      if (ev.pointerId !== activePointerId) return;
      const ending = held;
      held = null;
      activePointerId = null;
      canvas.classList.remove('grabbing');
      if (ending && ctx.onPourEnd) ctx.onPourEnd(ending);
      try { canvas.releasePointerCapture(ev.pointerId); } catch (_) { /* ignore */ }
    }

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerEnd);
    canvas.addEventListener('pointercancel', onPointerEnd);

    return {
      heldPigment() { return held; },
      cancel() {
        const ending = held;
        held = null;
        activePointerId = null;
        canvas.classList.remove('grabbing');
        if (ending && ctx.onPourEnd) ctx.onPourEnd(ending);
      },
    };
  }

  global.Input = { attachInput };
})(window);
