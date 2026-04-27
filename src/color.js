// Paint-like color mixing via RYB color space.
// All blob colors are stored as RYB triples (each component 0..1).
// Conversion to RGB uses Sugita & Takahashi's trilinear interpolation
// between eight cube corners, mapping (R, Y, B) -> (R, G, B).
//
// Key cube corners:
//   (0,0,0) W = white      (1,0,0) R = red
//   (0,1,0) Y = yellow     (0,0,1) B = blue
//   (1,1,0) O = orange     (1,0,1) V = violet
//   (0,1,1) G = green      (1,1,1) K = black

(function (global) {
  'use strict';

  const CORNERS = [
    [1.0, 1.0, 1.0], // W (0,0,0)
    [1.0, 0.0, 0.0], // R (1,0,0)
    [1.0, 1.0, 0.0], // Y (0,1,0)
    [0.0, 0.0, 1.0], // B (0,0,1)
    [1.0, 0.5, 0.0], // O (1,1,0)
    [0.5, 0.0, 0.5], // V (1,0,1)
    [0.0, 0.5, 0.0], // G (0,1,1)
    [0.0, 0.0, 0.0], // K (1,1,1)
  ];

  function clamp01(v) {
    return v < 0 ? 0 : v > 1 ? 1 : v;
  }

  function rybToRgb(rybColor) {
    const r = clamp01(rybColor[0]);
    const y = clamp01(rybColor[1]);
    const b = clamp01(rybColor[2]);

    const w = [
      (1 - r) * (1 - y) * (1 - b), // W
      r * (1 - y) * (1 - b),       // R
      (1 - r) * y * (1 - b),       // Y
      (1 - r) * (1 - y) * b,       // B
      r * y * (1 - b),             // O
      r * (1 - y) * b,             // V
      (1 - r) * y * b,             // G
      r * y * b,                   // K
    ];

    let cr = 0, cg = 0, cb = 0;
    for (let i = 0; i < 8; i++) {
      cr += CORNERS[i][0] * w[i];
      cg += CORNERS[i][1] * w[i];
      cb += CORNERS[i][2] * w[i];
    }

    return [
      Math.round(clamp01(cr) * 255),
      Math.round(clamp01(cg) * 255),
      Math.round(clamp01(cb) * 255),
    ];
  }

  function rybToCss(rybColor) {
    const [r, g, b] = rybToRgb(rybColor);
    return `rgb(${r}, ${g}, ${b})`;
  }

  function rybToHex(rybColor) {
    const [r, g, b] = rybToRgb(rybColor);
    const h = (n) => n.toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
  }

  // Weighted mix of two RYB colors by mass.
  function mix(colorA, massA, colorB, massB) {
    const total = massA + massB;
    if (total <= 0) return [colorA[0], colorA[1], colorA[2]];
    const t = massB / total;
    return [
      colorA[0] + (colorB[0] - colorA[0]) * t,
      colorA[1] + (colorB[1] - colorA[1]) * t,
      colorA[2] + (colorB[2] - colorA[2]) * t,
    ];
  }

  // Euclidean distance in RYB space (0..sqrt(3)).
  function distance(a, b) {
    const dr = a[0] - b[0];
    const dy = a[1] - b[1];
    const db = a[2] - b[2];
    return Math.sqrt(dr * dr + dy * dy + db * db);
  }

  // Lighten a CSS-displayable RGB toward white for highlights.
  function lightenRgb(rgb, amount) {
    return [
      Math.round(rgb[0] + (255 - rgb[0]) * amount),
      Math.round(rgb[1] + (255 - rgb[1]) * amount),
      Math.round(rgb[2] + (255 - rgb[2]) * amount),
    ];
  }

  function darkenRgb(rgb, amount) {
    return [
      Math.round(rgb[0] * (1 - amount)),
      Math.round(rgb[1] * (1 - amount)),
      Math.round(rgb[2] * (1 - amount)),
    ];
  }

  function rgbToCss(rgb) {
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  }

  global.Color = {
    rybToRgb,
    rybToCss,
    rybToHex,
    mix,
    distance,
    lightenRgb,
    darkenRgb,
    rgbToCss,
    clamp01,
  };
})(window);
