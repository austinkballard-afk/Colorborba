// Light additive specks. Spawn rate scales with streak intensity.
// Used both as ambient sparkle around active blobs and for solve bursts.

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
        // Pick a source weighted by rate.
        let pick = Math.random() * totalRate;
        let chosen = sources[0];
        for (const s of sources) {
          pick -= s.rate;
          if (pick <= 0) { chosen = s; break; }
        }
        this.spawnOne(chosen);
      }
    }

    spawnOne(source) {
      const ang = rand(0, Math.PI * 2);
      const ringR = source.radius * rand(0.85, 1.15);
      const x = source.x + Math.cos(ang) * ringR;
      const y = source.y + Math.sin(ang) * ringR;
      const speed = rand(8, 26);
      const vx = Math.cos(ang) * speed + rand(-6, 6);
      const vy = Math.sin(ang) * speed + rand(-6, 6) - 8; // slight upward drift
      const life = rand(0.55, 0.95);
      this.particles.push({
        x, y, vx, vy,
        life,
        maxLife: life,
        size: rand(1.4, 2.6),
        rgb: global.Color.rybToRgb(source.color),
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
        });
      }
    }

    update(dt) {
      const drag = Math.pow(0.92, dt * 60);
      const surviving = [];
      for (const p of this.particles) {
        p.life -= dt;
        if (p.life <= 0) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= drag;
        p.vy *= drag;
        p.vy += 18 * dt; // gentle gravity so bursts arc
        surviving.push(p);
      }
      this.particles = surviving;
    }

    draw(ctx) {
      if (!this.particles.length) return;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const p of this.particles) {
        const t = p.life / p.maxLife; // 1..0
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
