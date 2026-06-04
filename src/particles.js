// Two flavors of particle:
//   ambient sparkle  — additive blend, gentle gravity, fades quickly.
//   paint drip       — opaque, heavier gravity, falls off the tail of fast
//                      blobs like dripping pigment.

(function (global) {
  'use strict';

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  class ParticleSystem {
    constructor() {
      this.particles = [];
      this.spawnAccumulator = 0;
    }

    clear() {
      this.particles.length = 0;
      this.spawnAccumulator = 0;
    }

    // Continuous ambient emission. `sources` is an array of
    // { x, y, radius, color (RYB), rate (per second) } objects.
    emitAmbient(dt, sources) {
      if (!sources.length) return;
      let totalRate = 0;
      for (const s of sources) totalRate += s.rate;
      this.spawnAccumulator += totalRate * dt;
      while (this.spawnAccumulator >= 1) {
        this.spawnAccumulator -= 1;
        let pick = Math.random() * totalRate;
        let chosen = sources[0];
        for (const s of sources) {
          pick -= s.rate;
          if (pick <= 0) { chosen = s; break; }
        }
        this.spawnSparkle(chosen);
      }
    }

    spawnSparkle(source) {
      const ang = rand(0, Math.PI * 2);
      const ringR = source.radius * rand(0.85, 1.15);
      const x = source.x + Math.cos(ang) * ringR;
      const y = source.y + Math.sin(ang) * ringR;
      const speed = rand(8, 26);
      const vx = Math.cos(ang) * speed + rand(-6, 6);
      const vy = Math.sin(ang) * speed + rand(-6, 6) - 8;
      const life = rand(0.55, 0.95);
      this.particles.push({
        x, y, vx, vy,
        life,
        maxLife: life,
        size: rand(1.4, 2.6),
        rgb: global.Color.rybToRgb(source.color),
        solid: false,
        gravity: 18,
        drag: 0.92,
      });
    }

    // Drips fall off the tail of a fast-moving blob. Seed with mostly the
    // blob's velocity (so they trail behind for a moment) plus heavy gravity
    // so they sag like real paint.
    spawnDrip(x, y, vx, vy, color) {
      const life = rand(0.6, 1.1);
      this.particles.push({
        x, y,
        vx: vx * 0.18 + rand(-22, 22),
        vy: vy * 0.18 + rand(-12, 22),
        life,
        maxLife: life,
        size: rand(2.4, 3.8),
        rgb: global.Color.rybToRgb(color),
        solid: true,
        gravity: 380,
        drag: 0.985,
      });
    }

    // Pour droplet: a fat blob of pigment launched from a jar toward the well.
    // Aimed so it arcs into the well and lands roughly when it arrives.
    spawnPourDroplet(srcX, srcY, dstX, dstY, color) {
      const dx = dstX - srcX;
      const dy = dstY - srcY;
      const travel = rand(0.16, 0.26); // seconds to reach the well
      const gravity = 900;
      // Solve for the launch velocity of a projectile that lands at dst in
      // `travel` seconds under gravity.
      const vx = dx / travel + rand(-18, 18);
      const vy = (dy - 0.5 * gravity * travel * travel) / travel;
      this.particles.push({
        x: srcX + rand(-3, 3),
        y: srcY + rand(-3, 3),
        vx, vy,
        life: travel,
        maxLife: travel,
        size: rand(2.6, 4.2),
        rgb: global.Color.rybToRgb(color),
        solid: true,
        gravity,
        drag: 0.999,
      });
    }

    // One-off burst at a point in a chosen color, e.g. solve celebration.
    burst(x, y, color, count) {
      const rgb = global.Color.rybToRgb(color);
      for (let i = 0; i < count; i++) {
        const ang = rand(0, Math.PI * 2);
        const speed = rand(60, 220);
        const life = rand(0.6, 1.2);
        this.particles.push({
          x, y,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed - 30,
          life,
          maxLife: life,
          size: rand(1.8, 3.4),
          rgb,
          solid: false,
          gravity: 18,
          drag: 0.92,
        });
      }
    }

    update(dt) {
      const surviving = [];
      for (const p of this.particles) {
        p.life -= dt;
        if (p.life <= 0) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        const drag = Math.pow(p.drag, dt * 60);
        p.vx *= drag;
        p.vy *= drag;
        p.vy += p.gravity * dt;
        surviving.push(p);
      }
      this.particles = surviving;
    }

    draw(ctx) {
      if (!this.particles.length) return;

      // Solid drips — opaque, normal compositing, drawn first so additive
      // sparkles on top read clearly above them.
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetY = 1.5;
      for (const p of this.particles) {
        if (!p.solid) continue;
        const t = p.life / p.maxLife;
        const alpha = Math.min(1, t * 1.6);
        ctx.fillStyle = `rgba(${p.rgb[0]}, ${p.rgb[1]}, ${p.rgb[2]}, ${alpha})`;
        ctx.beginPath();
        // Slight vertical stretch so drips look elongated as they fall.
        const sx = p.size * (0.85 + 0.25 * t);
        const sy = sx * (1 + Math.min(0.8, Math.abs(p.vy) / 600));
        ctx.ellipse(p.x, p.y, sx, sy, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      // Additive sparkles.
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.particles) {
        if (p.solid) continue;
        const t = p.life / p.maxLife;
        const alpha = Math.min(1, t * 1.4);
        ctx.fillStyle = `rgba(${p.rgb[0]}, ${p.rgb[1]}, ${p.rgb[2]}, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.6 + 0.4 * t), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  global.Particles = { ParticleSystem };
})(window);
