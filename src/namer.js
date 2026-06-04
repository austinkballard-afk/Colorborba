// Color namer. Maps an RGB triple to the nearest evocative paint name from a
// curated anchor list. Pure flavor — gives every target a memorable identity
// ("Terracotta", "Sage", "Plum") so a procedurally generated mix feels crafted.

(function (global) {
  'use strict';

  // [name, [r, g, b]] anchors spanning hue x lightness x saturation.
  const ANCHORS = [
    ['Snow', [247, 247, 251]], ['Ivory', [245, 239, 223]], ['Bone', [232, 226, 208]],
    ['Putty', [201, 191, 174]], ['Ash', [184, 184, 184]], ['Stone', [163, 158, 147]],
    ['Taupe', [153, 136, 119]], ['Slate', [90, 100, 112]], ['Charcoal', [46, 46, 53]],
    ['Ink', [20, 20, 26]], ['Onyx', [10, 10, 13]],

    ['Blush', [246, 201, 192]], ['Rose', [232, 138, 154]], ['Coral', [255, 122, 92]],
    ['Salmon', [240, 132, 107]], ['Crimson', [200, 32, 63]], ['Ruby', [155, 28, 49]],
    ['Brick', [140, 59, 43]], ['Maroon', [94, 20, 34]], ['Wine', [94, 31, 58]],

    ['Persimmon', [226, 85, 45]], ['Rust', [168, 66, 31]], ['Apricot', [247, 183, 107]],
    ['Amber', [240, 168, 48]], ['Marigold', [244, 160, 0]], ['Ochre', [201, 138, 43]],
    ['Honey', [217, 164, 65]], ['Caramel', [181, 121, 63]], ['Tan', [205, 170, 125]],

    ['Butter', [245, 224, 122]], ['Lemon', [242, 227, 76]], ['Gold', [230, 195, 74]],
    ['Flax', [216, 200, 120]], ['Khaki', [189, 176, 118]],

    ['Chartreuse', [182, 211, 58]], ['Lime', [139, 195, 74]], ['Fern', [90, 143, 60]],
    ['Olive', [107, 123, 42]], ['Moss', [79, 107, 47]], ['Sage', [156, 175, 136]],
    ['Mint', [174, 224, 192]], ['Jade', [47, 170, 106]], ['Emerald', [31, 138, 90]],
    ['Forest', [31, 94, 58]], ['Pine', [25, 77, 54]],

    ['Teal', [31, 138, 138]], ['Aqua', [79, 208, 208]], ['Sky', [127, 191, 230]],
    ['Azure', [47, 127, 214]], ['Cobalt', [42, 79, 184]], ['Sapphire', [31, 58, 138]],
    ['Navy', [20, 33, 63]],

    ['Periwinkle', [154, 166, 230]], ['Lavender', [195, 166, 224]], ['Lilac', [207, 159, 224]],
    ['Violet', [138, 79, 208]], ['Amethyst', [111, 58, 168]], ['Indigo', [58, 42, 138]],
    ['Plum', [107, 47, 107]], ['Grape', [74, 32, 96]], ['Mulberry', [122, 42, 85]],

    ['Mauve', [176, 138, 160]], ['Orchid', [210, 127, 192]], ['Magenta', [214, 58, 150]],
    ['Fuchsia', [224, 71, 159]],

    ['Chestnut', [122, 74, 43]], ['Coffee', [78, 52, 42]], ['Umber', [90, 70, 54]],
    ['Sepia', [110, 82, 48]], ['Mahogany', [107, 51, 38]],
  ];

  function nameColor(rgb) {
    let best = ANCHORS[0][0];
    let bestD = Infinity;
    for (const [name, c] of ANCHORS) {
      const dr = rgb[0] - c[0];
      const dg = rgb[1] - c[1];
      const db = rgb[2] - c[2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) { bestD = d; best = name; }
    }
    return best;
  }

  global.Namer = { nameColor };
})(window);
