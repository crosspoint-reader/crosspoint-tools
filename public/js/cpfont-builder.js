/**
 * Browser-side builder for CrossPoint .cpfont v4 files.
 *
 * Uses opentype.js for kerning (GPOS/kern) and ligature (GSUB) extraction,
 * and Canvas 2D for glyph rasterisation into 2-bit bitmaps.
 *
 * Binary layout matches lib/EpdFont/scripts/fontconvert_sdcard.py exactly.
 */
(function (global) {
  'use strict';

  // ── Constants ──────────────────────────────────────────────────────────

  var MAGIC = [0x43, 0x50, 0x46, 0x4F, 0x4E, 0x54, 0x00, 0x00]; // "CPFONT\0\0"
  var VERSION = 4;
  var HEADER_SIZE = 32;
  var STYLE_TOC_SIZE = 32;

  var SIZES = [12, 14, 16, 18];
  /** DPI used by fontconvert_sdcard.py — Canvas uses px so we convert. */
  var RASTER_DPI = 150;
  /** Scale factor: pt at 150 DPI → CSS px (96 DPI). */
  var PT_TO_PX = RASTER_DPI / 72;

  /** Unicode interval presets matching fontconvert_sdcard.py "builtin". */
  var BUILTIN_INTERVALS = [
    [0x0020, 0x007F],
    [0x0080, 0x00FF],
    [0x0100, 0x017F],
    [0x01A0, 0x01A1], [0x01AF, 0x01B0],
    [0x01C4, 0x021F],
    [0x0300, 0x036F],
    [0x0400, 0x04FF],
    [0x1EA0, 0x1EF9],
    [0x2000, 0x206F],
    [0x20A0, 0x20CF],
    [0x2070, 0x209F],
    [0x2190, 0x21FF],
    [0x2200, 0x22FF],
    [0xFB00, 0xFB06],
  ];

  var LATIN_EXT_INTERVALS = [
    [0x0020, 0x007E],
    [0x0080, 0x00FF],
    [0x0100, 0x024F],
    [0x1E00, 0x1EFF],
    [0x2000, 0x206F],
  ];

  /** Symbols commonly seen in scifi/popsci/literary fiction (math, arrows,
   *  music notes, geometric shapes). Not a standard Unicode block grouping —
   *  designed to fill the gaps between latin-ext and the symbol blocks. */
  var SYMBOLS_INTERVALS = [
    [0x2070, 0x209F], // Superscripts and subscripts
    [0x20A0, 0x20CF], // Currency
    [0x2150, 0x218F], // Number forms (½, ¼, Roman numerals)
    [0x2190, 0x21FF], // Arrows
    [0x2200, 0x22FF], // Mathematical operators
    [0x2500, 0x257F], // Box drawing
    [0x25A0, 0x25FF], // Geometric shapes
    [0x2600, 0x26FF], // Miscellaneous symbols (♪ ♫ ♬ ♭ ♮ ♯ ★ ☆)
    [0x2700, 0x27BF], // Dingbats (✓ ✗ ❦)
  ];

  /** Composite preset for English-language literary fiction including
   *  scifi/popsci. Covers Project Hail Mary, The Martian, etc. — Greek for
   *  physics terms, math symbols, and miscellaneous symbols for music notes
   *  and other glyphs commonly used in modern fiction. */
  var READING_INTERVALS = [
    [0x0020, 0x024F], // Latin + Latin Extended-A/B
    [0x0300, 0x036F], // Combining diacritics
    [0x0370, 0x03FF], // Greek
    [0x0400, 0x04FF], // Cyrillic
    [0x1E00, 0x1EFF], // Latin Extended Additional
    [0x2000, 0x206F], // General punctuation
    [0x2070, 0x209F], // Superscripts and subscripts
    [0x20A0, 0x20CF], // Currency
    [0x2150, 0x218F], // Number forms
    [0x2190, 0x21FF], // Arrows
    [0x2200, 0x22FF], // Mathematical operators
    [0x2500, 0x257F], // Box drawing
    [0x25A0, 0x25FF], // Geometric shapes
    [0x2600, 0x26FF], // Miscellaneous symbols (music notes, stars)
    [0x2700, 0x27BF], // Dingbats
    [0xFB00, 0xFB06], // Latin ligatures (ﬁ ﬂ)
  ];

  var INTERVAL_PRESETS = {
    builtin: BUILTIN_INTERVALS,
    'latin-ext': LATIN_EXT_INTERVALS,
    symbols: SYMBOLS_INTERVALS,
    reading: READING_INTERVALS,
  };

  var STANDARD_LIGATURE_MAP = {
    '102,102':       0xFB00, // ff
    '102,105':       0xFB01, // fi
    '102,108':       0xFB02, // fl
    '102,102,105':   0xFB03, // ffi
    '102,102,108':   0xFB04, // ffl
    '383,116':       0xFB05, // long-s + t
    '115,116':       0xFB06, // st
  };

  var STYLE_IDS = { regular: 0, bold: 1, italic: 2, bolditalic: 3 };

  // ── Fixed-point helpers ────────────────────────────────────────────────

  /** Convert a pixel value to 12.4 fixed-point (uint16). */
  function fp4FromPixels(px) {
    return Math.round(px * 16) & 0xFFFF;
  }

  /** Convert a design-unit kerning value to 4.4 fixed-point (int8), clamped. */
  function fp4FromDesignUnits(du, scale) {
    var raw = Math.round(du * scale * 16);
    return Math.max(-128, Math.min(127, raw));
  }

  // ── Rasterisation ──────────────────────────────────────────────────────

  /**
   * Rasterise glyphs for one style at one size.
   * Returns { glyphs, bitmapChunks, totalBitmapSize, advanceY, ascender, descender, intervals }.
   */
  function rasterizeStyle(otFont, sizePt, intervals) {
    var canvasPx = sizePt * PT_TO_PX;
    var scale = canvasPx / otFont.unitsPerEm;

    // Validate intervals against font coverage
    var validatedIntervals = [];
    for (var ii = 0; ii < intervals.length; ii++) {
      var iStart = intervals[ii][0], iEnd = intervals[ii][1];
      var runStart = iStart;
      for (var cp = iStart; cp <= iEnd; cp++) {
        var gi = otFont.charToGlyphIndex(String.fromCodePoint(cp));
        if (gi === 0 && cp !== 0) {
          if (runStart < cp) validatedIntervals.push([runStart, cp - 1]);
          runStart = cp + 1;
        }
      }
      if (runStart <= iEnd) validatedIntervals.push([runStart, iEnd]);
    }
    intervals = validatedIntervals;

    // Create offscreen canvas for rasterisation
    var canvas = document.createElement('canvas');
    var maxSide = Math.ceil(canvasPx * 3);
    canvas.width = maxSide;
    canvas.height = maxSide;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });

    var glyphs = [];
    var bitmapChunks = [];
    var totalBitmapSize = 0;

    for (var iv = 0; iv < intervals.length; iv++) {
      for (var cp = intervals[iv][0]; cp <= intervals[iv][1]; cp++) {
        var glyphIndex = otFont.charToGlyphIndex(String.fromCodePoint(cp));
        var otGlyph = otFont.glyphs.get(glyphIndex);

        if (!otGlyph || glyphIndex === 0) {
          glyphs.push({ width: 0, height: 0, advanceX: 0, left: 0, top: 0,
                        dataLength: 0, dataOffset: totalBitmapSize, cp: cp });
          bitmapChunks.push(new Uint8Array(0));
          continue;
        }

        // Get advance width in 12.4 fixed-point
        var advanceX = fp4FromPixels((otGlyph.advanceWidth || 0) * scale);

        // Get the path at baseline origin (0,0) to find its pixel-space bbox
        var probePath = otGlyph.getPath(0, 0, canvasPx);
        var bbox = probePath.getBoundingBox();

        if (!bbox || bbox.x1 >= bbox.x2 || bbox.y1 >= bbox.y2) {
          glyphs.push({ width: 0, height: 0, advanceX: advanceX, left: 0, top: 0,
                        dataLength: 0, dataOffset: totalBitmapSize, cp: cp });
          bitmapChunks.push(new Uint8Array(0));
          continue;
        }

        var x1 = Math.floor(bbox.x1);
        var y1 = Math.floor(bbox.y1);
        var x2 = Math.ceil(bbox.x2);
        var y2 = Math.ceil(bbox.y2);

        var gw = x2 - x1;
        var gh = y2 - y1;
        if (gw <= 0 || gh <= 0) {
          glyphs.push({ width: 0, height: 0, advanceX: advanceX, left: 0, top: 0,
                        dataLength: 0, dataOffset: totalBitmapSize, cp: cp });
          bitmapChunks.push(new Uint8Array(0));
          continue;
        }

        // Clamp dimensions
        if (gw > 255) gw = 255;
        if (gh > 255) gh = 255;

        // Render glyph offset so its top-left corner is at canvas (0,0)
        ctx.clearRect(0, 0, gw + 2, gh + 2);
        var path = otGlyph.getPath(-x1, -y1, canvasPx);
        path.fill = 'black';
        path.draw(ctx);

        var imgData = ctx.getImageData(0, 0, gw, gh);
        var pixels = imgData.data;

        // Pack into 2-bit bitmap (matching fontconvert_sdcard.py)
        var totalPx = gw * gh;
        var nbytes = Math.ceil(totalPx / 4);
        var packed = new Uint8Array(nbytes);

        for (var i = 0; i < totalPx; i++) {
          var alpha = pixels[i * 4 + 3]; // use alpha channel
          var stored;
          if (alpha >= 192) stored = 3;
          else if (alpha >= 128) stored = 2;
          else if (alpha >= 64) stored = 1;
          else stored = 0;

          var byteIdx = i >> 2;
          var shift = (3 - (i & 3)) << 1;
          packed[byteIdx] |= (stored << shift);
        }

        glyphs.push({
          width: gw,
          height: gh,
          advanceX: advanceX,
          left: x1,
          top: -y1, // bitmap_top: distance from baseline to top of bitmap (y1 is negative above baseline)
          dataLength: packed.length,
          dataOffset: totalBitmapSize,
          cp: cp,
        });
        bitmapChunks.push(packed);
        totalBitmapSize += packed.length;
      }
    }

    // Font metrics (matching fontconvert_sdcard.py: uses face.size metrics)
    var ascender = Math.ceil(otFont.ascender * scale);
    var descender = Math.floor(otFont.descender * scale);
    var advanceY = ascender - descender;
    if (advanceY < 1) advanceY = Math.ceil(canvasPx);
    if (advanceY > 255) advanceY = 255;

    return {
      glyphs: glyphs,
      bitmapChunks: bitmapChunks,
      totalBitmapSize: totalBitmapSize,
      advanceY: advanceY,
      ascender: ascender,
      descender: descender,
      intervals: intervals,
    };
  }

  // ── Kerning extraction ─────────────────────────────────────────────────

  /**
   * Extract kerning pairs from an opentype.js font object.
   * Returns Map of "leftCp,rightCp" -> designUnitAdjust.
   */
  function extractKerning(otFont, codepoints) {
    var kernMap = new Map();
    var cpSet = new Set(codepoints);

    // Build codepoint -> glyph index map
    var cpToGlyph = new Map();
    var glyphToCps = new Map();
    for (var it = cpSet.values(), v; !(v = it.next()).done;) {
      var cp = v.value;
      var gi = otFont.charToGlyphIndex(String.fromCodePoint(cp));
      if (gi > 0) {
        cpToGlyph.set(cp, gi);
        if (!glyphToCps.has(gi)) glyphToCps.set(gi, []);
        glyphToCps.get(gi).push(cp);
      }
    }

    // Use opentype.js kerning tables if available
    if (otFont.kerningPairs) {
      for (var key in otFont.kerningPairs) {
        var parts = key.split(',');
        var lgi = parseInt(parts[0], 10);
        var rgi = parseInt(parts[1], 10);
        var val = otFont.kerningPairs[key];
        if (val === 0) continue;
        if (!glyphToCps.has(lgi) || !glyphToCps.has(rgi)) continue;
        var lcps = glyphToCps.get(lgi);
        var rcps = glyphToCps.get(rgi);
        for (var li = 0; li < lcps.length; li++) {
          for (var ri = 0; ri < rcps.length; ri++) {
            var k = lcps[li] + ',' + rcps[ri];
            kernMap.set(k, (kernMap.get(k) || 0) + val);
          }
        }
      }
    }

    // Also try GPOS kern feature via getKerningValue
    if (otFont.position && otFont.position.defaultKerningTables) {
      var allCps = Array.from(cpSet);
      // For efficiency, only check pairs where at least one is a common letter
      var commonCps = allCps.filter(function(cp) {
        return (cp >= 0x20 && cp <= 0x7E) || (cp >= 0xC0 && cp <= 0xFF);
      });
      var otherCps = allCps;

      for (var i = 0; i < commonCps.length; i++) {
        var lcp = commonCps[i];
        var lgi = otFont.charToGlyphIndex(String.fromCodePoint(lcp));
        if (lgi === 0) continue;
        var lGlyph = otFont.glyphs.get(lgi);
        for (var j = 0; j < otherCps.length; j++) {
          var rcp = otherCps[j];
          var rgi = otFont.charToGlyphIndex(String.fromCodePoint(rcp));
          if (rgi === 0) continue;
          var rGlyph = otFont.glyphs.get(rgi);
          var kv = otFont.getKerningValue(lGlyph, rGlyph);
          if (kv !== 0) {
            var k = lcp + ',' + rcp;
            if (!kernMap.has(k)) kernMap.set(k, kv);
          }
        }
      }
    }

    return kernMap;
  }

  /**
   * Derive class-based kerning from a pair map.
   * Matches fontconvert_sdcard.py derive_kern_classes().
   */
  function deriveKernClasses(kernMap, scale) {
    if (kernMap.size === 0) {
      return { leftClasses: [], rightClasses: [], matrix: [], leftCount: 0, rightCount: 0 };
    }

    var allLeft = new Set();
    var allRight = new Set();
    kernMap.forEach(function(v, k) {
      var parts = k.split(',');
      allLeft.add(parseInt(parts[0], 10));
      allRight.add(parseInt(parts[1], 10));
    });

    var sortedLeft = Array.from(allLeft).sort(function(a,b) { return a-b; });
    var sortedRight = Array.from(allRight).sort(function(a,b) { return a-b; });

    // Group left codepoints by identical adjustment profile
    var leftProfileMap = new Map();
    var leftClassMap = new Map();
    var leftClassId = 1;
    for (var i = 0; i < sortedLeft.length; i++) {
      var lcp = sortedLeft[i];
      var row = [];
      for (var j = 0; j < sortedRight.length; j++) {
        var k = lcp + ',' + sortedRight[j];
        var du = kernMap.get(k) || 0;
        row.push(fp4FromDesignUnits(du, scale));
      }
      var rowKey = row.join(',');
      if (!leftProfileMap.has(rowKey)) {
        leftProfileMap.set(rowKey, leftClassId++);
      }
      leftClassMap.set(lcp, leftProfileMap.get(rowKey));
    }

    // Group right codepoints by identical adjustment profile
    var rightProfileMap = new Map();
    var rightClassMap = new Map();
    var rightClassId = 1;
    for (var j = 0; j < sortedRight.length; j++) {
      var rcp = sortedRight[j];
      var col = [];
      for (var i = 0; i < sortedLeft.length; i++) {
        var k = sortedLeft[i] + ',' + rcp;
        var du = kernMap.get(k) || 0;
        col.push(fp4FromDesignUnits(du, scale));
      }
      var colKey = col.join(',');
      if (!rightProfileMap.has(colKey)) {
        rightProfileMap.set(colKey, rightClassId++);
      }
      rightClassMap.set(rcp, rightProfileMap.get(colKey));
    }

    var leftCount = leftClassId - 1;
    var rightCount = rightClassId - 1;

    if (leftCount > 255 || rightCount > 255) {
      return { leftClasses: [], rightClasses: [], matrix: [], leftCount: 0, rightCount: 0 };
    }

    // Build matrix
    var matrix = new Int8Array(leftCount * rightCount);
    kernMap.forEach(function(du, k) {
      var parts = k.split(',');
      var lcp = parseInt(parts[0], 10);
      var rcp = parseInt(parts[1], 10);
      var lc = leftClassMap.get(lcp);
      var rc = rightClassMap.get(rcp);
      if (lc !== undefined && rc !== undefined) {
        matrix[(lc - 1) * rightCount + (rc - 1)] = fp4FromDesignUnits(du, scale);
      }
    });

    // Build sorted class entry lists: [cp, classId]
    var leftClasses = [];
    leftClassMap.forEach(function(cls, cp) { leftClasses.push([cp, cls]); });
    leftClasses.sort(function(a,b) { return a[0] - b[0]; });

    var rightClasses = [];
    rightClassMap.forEach(function(cls, cp) { rightClasses.push([cp, cls]); });
    rightClasses.sort(function(a,b) { return a[0] - b[0]; });

    return {
      leftClasses: leftClasses,
      rightClasses: rightClasses,
      matrix: matrix,
      leftCount: leftCount,
      rightCount: rightCount,
    };
  }

  // ── Ligature extraction ────────────────────────────────────────────────

  /**
   * Extract ligature pairs from an opentype.js font.
   * Returns sorted array of [packedPair, ligatureCp].
   */
  function extractLigatures(otFont, codepoints) {
    var cpSet = new Set(codepoints);
    var pairs = [];

    // Build glyph index -> codepoint map
    var glyphToCp = new Map();
    var cpToGlyph = new Map();
    cpSet.forEach(function(cp) {
      var gi = otFont.charToGlyphIndex(String.fromCodePoint(cp));
      if (gi > 0) {
        glyphToCp.set(gi, cp);
        cpToGlyph.set(cp, gi);
      }
    });

    // Scan GSUB for ligature substitutions
    if (!otFont.tables || !otFont.tables.gsub) return pairs;

    var gsub = otFont.tables.gsub;
    if (!gsub.features || !gsub.lookups) return pairs;

    // Find liga/rlig feature lookup indices
    var ligaLookups = new Set();
    for (var i = 0; i < gsub.features.length; i++) {
      var feat = gsub.features[i];
      if (feat.tag === 'liga' || feat.tag === 'rlig') {
        var lookups = feat.feature.lookupListIndexes;
        for (var j = 0; j < lookups.length; j++) {
          ligaLookups.add(lookups[j]);
        }
      }
    }

    var rawLigatures = new Map(); // "cp1,cp2,..." -> ligCp

    ligaLookups.forEach(function(li) {
      var lookup = gsub.lookups[li];
      if (!lookup || !lookup.subtables) return;
      for (var si = 0; si < lookup.subtables.length; si++) {
        var st = lookup.subtables[si];
        if (!st.coverage || !st.ligatureSets) continue;
        var covGlyphs = getCoverageGlyphs(st.coverage);

        for (var ci = 0; ci < covGlyphs.length; ci++) {
          var firstGi = covGlyphs[ci];
          if (!glyphToCp.has(firstGi)) continue;
          var firstCp = glyphToCp.get(firstGi);
          var ligSet = st.ligatureSets[ci];
          if (!ligSet) continue;

          for (var li2 = 0; li2 < ligSet.length; li2++) {
            var lig = ligSet[li2];
            var components = lig.components;
            var ligGi = lig.ligGlyph;

            var seq = [firstCp];
            var valid = true;
            for (var ci2 = 0; ci2 < components.length; ci2++) {
              if (!glyphToCp.has(components[ci2])) { valid = false; break; }
              seq.push(glyphToCp.get(components[ci2]));
            }
            if (!valid) continue;

            var ligCp;
            if (glyphToCp.has(ligGi)) {
              ligCp = glyphToCp.get(ligGi);
            } else {
              var seqKey = seq.join(',');
              ligCp = STANDARD_LIGATURE_MAP[seqKey];
              if (ligCp === undefined) continue;
            }
            if (!cpSet.has(ligCp)) continue;
            rawLigatures.set(seq.join(','), ligCp);
          }
        }
      }
    });

    // Decompose into chained pairs (matching fontconvert_sdcard.py)
    var twoChar = new Map();
    rawLigatures.forEach(function(ligCp, seqStr) {
      var seq = seqStr.split(',').map(Number);
      if (seq.length === 2) {
        var packed = (seq[0] << 16) | seq[1];
        twoChar.set(packed, ligCp);
        pairs.push([packed, ligCp]);
      }
    });

    rawLigatures.forEach(function(ligCp, seqStr) {
      var seq = seqStr.split(',').map(Number);
      if (seq.length < 3) return;
      var prefixKey = seq.slice(0, -1).join(',');
      var lastCp = seq[seq.length - 1];
      if (rawLigatures.has(prefixKey)) {
        var intermediateCp = rawLigatures.get(prefixKey);
        var packed = (intermediateCp << 16) | lastCp;
        pairs.push([packed, ligCp]);
      }
    });

    // Sort by packed pair (binary search on device)
    pairs.sort(function(a, b) { return a[0] - b[0]; });

    // Truncate to 255 (uint8_t limit in TOC)
    if (pairs.length > 255) pairs = pairs.slice(0, 255);
    return pairs;
  }

  /** Get glyph indices from an opentype.js coverage object. */
  function getCoverageGlyphs(coverage) {
    if (!coverage) return [];
    if (coverage.glyphs) return coverage.glyphs;
    if (coverage.ranges) {
      var result = [];
      for (var i = 0; i < coverage.ranges.length; i++) {
        var r = coverage.ranges[i];
        for (var gi = r.start; gi <= r.end; gi++) result.push(gi);
      }
      return result;
    }
    return [];
  }

  // ── Binary packing ─────────────────────────────────────────────────────

  /** Pack one style's data into section ArrayBuffers. */
  function packStyleSections(rasterData, kernData, ligPairs) {
    // Intervals: 12 bytes each (uint32 first, uint32 last, uint32 offset)
    var intervals = rasterData.intervals;
    var intervalsData = new ArrayBuffer(intervals.length * 12);
    var ivView = new DataView(intervalsData);
    var glyphOffset = 0;
    for (var i = 0; i < intervals.length; i++) {
      ivView.setUint32(i * 12, intervals[i][0], true);
      ivView.setUint32(i * 12 + 4, intervals[i][1], true);
      ivView.setUint32(i * 12 + 8, glyphOffset, true);
      glyphOffset += intervals[i][1] - intervals[i][0] + 1;
    }

    // Glyphs: 16 bytes each
    var glyphs = rasterData.glyphs;
    var glyphsData = new ArrayBuffer(glyphs.length * 16);
    var gView = new DataView(glyphsData);
    for (var i = 0; i < glyphs.length; i++) {
      var g = glyphs[i];
      var off = i * 16;
      gView.setUint8(off, g.width);
      gView.setUint8(off + 1, g.height);
      gView.setUint16(off + 2, g.advanceX, true);
      gView.setInt16(off + 4, g.left, true);
      gView.setInt16(off + 6, g.top, true);
      gView.setUint16(off + 8, g.dataLength, true);
      // 2 bytes padding (off+10, off+11)
      gView.setUint8(off + 10, 0);
      gView.setUint8(off + 11, 0);
      gView.setUint32(off + 12, g.dataOffset, true);
    }

    // Kern left classes: 3 bytes each (uint16 cp, uint8 classId)
    var klData = new ArrayBuffer(kernData.leftClasses.length * 3);
    var klView = new DataView(klData);
    for (var i = 0; i < kernData.leftClasses.length; i++) {
      klView.setUint16(i * 3, kernData.leftClasses[i][0], true);
      klView.setUint8(i * 3 + 2, kernData.leftClasses[i][1]);
    }

    // Kern right classes: 3 bytes each
    var krData = new ArrayBuffer(kernData.rightClasses.length * 3);
    var krView = new DataView(krData);
    for (var i = 0; i < kernData.rightClasses.length; i++) {
      krView.setUint16(i * 3, kernData.rightClasses[i][0], true);
      krView.setUint8(i * 3 + 2, kernData.rightClasses[i][1]);
    }

    // Kern matrix: int8 array
    var kmData = new ArrayBuffer(kernData.matrix.length);
    var kmView = new Int8Array(kmData);
    for (var i = 0; i < kernData.matrix.length; i++) {
      kmView[i] = kernData.matrix[i];
    }

    // Ligature pairs: 8 bytes each (uint32 packedPair, uint32 ligCp)
    var ligData = new ArrayBuffer(ligPairs.length * 8);
    var ligView = new DataView(ligData);
    for (var i = 0; i < ligPairs.length; i++) {
      ligView.setUint32(i * 8, ligPairs[i][0], true);
      ligView.setUint32(i * 8 + 4, ligPairs[i][1], true);
    }

    // Bitmap data: concatenate all chunks
    var bitmapData = new Uint8Array(rasterData.totalBitmapSize);
    var bitmapPos = 0;
    for (var i = 0; i < rasterData.bitmapChunks.length; i++) {
      bitmapData.set(rasterData.bitmapChunks[i], bitmapPos);
      bitmapPos += rasterData.bitmapChunks[i].length;
    }

    return {
      intervals: new Uint8Array(intervalsData),
      glyphs: new Uint8Array(glyphsData),
      kernLeft: new Uint8Array(klData),
      kernRight: new Uint8Array(krData),
      kernMatrix: new Uint8Array(kmData),
      ligatures: new Uint8Array(ligData),
      bitmap: bitmapData,
    };
  }

  /** Compute total byte size of packed sections. */
  function sectionsSize(sections) {
    return sections.intervals.length + sections.glyphs.length +
           sections.kernLeft.length + sections.kernRight.length +
           sections.kernMatrix.length + sections.ligatures.length +
           sections.bitmap.length;
  }

  /**
   * Build a complete .cpfont v4 file from packed style data.
   * styleDataArray: [{rasterData, kernData, ligPairs, styleId}, ...]
   * Returns Uint8Array of the complete file.
   */
  function buildCpfontFile(styleDataArray) {
    var styleCount = styleDataArray.length;

    // Pack all style sections
    var allSections = [];
    for (var i = 0; i < styleCount; i++) {
      var sd = styleDataArray[i];
      allSections.push(packStyleSections(sd.rasterData, sd.kernData, sd.ligPairs));
    }

    // Calculate data offsets
    var dataStart = HEADER_SIZE + styleCount * STYLE_TOC_SIZE;
    var currentOffset = dataStart;
    var styleOffsets = [];
    for (var i = 0; i < styleCount; i++) {
      styleOffsets.push(currentOffset);
      currentOffset += sectionsSize(allSections[i]);
    }
    var totalSize = currentOffset;

    // Allocate output buffer
    var buf = new ArrayBuffer(totalSize);
    var view = new DataView(buf);
    var out = new Uint8Array(buf);

    // Write global header (32 bytes)
    for (var i = 0; i < 8; i++) view.setUint8(i, MAGIC[i]);
    view.setUint16(8, VERSION, true);
    view.setUint16(10, 1, true); // flags: 2-bit greyscale
    view.setUint8(12, styleCount);
    // bytes 13-31: reserved (zeros)

    // Write style TOC (32 bytes per style)
    // Format: styleId(1) + pad(3) + intervalCount(4) + glyphCount(4) +
    //         advanceY(1) + ascender(2) + descender(2) + kernL(2) + kernR(2) +
    //         kernLCls(1) + kernRCls(1) + ligCount(1) + dataOffset(4) + reserved(4) = 32
    for (var i = 0; i < styleCount; i++) {
      var sd = styleDataArray[i];
      var rd = sd.rasterData;
      var kd = sd.kernData;
      var tocOff = HEADER_SIZE + i * STYLE_TOC_SIZE;

      view.setUint8(tocOff, sd.styleId);
      // 3 bytes padding
      view.setUint32(tocOff + 4, rd.intervals.length, true);
      view.setUint32(tocOff + 8, rd.glyphs.length, true);
      view.setUint8(tocOff + 12, rd.advanceY);
      view.setInt16(tocOff + 13, rd.ascender, true);
      view.setInt16(tocOff + 15, rd.descender, true);
      view.setUint16(tocOff + 17, kd.leftClasses.length, true);
      view.setUint16(tocOff + 19, kd.rightClasses.length, true);
      view.setUint8(tocOff + 21, kd.leftCount);
      view.setUint8(tocOff + 22, kd.rightCount);
      view.setUint8(tocOff + 23, sd.ligPairs.length);
      view.setUint32(tocOff + 24, styleOffsets[i], true);
      // 4 bytes reserved (zeros)
    }

    // Write per-style data sections
    for (var i = 0; i < styleCount; i++) {
      var sec = allSections[i];
      var pos = styleOffsets[i];
      var parts = [sec.intervals, sec.glyphs, sec.kernLeft, sec.kernRight,
                   sec.kernMatrix, sec.ligatures, sec.bitmap];
      for (var p = 0; p < parts.length; p++) {
        out.set(parts[p], pos);
        pos += parts[p].length;
      }
    }

    return out;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  function sanitizeFamilyName(raw) {
    var t = (raw || '').trim();
    if (!t) t = 'CustomFont';
    t = t.replace(/[^a-zA-Z0-9 _\-]/g, '_').replace(/\s+/g, '_');
    if (t.length > 48) t = t.slice(0, 48);
    if (t.startsWith('.')) t = '_' + t;
    return t;
  }

  /**
   * Build all .cpfont files for a font family.
   *
   * opts.regular:    File (required)
   * opts.bold:       File | null
   * opts.italic:     File | null
   * opts.boldItalic: File | null
   * opts.intervals:  string preset name (default: "builtin")
   * opts.sizes:      number[] (default: [12, 14, 16, 18])
   * opts.onLog:      function(msg, level)
   * opts.onProgress: function(current, total, sizePt, styleName)
   *
   * Returns Promise<Array<{filename, blob, sizePt}>>
   */
  async function buildAllCpfonts(opts) {
    if (!opts.regular) throw new Error('Regular font file is required');

    var intervalPreset = opts.intervals || 'builtin';
    var intervals = INTERVAL_PRESETS[intervalPreset];
    if (!intervals) throw new Error('Unknown interval preset: ' + intervalPreset);

    var sizes = opts.sizes || SIZES;
    var log = opts.onLog || function() {};
    var progress = opts.onProgress || function() {};

    // Load font files with opentype.js
    var styleFiles = { regular: opts.regular };
    if (opts.bold) styleFiles.bold = opts.bold;
    if (opts.italic) styleFiles.italic = opts.italic;
    if (opts.boldItalic) styleFiles.bolditalic = opts.boldItalic;

    var styleNames = Object.keys(styleFiles);
    var fonts = {};
    for (var si = 0; si < styleNames.length; si++) {
      var sname = styleNames[si];
      log('Loading ' + sname + '...', 'info');
      var arrayBuf = await styleFiles[sname].arrayBuffer();
      fonts[sname] = opentype.parse(arrayBuf);
      if (!fonts[sname]) throw new Error('Failed to parse ' + sname + ' font');
    }

    var familyName = sanitizeFamilyName(
      opts.familyName || fonts.regular.names.fontFamily.en || 'CustomFont'
    );

    var totalSteps = sizes.length * styleNames.length;
    var currentStep = 0;
    var results = [];

    for (var szi = 0; szi < sizes.length; szi++) {
      var sizePt = sizes[szi];
      log('Building ' + familyName + '_' + sizePt + '.cpfont...', 'info');

      var styleDataArray = [];

      for (var sti = 0; sti < styleNames.length; sti++) {
        var sname = styleNames[sti];
        var styleId = STYLE_IDS[sname];
        var otFont = fonts[sname];
        currentStep++;
        progress(currentStep, totalSteps, sizePt, sname);

        log('  Rasterizing ' + sname + ' at ' + sizePt + 'pt...', 'info');
        var rasterData = rasterizeStyle(otFont, sizePt, intervals);
        log('  ' + rasterData.glyphs.length + ' glyphs, ' +
            rasterData.intervals.length + ' intervals, ' +
            Math.round(rasterData.totalBitmapSize / 1024) + ' KB bitmap', 'info');

        // Collect all codepoints for kerning/ligature extraction
        var allCps = rasterData.glyphs.map(function(g) { return g.cp; });
        var ppem = sizePt * RASTER_DPI / 72;
        var scale = ppem / otFont.unitsPerEm;

        log('  Extracting kerning...', 'info');
        var rawKern = extractKerning(otFont, allCps);
        var kernData = deriveKernClasses(rawKern, scale);
        log('  ' + rawKern.size + ' pairs -> ' + kernData.leftCount +
            ' left classes, ' + kernData.rightCount + ' right classes', 'info');

        log('  Extracting ligatures...', 'info');
        var ligPairs = extractLigatures(otFont, allCps);
        log('  ' + ligPairs.length + ' ligature pairs', 'info');

        styleDataArray.push({
          rasterData: rasterData,
          kernData: kernData,
          ligPairs: ligPairs,
          styleId: styleId,
        });

        // Yield to UI
        await new Promise(function(r) { setTimeout(r, 0); });
      }

      var cpfontBytes = buildCpfontFile(styleDataArray);
      var filename = familyName + '_' + sizePt + '.cpfont';
      log(filename + ': ' + Math.round(cpfontBytes.length / 1024) + ' KB (' +
          styleDataArray.length + ' styles)', 'success');

      results.push({
        filename: filename,
        blob: new Blob([cpfontBytes], { type: 'application/octet-stream' }),
        sizePt: sizePt,
        byteLength: cpfontBytes.length,
      });
    }

    return results;
  }

  // ── Export ──────────────────────────────────────────────────────────────

  global.CpFontBuilder = {
    buildAllCpfonts: buildAllCpfonts,
    sanitizeFamilyName: sanitizeFamilyName,
    INTERVAL_PRESETS: INTERVAL_PRESETS,
    SIZES: SIZES,
    VERSION: VERSION,
  };

})(typeof window !== 'undefined' ? window : this);
