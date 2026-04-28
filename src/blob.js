// Blob: organic, jiggly disc rendered with sum-of-sines radial perturbations.
// Acts as both the central blob and the orbiters. Mode-driven motion
// (orbit / grabbed / free) is updated externally; this class handles its own
// jiggle phases and rendering.

(function (global) {
  'use strict';

  const POINT_COUNT = 28;

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  class Blob {
    constructor(opts) {
      this.x = opts.x || 0;
      this.y = opts.y || 0;
      this.vx = 0;
      this.vy = 0;
      // Spring target while in 'grabbed' mode. main.js integrates the spring.
      this.targetX = this.x;
      this.targetY = this.y;
      this.color = opts.color.slice(); // RYB
      this.mass = opts.mass || 1;
      this.baseRadius = opts.radius || 30;

      // Orbit parameters (used when mode === 'orbit').
      this.orbitRadius = opts.orbitRadius || 0;
      this.orbitAngle = opts.orbitAngle || 0;
      this.orbitSpeed = opts.orbitSpeed || 0;
      this.wobbleAmp = opts.wobbleAmp || 0;
      this.wobbleFreq = opts.wobbleFreq || 0;
      this.wobblePhase = opts.wobblePhase || 0;

      this.mode = opts.mode || 'orbit'; // 'orbit' | 'grabbed' | 'free'
      this.alive = true;

      // Jiggle phases — each blob jiggles uniquely.
      this.jigglePhases = [
        { amp: 0.045, freq: rand(0.7, 1.1), phase: rand(0, Math.PI * 2), spatial: rand(1.6, 2.6) },
        { amp: 0.035, freq: rand(1.2, 1.8), phase: rand(0, Math.PI * 2), spatial: rand(2.5, 3.6) },
        { amp: 0.028, freq: rand(1.9, 2.7), phase: rand(0, Math.PI * 2), spatial: rand(3.5, 5.0) },
      ];

      // Squash-stretch impulse (set externally on absorption, decays to 0).
      this.squashImpulse = 0;

      // 0..1 — escalates jiggle amplitude/frequency (driven by streak).
      this.intensity = 0;

      // Slight rotation so jiggle pattern slowly rotates.
      this.rotation = rand(0, Math.PI * 2);
      this.rotationSpeed = rand(-0.15, 0.15);
    }

    get radius() {
      // mass scales radius via cube root for nicely bounded growth.
      return this.baseRadius * Math.cbrt(this.mass);
    }

    updateOrbit(dt, centerX, centerY, t) {
      this.orbitAngle += this.orbitSpeed * dt;
      const r = this.orbitRadius + Math.sin(t * this.wobbleFreq + this.wobblePhase) * this.wobbleAmp;
      this.x = centerX + Math.cos(this.orbitAngle) * r;
      this.y = centerY + Math.sin(this.orbitAngle) * r;
    }

    updateFree(dt) {
      // Light drag so unabsorbed flicks slow over time.
      const drag = Math.pow(0.985, dt * 60);
      this.vx *= drag;
      this.vy *= drag;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
    }

    tickAnim(dt) {
      this.rotation += this.rotationSpeed * dt;
      this.squashImpulse *= Math.pow(0.92, dt * 60);
      if (Math.abs(this.squashImpulse) < 0.001) this.squashImpulse = 0;
    }

    // Generate the polar radii for the current frame.
    sampleRadii(t) {
      const r = this.radius;
      const out = new Float32Array(POINT_COUNT);
      const squash = this.squashImpulse;
      const intensity = this.intensity > 0 ? this.intensity : 0;
      const ampScale = 1 + 0.7 * intensity;
      const freqScale = 1 + 0.3 * intensity;

      // Velocity-driven tail. Concentrates elongation behind the direction
      // of motion (cometlike), with a mild forward squish so the leading
      // edge looks rounded.
      const speed = Math.hypot(this.vx, this.vy);
      const stretch = Math.min(0.6, speed / 700);
      const velAngle = speed > 0.001 ? Math.atan2(this.vy, this.vx) : 0;

      for (let i = 0; i < POINT_COUNT; i++) {
        const ang = (i / POINT_COUNT) * Math.PI * 2 + this.rotation;
        let perturb = 0;
        for (const w of this.jigglePhases) {
          perturb += (w.amp * ampScale) * Math.sin(t * w.freq * freqScale + w.phase + ang * w.spatial);
        }
        // Brief overall pulse on absorption.
        perturb += squash * 0.18;
        if (stretch > 0) {
          const cosD = Math.cos(ang - velAngle);
          // Back tail: ((1 - cosD) / 2)^4 spikes only on the trailing side
          // and tapers to zero quickly toward the sides — a thin tail.
          const backFactor = Math.pow((1 - cosD) * 0.5, 4);
          // Forward squish: mild flattening of the leading edge.
          const frontFactor = (1 + cosD) * 0.5;
          perturb += stretch * 2.0 * backFactor;
          perturb -= stretch * 0.18 * frontFactor;
        }
        out[i] = r * (1 + perturb);
      }
      return out;
    }

    draw(ctx, t) {
      const radii = this.sampleRadii(t);
      const baseAng = (i) => (i / POINT_COUNT) * Math.PI * 2 + this.rotation;

      // Build smooth path through midpoints with quadratic curves (radii as
      // control distances).
      const points = new Array(POINT_COUNT);
      for (let i = 0; i < POINT_COUNT; i++) {
        const a = baseAng(i);
        points[i] = [this.x + Math.cos(a) * radii[i], this.y + Math.sin(a) * radii[i]];
      }

      ctx.save();

      // Soft drop shadow for depth.
      ctx.shadowColor = 'rgba(0, 0, 0, 0.45)';
      ctx.shadowBlur = 24;
      ctx.shadowOffsetY = 6;

      ctx.beginPath();
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const start = mid(points[POINT_COUNT - 1], points[0]);
      ctx.moveTo(start[0], start[1]);
      for (let i = 0; i < POINT_COUNT; i++) {
        const next = points[(i + 1) % POINT_COUNT];
        const m = mid(points[i], next);
        ctx.quadraticCurveTo(points[i][0], points[i][1], m[0], m[1]);
      }
      ctx.closePath();

      // Radial gradient for a 3D bead-of-paint look.
      const rgb = global.Color.rybToRgb(this.color);
      const light = global.Color.lightenRgb(rgb, 0.45);
      const dark = global.Color.darkenRgb(rgb, 0.18);
      const r = this.radius;
      const grad = ctx.createRadialGradient(
        this.x - r * 0.35, this.y - r * 0.4, r * 0.1,
        this.x, this.y, r * 1.1
      );
      grad.addColorStop(0, global.Color.rgbToCss(light));
      grad.addColorStop(0.55, global.Color.rgbToCss(rgb));
      grad.addColorStop(1, global.Color.rgbToCss(dark));
      ctx.fillStyle = grad;
      ctx.fill();

      // Glossy highlight on top-left, no shadow.
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.ellipse(
        this.x - r * 0.32,
        this.y - r * 0.42,
        r * 0.32,
        r * 0.18,
        -0.6,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
      ctx.fill();

      ctx.restore();
    }

    hitTest(px, py) {
      const dx = px - this.x;
      const dy = py - this.y;
      // Slightly generous hit radius for usability.
      const r = this.radius * 1.15;
      return dx * dx + dy * dy <= r * r;
    }
  }

  global.Blob = Blob;
})(window);
