/* CrossPoint Theme Builder
 *
 * A client-side, browser-based builder for CrossPoint SD-card themes
 * (schema version 1, inherits "lyra"). It edits a theme model, renders a
 * faithful 480x800 device mockup on a canvas using the same layout math as
 * the firmware's LyraTheme, and exports a firmware-compatible theme.json /
 * theme package zip.
 *
 * This is Phase 1 (static builder + visual preview). Icon BMP generation and
 * device upload are intentionally out of scope here.
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Base metrics — values inherited from the firmware "lyra" theme
  // (src/components/themes/lyra/LyraTheme.h :: LyraMetrics). The builder only
  // exports metrics that differ from these, matching firmware expectations.
  // ---------------------------------------------------------------------------
  const LYRA_METRICS = {
    batteryWidth: 16, batteryHeight: 12,
    topPadding: 5, batteryBarHeight: 40, headerHeight: 84, verticalSpacing: 16,
    contentSidePadding: 20, listRowHeight: 40, listWithSubtitleRowHeight: 60,
    menuRowHeight: 64, menuSpacing: 8, tabSpacing: 8, tabBarHeight: 40,
    scrollBarWidth: 4, scrollBarRightOffset: 5,
    homeTopPadding: 56, homeCoverHeight: 226, homeCoverTileHeight: 242,
    homeRecentBooksCount: 1, homeContinueReadingInMenu: false,
    homeShowContinueReadingHeader: true, homeMenuTopOffset: 16,
    buttonHintsHeight: 40, sideButtonHintsWidth: 30,
    progressBarHeight: 16, progressBarMarginTop: 1,
    statusBarHorizontalMargin: 5, statusBarVerticalMargin: 19,
    keyboardKeyWidth: 31, keyboardKeyHeight: 40, keyboardKeySpacing: 0,
    keyboardBottomKeyHeight: 35, keyboardBottomKeySpacing: 5,
    keyboardBottomAligned: true, keyboardCenteredText: false,
    keyboardVerticalOffset: -7, keyboardTextFieldWidthPercent: 85,
    keyboardWidthPercent: 90, keyboardKeyCornerRadius: 6,
    keyboardFillUnselected: false, keyboardOutlineAllUnselected: false,
    keyboardDrawSpecialOutlineWhenUnselected: true,
    keyboardSecondaryLabelRightPadding: 1, keyboardSecondaryLabelTopPadding: 0,
    keyboardMinArrowHeadSize: 0,
    popupTopOffsetRatio: 0.165, popupMarginX: 16, popupMarginY: 12,
    popupFrameThickness: 2, popupCornerRadius: 6, popupTextBold: false,
    popupTextInverted: false, popupTextBaselineOffsetY: -2,
    popupProgressBarHeight: 4, popupProgressDrawOutline: false,
    popupProgressClampPercent: false, popupProgressFillInverted: false,
    popupProgressOutlineInverted: false,
    textFieldHorizontalPadding: 6, textFieldNormalThickness: 1,
    textFieldCursorThickness: 3, textFieldLineEndOffset: 0,
  };

  // Component defaults (firmware BaseTheme.h struct defaults, tuned to Lyra's
  // shipped SD themes). Used as the editable starting point.
  const DEFAULT_HOME_MENU = {
    font: 'ui12', style: 'regular', centeredText: false, centerVertically: false,
    showIcons: true, panelWidth: 0, drawPanel: false, panelCornerRadius: 3,
    selectionStyle: 'fill', selectionCornerRadius: 6, selectionInset: 20,
    selectedTextInverted: false, selectionFillBlack: false, rowPaddingX: 16, textInsetX: 16,
  };
  const DEFAULT_LIST = {
    font: 'ui10', style: 'regular', showIcons: true, iconSize: 0, textGap: 8,
    selectionStyle: 'fill', selectionCornerRadius: 6, selectionFill: true, selectionOutline: false,
    selectedTextInverted: false, rowBackgrounds: false, centerSingleLineRows: false,
    rowSidePadding: 0, textInsetX: 8, selectionInsetX: 0, selectionInsetY: 0,
    titleOffsetY: 7, subtitleOffsetY: 30, valueOffsetY: 6,
    subtitleValueOffsetY: 16, iconOffsetY: 0,
  };
  const DEFAULT_BUTTON_HINTS = {
    font: 'small', style: 'regular',
    // layout: 'buttons' (fixed per-key tabs) | 'shapes' (icons) | 'groups'
    // (two rounded pill groups, e.g. RoundedRaff). Mirrors the firmware's
    // ThemeButtonHintsStyle. `shapes:true` is the legacy form of 'shapes'.
    layout: 'buttons',
    buttonWidth: 80, smallButtonHeight: 15, cornerRadius: 6,
    fill: true, outline: true, drawEmpty: true, shapes: false, shapeSize: 18,
    sidePadding: 20, groupGap: 10, bottomMargin: 10, innerPadding: 16,
    textOffsetY: 7,
  };

  const DEVICE_CONSTRAINTS = {
    x3: { screenWidth: 480, screenHeight: 800, frontButtons: 4, sideButtons: 'up-down' },
    x4: { screenWidth: 480, screenHeight: 800, frontButtons: 0, sideButtons: 'up-down' },
  };

  // Font id -> px metrics, taken from the firmware's generated font descriptors
  // (advanceY = line height) at the device's native resolution, which is also
  // our canvas resolution. SMALL = NotoSans 8 (advanceY 23, ascender 18);
  // UI_10 = Ubuntu 10 (advanceY 24, ascender 20); UI_12 = Ubuntu 12 (advanceY
  // 29, ascender 24). `size` is the canvas px (≈ ascender); `lh` is advanceY.
  const FONTS = {
    small: { size: 17, lh: 23 },
    ui10: { size: 19, lh: 24 },
    ui12: { size: 23, lh: 29 },
  };
  function fontInfo(id) { return FONTS[id] || FONTS.ui10; }

  // ---------------------------------------------------------------------------
  // Built-in presets (mirror the shipped SD themes)
  // ---------------------------------------------------------------------------
  const PRESETS = {
    lyra: {
      name: 'Lyra (default)',
      build: () => ({
        meta: { id: 'my-theme', name: 'My Theme', description: '' },
        metrics: {},
        components: {
          homeRecents: { type: 'default' },
          homeMenu: clone(DEFAULT_HOME_MENU),
          list: clone(DEFAULT_LIST),
          buttonHints: clone(DEFAULT_BUTTON_HINTS),
        },
      }),
    },
    'lyra-3-covers': {
      name: 'Lyra 3 Covers',
      build: () => ({
        meta: { id: 'lyra-3-covers', name: 'Lyra 3 Covers', description: 'Lyra home layout with three recent cover slots.' },
        metrics: { homeCoverTileHeight: 300, homeRecentBooksCount: 3 },
        components: {
          homeRecents: {
            type: 'cover-strip', maxBooks: 3, wrap: false,
            selectionLineWidth: 2, selectionCornerRadius: 6,
            slots: [0, 1, 2].map((i) => ({
              book: 'index', bookIndex: i,
              x: ['padding', 'center', 'right-padding'][i], y: 'top',
              height: 226, widthPercent: 62, selected: true,
              title: { enabled: true, font: 'ui10', style: 'regular', maxLines: 3, offsetY: 12 },
            })),
          },
          homeMenu: clone(DEFAULT_HOME_MENU),
          list: clone(DEFAULT_LIST),
          buttonHints: clone(DEFAULT_BUTTON_HINTS),
        },
      }),
    },
    carousel: {
      name: 'Carousel',
      build: () => ({
        meta: { id: 'carousel', name: 'Carousel', description: 'CrossInk-style carousel layout packaged as an SD theme.' },
        metrics: { homeCoverHeight: 300, homeCoverTileHeight: 340, homeRecentBooksCount: 3 },
        components: {
          homeRecents: {
            type: 'cover-strip', maxBooks: 3, wrap: true,
            selectionLineWidth: 3, selectionCornerRadius: 6,
            slots: [
              { book: 'previous', x: 'padding', y: 'center', height: 225, widthPercent: 62 },
              { book: 'selected', x: 'center', y: 'top', height: 300, widthPercent: 62, yOffset: 8, selected: true,
                title: { enabled: true, font: 'ui12', style: 'bold', maxLines: 2, offsetY: 12 } },
              { book: 'next', x: 'right-padding', y: 'center', height: 225, widthPercent: 62 },
            ],
          },
          homeMenu: clone(DEFAULT_HOME_MENU),
          list: clone(DEFAULT_LIST),
          buttonHints: clone(DEFAULT_BUTTON_HINTS),
        },
      }),
    },
    roundedraff: {
      name: 'RoundedRaff',
      build: () => ({
        meta: { id: 'roundedraff', name: 'RoundedRaff', description: 'RoundedRaff layout packaged as an SD theme.' },
        metrics: {
          topPadding: 0, headerHeight: 45, listRowHeight: 42, listWithSubtitleRowHeight: 69,
          menuRowHeight: 42, menuSpacing: 6, homeTopPadding: 55, homeCoverHeight: 300,
          homeCoverTileHeight: 350, homeRecentBooksCount: 1, homeContinueReadingInMenu: true,
          homeMenuTopOffset: 20,
        },
        components: {
          homeRecents: {
            type: 'cover-strip', maxBooks: 1, wrap: false, selectionLineWidth: 2, selectionCornerRadius: 10,
            slots: [{ book: 'selected', x: 'center', y: 'top', height: 300, widthPercent: 62, yOffset: 8, selected: true,
              title: { enabled: true, font: 'ui12', style: 'bold', maxLines: 2, offsetY: 12 } }],
          },
          homeMenu: Object.assign(clone(DEFAULT_HOME_MENU), { selectionCornerRadius: 10 }),
          list: Object.assign(clone(DEFAULT_LIST), { selectionCornerRadius: 10, selectionInsetY: 2, titleOffsetY: 8, subtitleOffsetY: 31, valueOffsetY: 8, subtitleValueOffsetY: 17 }),
          buttonHints: Object.assign(clone(DEFAULT_BUTTON_HINTS), { cornerRadius: 10 }),
        },
      }),
    },
    'super-minimal': {
      name: 'Super Minimal',
      build: () => ({
        meta: { id: 'super-minimal', name: 'Super Minimal', description: 'Centered text-only home menu with no cover area.' },
        metrics: {
          headerHeight: 64, homeTopPadding: 64, homeCoverHeight: 0, homeCoverTileHeight: 0,
          homeRecentBooksCount: 1, homeContinueReadingInMenu: true, homeShowContinueReadingHeader: true,
          homeMenuTopOffset: 0, menuRowHeight: 42, menuSpacing: 6,
        },
        components: {
          homeRecents: { type: 'none' },
          homeMenu: Object.assign(clone(DEFAULT_HOME_MENU), {
            font: 'ui10', centeredText: true, centerVertically: true, showIcons: false,
            panelWidth: 360, selectionStyle: 'underline', selectionInset: 18,
          }),
          list: clone(DEFAULT_LIST),
          buttonHints: Object.assign(clone(DEFAULT_BUTTON_HINTS), { fill: false, outline: false, drawEmpty: false, shapes: true }),
        },
      }),
    },
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------------------------------------------------------------------------
  // App state
  // ---------------------------------------------------------------------------
  const state = {
    device: 'x3',           // active preview device
    surface: 'home',        // home | settings | files | hints
    selectedIndex: 0,       // simulated selection for the active surface
    writeAllMetrics: false, // export every metric vs only diffs
    hasOpds: false,         // home menu shows OPDS item
    theme: null,            // { meta, metrics, components, extensions?, _extra? }
    customIcons: {},        // icon key -> File (custom SVG/PNG upload)
    iconBuild: null,        // { status, outputs, log, error } from the CI build
  };

  // Icon keys the firmware understands (theme.json assets.icons). "settings"
  // maps to the firmware's settings2.bmp; everything else is key.bmp.
  const ICON_KEYS = ['book', 'book24', 'bookmark', 'cover', 'file24', 'folder', 'folder24', 'hotspot', 'image24', 'library', 'recent', 'settings', 'text24', 'transfer', 'wifi'];
  function bmpNameForKey(key) { return (key === 'settings' ? 'settings2' : key) + '.bmp'; }

  // Effective metric = override if present else Lyra base.
  function metric(key) {
    const m = state.theme.metrics;
    return (m && key in m) ? m[key] : LYRA_METRICS[key];
  }

  // ---------------------------------------------------------------------------
  // Canvas renderer — a small GfxRenderer-like surface in 480x800 device space.
  // Monochrome e-ink look: black on white, "LightGray" for selection fills.
  // ---------------------------------------------------------------------------
  const GRAY = '#c3c2bd';
  function Renderer(ctx) {
    this.ctx = ctx;
    this._measure = document.createElement('canvas').getContext('2d');
  }
  Renderer.prototype._font = function (id, style) {
    const f = fontInfo(id);
    const weight = style === 'bold' ? '700' : '400';
    return `${weight} ${f.size}px Inter, system-ui, sans-serif`;
  };
  Renderer.prototype.getLineHeight = function (id) { return fontInfo(id).lh; };
  Renderer.prototype.getTextWidth = function (id, text, style) {
    this._measure.font = this._font(id, style);
    return this._measure.measureText(text || '').width;
  };
  Renderer.prototype.truncatedText = function (id, text, maxWidth, style) {
    text = text || '';
    if (this.getTextWidth(id, text, style) <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && this.getTextWidth(id, t + '…', style) > maxWidth) t = t.slice(0, -1);
    return t + '…';
  };
  Renderer.prototype.wrappedText = function (id, text, maxWidth, maxLines, style) {
    const words = (text || '').split(/\s+/);
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (this.getTextWidth(id, test, style) > maxWidth && line) {
        lines.push(line);
        line = w;
        if (lines.length === maxLines - 1) break;
      } else {
        line = test;
      }
    }
    if (line && lines.length < maxLines) lines.push(line);
    if (lines.length === maxLines) {
      // last line may need truncation
      lines[maxLines - 1] = this.truncatedText(id, lines[maxLines - 1], maxWidth, style);
    }
    return lines.slice(0, maxLines);
  };
  Renderer.prototype.drawText = function (id, x, y, text, black, style) {
    const f = fontInfo(id);
    this.ctx.font = this._font(id, style);
    this.ctx.fillStyle = black === false ? '#fff' : '#111';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(text || '', x, y + (f.lh - f.size) / 2 - 1);
  };
  Renderer.prototype.fillRect = function (x, y, w, h, black) {
    this.ctx.fillStyle = black === false ? '#fff' : '#111';
    this.ctx.fillRect(x, y, w, h);
  };
  Renderer.prototype.fillRectGray = function (x, y, w, h) {
    this.ctx.fillStyle = GRAY;
    this.ctx.fillRect(x, y, w, h);
  };
  Renderer.prototype.drawRect = function (x, y, w, h, black) {
    this.ctx.strokeStyle = black === false ? '#fff' : '#111';
    this.ctx.lineWidth = 1;
    this.ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, w - 1, h - 1);
  };
  Renderer.prototype._roundPath = function (x, y, w, h, r) {
    const c = this.ctx;
    r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  };
  Renderer.prototype.fillRoundedRect = function (x, y, w, h, r, color) {
    this._roundPath(x, y, w, h, r);
    this.ctx.fillStyle = color === 'gray' ? GRAY : (color === 'white' ? '#fff' : '#111');
    this.ctx.fill();
  };
  Renderer.prototype.drawRoundedRect = function (x, y, w, h, lw, r, black) {
    this._roundPath(x + 0.5, y + 0.5, w - 1, h - 1, r);
    this.ctx.strokeStyle = black === false ? '#fff' : '#111';
    this.ctx.lineWidth = lw || 1;
    this.ctx.stroke();
  };
  // Path with only the chosen corners rounded (others square). Corners object:
  // {tl, tr, br, bl} booleans. Used for button-hint tabs (top rounded, bottom
  // square + flush to the screen edge, matching the firmware).
  Renderer.prototype._roundPathCorners = function (x, y, w, h, r, c) {
    const ctx = this.ctx;
    r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    const tl = c.tl ? r : 0, tr = c.tr ? r : 0, br = c.br ? r : 0, bl = c.bl ? r : 0;
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);
    if (tr) ctx.arcTo(x + w, y, x + w, y + tr, tr);
    ctx.lineTo(x + w, y + h - br);
    if (br) ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
    ctx.lineTo(x + bl, y + h);
    if (bl) ctx.arcTo(x, y + h, x, y + h - bl, bl);
    ctx.lineTo(x, y + tl);
    if (tl) ctx.arcTo(x, y, x + tl, y, tl);
    ctx.closePath();
  };
  Renderer.prototype.fillRoundedRectCorners = function (x, y, w, h, r, c, color) {
    this._roundPathCorners(x, y, w, h, r, c);
    this.ctx.fillStyle = color === 'gray' ? GRAY : (color === 'white' ? '#fff' : '#111');
    this.ctx.fill();
  };
  Renderer.prototype.drawRoundedRectCorners = function (x, y, w, h, lw, r, c, black) {
    this._roundPathCorners(x + 0.5, y + 0.5, w - 1, h - 1, r, c);
    this.ctx.strokeStyle = black === false ? '#fff' : '#111';
    this.ctx.lineWidth = lw || 1;
    this.ctx.stroke();
  };
  Renderer.prototype.drawLine = function (x1, y1, x2, y2, lw, black) {
    this.ctx.strokeStyle = black === false ? '#fff' : '#111';
    this.ctx.lineWidth = lw || 1;
    this.ctx.beginPath();
    this.ctx.moveTo(x1, y1 + 0.5);
    this.ctx.lineTo(x2, y2 + 0.5);
    this.ctx.stroke();
  };
  Renderer.prototype.fillPolygon = function (xs, ys, n, black) {
    const c = this.ctx;
    c.beginPath();
    c.moveTo(xs[0], ys[0]);
    for (let i = 1; i < n; i++) c.lineTo(xs[i], ys[i]);
    c.closePath();
    c.fillStyle = black === false ? '#fff' : '#111';
    c.fill();
  };

  // Simple monochrome icon glyphs (vector approximations of the SD icons).
  function drawIconGlyph(ctx, name, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#111';
    ctx.fillStyle = '#111';
    ctx.lineWidth = Math.max(1.5, size / 14);
    ctx.lineJoin = 'round';
    const s = size;
    const p = s * 0.16; // padding
    const w = s - 2 * p, h = s - 2 * p;
    function rr(rx, ry, rw, rh, rad) {
      ctx.beginPath();
      rad = Math.min(rad, rw / 2, rh / 2);
      ctx.moveTo(rx + rad, ry);
      ctx.arcTo(rx + rw, ry, rx + rw, ry + rh, rad);
      ctx.arcTo(rx + rw, ry + rh, rx, ry + rh, rad);
      ctx.arcTo(rx, ry + rh, rx, ry, rad);
      ctx.arcTo(rx, ry, rx + rw, ry, rad);
      ctx.closePath();
    }
    switch (name) {
      case 'folder':
      case 'folder24':
        ctx.beginPath();
        ctx.moveTo(p, p + h * 0.18);
        ctx.lineTo(p + w * 0.42, p + h * 0.18);
        ctx.lineTo(p + w * 0.52, p + h * 0.32);
        ctx.lineTo(p + w, p + h * 0.32);
        ctx.lineTo(p + w, p + h);
        ctx.lineTo(p, p + h);
        ctx.closePath();
        ctx.stroke();
        break;
      case 'book':
      case 'book24':
      case 'cover':
        rr(p + w * 0.18, p, w * 0.64, h, s * 0.06);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p + w * 0.18, p + h * 0.12);
        ctx.lineTo(p + w * 0.82, p + h * 0.12);
        ctx.stroke();
        break;
      case 'recent':
        ctx.beginPath();
        ctx.arc(s / 2, s / 2, w / 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(s / 2, s / 2);
        ctx.lineTo(s / 2, p + h * 0.28);
        ctx.moveTo(s / 2, s / 2);
        ctx.lineTo(p + w * 0.72, s / 2 + h * 0.1);
        ctx.stroke();
        break;
      case 'settings': {
        ctx.beginPath();
        ctx.arc(s / 2, s / 2, w * 0.22, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s / 2, s / 2, w * 0.44, 0, Math.PI * 2);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.moveTo(s / 2 + Math.cos(a) * w * 0.44, s / 2 + Math.sin(a) * w * 0.44);
          ctx.lineTo(s / 2 + Math.cos(a) * w * 0.5, s / 2 + Math.sin(a) * w * 0.5);
        }
        ctx.stroke();
        break;
      }
      case 'transfer':
        ctx.beginPath();
        ctx.moveTo(p, p + h * 0.35); ctx.lineTo(p + w, p + h * 0.35);
        ctx.moveTo(p + w - h * 0.25, p + h * 0.1); ctx.lineTo(p + w, p + h * 0.35); ctx.lineTo(p + w - h * 0.25, p + h * 0.6);
        ctx.moveTo(p + w, p + h * 0.75); ctx.lineTo(p, p + h * 0.75);
        ctx.moveTo(p + h * 0.25, p + h * 0.5); ctx.lineTo(p, p + h * 0.75); ctx.lineTo(p + h * 0.25, p + h);
        ctx.stroke();
        break;
      case 'library':
        for (let i = 0; i < 3; i++) {
          rr(p + i * (w / 3), p + (i === 1 ? h * 0.08 : 0), w / 3 - s * 0.04, h - (i === 1 ? h * 0.08 : 0), s * 0.03);
          ctx.stroke();
        }
        break;
      case 'wifi':
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.arc(s / 2, p + h * 0.85, (w / 2) * (i / 3), Math.PI * 1.15, Math.PI * 1.85);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(s / 2, p + h * 0.85, 1.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'text':
      case 'text24':
        ctx.beginPath();
        ctx.moveTo(p, p + h * 0.2); ctx.lineTo(p + w, p + h * 0.2);
        ctx.moveTo(p, p + h * 0.45); ctx.lineTo(p + w, p + h * 0.45);
        ctx.moveTo(p, p + h * 0.7); ctx.lineTo(p + w * 0.6, p + h * 0.7);
        ctx.stroke();
        break;
      case 'image':
      case 'image24':
        rr(p, p, w, h, s * 0.06); ctx.stroke();
        ctx.beginPath();
        ctx.arc(p + w * 0.3, p + h * 0.32, w * 0.1, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p, p + h); ctx.lineTo(p + w * 0.4, p + h * 0.55); ctx.lineTo(p + w * 0.65, p + h * 0.78);
        ctx.lineTo(p + w * 0.8, p + h * 0.62); ctx.lineTo(p + w, p + h);
        ctx.stroke();
        break;
      case 'file':
      case 'file24':
        ctx.beginPath();
        ctx.moveTo(p, p); ctx.lineTo(p + w * 0.65, p); ctx.lineTo(p + w, p + h * 0.3);
        ctx.lineTo(p + w, p + h); ctx.lineTo(p, p + h); ctx.closePath();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p + w * 0.65, p); ctx.lineTo(p + w * 0.65, p + h * 0.3); ctx.lineTo(p + w, p + h * 0.3);
        ctx.stroke();
        break;
      default:
        rr(p, p, w, h, s * 0.08); ctx.stroke();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Real icon assets. We render the actual firmware 1-bit BMP icons (proxied at
  // /themes/<id>/icons/*.bmp) rather than vector approximations. They are
  // stored upright, so we draw them as-is. Vector glyphs remain a fallback
  // while images load (or if the proxy is unavailable).
  // ---------------------------------------------------------------------------
  const ICON_BMP_BASE = '/themes/lyra-3-covers/icons/';
  const iconImages = {};   // bmp filename -> {img, loaded}
  function iconBmpFile(name) { return name === 'settings' ? 'settings2.bmp' : name + '.bmp'; }
  // Resolve a UIIcon name + target size to the best available BMP stem.
  function resolveIconBmp(uiName, size) {
    const small = size <= 26;
    switch (uiName) {
      case 'folder': return small ? 'folder24' : 'folder';
      case 'book': return small ? 'book24' : 'book';
      case 'text': return 'text24';
      case 'image': return 'image24';
      case 'file': return 'file24';
      case 'settings': return 'settings'; // -> settings2.bmp
      default: return uiName;             // recent, transfer, library, wifi, cover, bookmark, hotspot
    }
  }
  function preloadIcons() {
    const names = ['book', 'book24', 'bookmark', 'cover', 'file24', 'folder', 'folder24', 'hotspot', 'image24', 'library', 'recent', 'settings', 'text24', 'transfer', 'wifi'];
    for (const n of names) {
      const file = iconBmpFile(n);
      if (iconImages[file]) continue;
      const img = new Image();
      const entry = { loaded: false };
      iconImages[file] = entry;
      img.onload = () => {
        // The BMPs have an opaque white background. Turn white transparent so
        // icons composite onto selection fills, and prebuild a white-ink copy
        // for inverted (black-fill) rows. Same-origin, so no canvas taint.
        const oc = document.createElement('canvas'); oc.width = img.naturalWidth; oc.height = img.naturalHeight;
        const octx = oc.getContext('2d'); octx.drawImage(img, 0, 0);
        const id = octx.getImageData(0, 0, oc.width, oc.height); const d = id.data;
        for (let p = 0; p < d.length; p += 4) {
          if ((d[p] + d[p + 1] + d[p + 2]) / 3 > 160) { d[p + 3] = 0; }
          else { d[p] = d[p + 1] = d[p + 2] = 0; }
        }
        octx.putImageData(id, 0, 0);
        entry.canvas = oc;
        const wc = document.createElement('canvas'); wc.width = oc.width; wc.height = oc.height;
        const wctx = wc.getContext('2d'); wctx.drawImage(oc, 0, 0);
        wctx.globalCompositeOperation = 'source-in'; wctx.fillStyle = '#fff'; wctx.fillRect(0, 0, wc.width, wc.height);
        entry.white = wc;
        entry.loaded = true; scheduleRender();
      };
      img.onerror = () => { entry.error = true; };
      img.src = ICON_BMP_BASE + file;
    }
  }
  // Draw a real icon BMP upright; fall back to a vector glyph until it loads.
  // `invert` draws the white-ink copy (for selected black-fill rows).
  function drawIcon(ctx, uiName, x, y, size, invert) {
    const file = iconBmpFile(resolveIconBmp(uiName, size));
    const entry = iconImages[file];
    if (entry && entry.loaded) {
      const prev = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(invert ? entry.white : entry.canvas, x, y, size, size);
      ctx.imageSmoothingEnabled = prev;
    } else {
      drawIconGlyph(ctx, uiName, x, y, size);
    }
  }
  let renderScheduled = false;
  function scheduleRender() {
    if (renderScheduled) return;
    renderScheduled = true;
    requestAnimationFrame(() => { renderScheduled = false; render(); });
  }

  // ---------------------------------------------------------------------------
  // Sample data for the preview surfaces
  // ---------------------------------------------------------------------------
  const SAMPLE_BOOKS = [
    { title: 'The Way of Kings', author: 'Brandon Sanderson' },
    { title: 'Dune', author: 'Frank Herbert' },
    { title: 'The Name of the Wind', author: 'Patrick Rothfuss' },
    { title: 'Project Hail Mary', author: 'Andy Weir' },
    { title: 'A Memory of Light', author: 'Robert Jordan' },
  ];
  const SETTINGS_ROWS = [
    { title: 'Theme', value: 'Lyra', icon: 'settings' },
    { title: 'Font', value: 'Noto Serif', icon: 'text' },
    { title: 'Font Size', value: '16', icon: 'text' },
    { title: 'Line Spacing', value: 'Normal', icon: 'text' },
    { title: 'Margins', value: 'Medium', icon: 'settings' },
    { title: 'Sleep Timer', value: '15 min', icon: 'recent' },
    { title: 'Wi-Fi', value: 'On', icon: 'wifi' },
    { title: 'About', value: '', icon: 'library' },
  ];
  const FILE_ROWS = [
    { title: 'Fiction', subtitle: '24 items', icon: 'folder' },
    { title: 'The Way of Kings.epub', subtitle: 'Brandon Sanderson · 38%', icon: 'book' },
    { title: 'Dune.epub', subtitle: 'Frank Herbert · Not started', icon: 'book' },
    { title: 'notes.txt', subtitle: '4 KB', icon: 'text' },
    { title: 'cover-art.png', subtitle: '1.2 MB', icon: 'image' },
    { title: 'manual.pdf', subtitle: '820 KB', icon: 'file' },
  ];

  // Home menu items, in order. `cont` items only show when continue-reading is
  // promoted into the menu.
  function homeMenuItems() {
    const items = [];
    if (metric('homeContinueReadingInMenu')) items.push({ label: 'Continue Reading', icon: 'book' });
    items.push({ label: 'Browse Files', icon: 'folder' });
    items.push({ label: 'Recent Books', icon: 'recent' });
    if (state.hasOpds) items.push({ label: 'OPDS Catalog', icon: 'library' });
    items.push({ label: 'File Transfer', icon: 'transfer' });
    items.push({ label: 'Settings', icon: 'settings' });
    return items;
  }

  // ---------------------------------------------------------------------------
  // Surface renderers (mirror LyraTheme draw* methods)
  // ---------------------------------------------------------------------------
  function iconNameFor(key) { return key; }

  function drawHeader(r, rect, title, subtitle) {
    const m = LYRA_METRICS; // header uses fixed offsets; use effective via metric()
    r.fillRect(rect.x, rect.y, rect.width, rect.height, false);
    // battery
    const battW = metric('batteryWidth'), battH = metric('batteryHeight');
    const battX = rect.x + rect.width - 12 - battW;
    r.drawRect(battX, rect.y + 8, battW, battH, true);
    r.fillRect(battX + 2, rect.y + 10, (battW - 4) * 0.7, battH - 4, true);
    r.fillRect(battX + battW, rect.y + 10, 2, battH - 4, true);
    // title + divider (only when a title is present, matching the firmware)
    if (title) {
      const titleY = Math.min(rect.y + metric('batteryBarHeight') + 3, rect.y + Math.max(0, rect.height - r.getLineHeight('ui12') - 6));
      r.drawText('ui12', rect.x + metric('contentSidePadding'), titleY, title, true, 'bold');
      r.drawLine(rect.x, rect.y + rect.height - 3, rect.x + rect.width - 1, rect.y + rect.height - 3, 3, true);
    }
    if (subtitle) {
      const sw = r.getTextWidth('small', subtitle, 'regular');
      r.drawText('small', rect.x + rect.width - metric('contentSidePadding') - sw, rect.y + Math.min(50, rect.height - 24), subtitle, true, 'regular');
    }
  }

  function drawCoverStrip(r, rect, spec, selected) {
    const m = { contentSidePadding: metric('contentSidePadding'), homeCoverHeight: metric('homeCoverHeight') };
    const books = SAMPLE_BOOKS;
    const count = Math.min(metric('homeRecentBooksCount') || books.length, books.length);
    const slots = spec.slots || [];

    // Optional panel behind the whole strip (e.g. RoundedRaff).
    if (spec.drawPanel) {
      const inset = Math.max(0, spec.panelInsetX || 0);
      r.fillRoundedRect(rect.x + inset, rect.y, Math.max(0, rect.width - inset * 2), rect.height, spec.panelCornerRadius || 6, 'gray');
    }

    function resolveIndex(slot) {
      switch (slot.book) {
        case 'previous': return selected - 1 < 0 ? (spec.wrap ? count - 1 : -1) : selected - 1;
        case 'next': return selected + 1 >= count ? (spec.wrap ? 0 : -1) : selected + 1;
        case 'index': return slot.bookIndex || 0;
        default: return selected;
      }
    }
    for (const slot of slots) {
      const bi = resolveIndex(slot);
      if (bi < 0 || bi >= count) continue;
      const h = Math.min(slot.height, rect.height);
      const w = Math.max(1, Math.floor((h * Math.max(1, slot.widthPercent)) / 100));
      let x = rect.x + Math.floor((rect.width - w) / 2);
      if (slot.x === 'padding') x = rect.x + m.contentSidePadding;
      else if (slot.x === 'right-padding') x = rect.x + rect.width - m.contentSidePadding - w;
      x += slot.xOffset || 0;
      let y = rect.y;
      if (slot.y === 'center') y = rect.y + Math.floor((rect.height - h) / 2);
      y += slot.yOffset || 0;
      const isSel = slot.selected && (slot.book !== 'index' || bi === selected);

      // "No cover" placeholder, matching the firmware: outline, solid black
      // bottom two-thirds, cover icon in the top third.
      r.drawRect(x, y, w, h, true);
      r.fillRect(x, y + Math.floor(h / 3), w, h - Math.floor(h / 3), true);
      drawIcon(r.ctx, 'cover', x + Math.max(4, (w - 32) / 2), y + 16, 32);
      r.drawRect(x, y, w, h, true);
      if (isSel) {
        // The home strip isn't the focused element in this preview (the menu
        // is), so selected covers use inactiveSelectionLineWidth when set.
        const inactive = spec.inactiveSelectionLineWidth > 0 ? spec.inactiveSelectionLineWidth : (spec.selectionLineWidth || 2);
        const lineWidth = Math.max(1, inactive);
        for (let i = 0; i < lineWidth; i++) {
          r.drawRoundedRect(x - 6 - i, y - 6 - i, w + 12 + 2 * i, h + 12 + 2 * i, lineWidth, spec.selectionCornerRadius || 6, true);
        }
      }
      if (slot.title && slot.title.enabled) {
        const maxWidth = Math.max(40, w + 28);
        const lines = r.wrappedText(slot.title.font, books[bi].title, maxWidth, slot.title.maxLines || 2, slot.title.style);
        let ty = y + h + (slot.title.offsetY || 12);
        for (const line of lines) {
          const tw = r.getTextWidth(slot.title.font, line, slot.title.style);
          r.drawText(slot.title.font, x + (w - tw) / 2, ty, line, true, slot.title.style);
          ty += r.getLineHeight(slot.title.font);
        }
      }
    }
  }

  // Built-in default home recents (non-strip): a single "Continue Reading"
  // card — cover thumbnail on the left, bold title (up to 3 lines) + author on
  // the right, vertically centered. Mirrors LyraTheme::drawRecentBookCover's
  // default branch.
  function drawDefaultRecents(r, rect) {
    const csp = metric('contentSidePadding');
    const coverH = metric('homeCoverHeight');
    const vSpacing = metric('verticalSpacing');
    const hPad = 8;
    const tileX = rect.x + csp;
    const tileWidth = rect.width - 2 * csp;
    const book = SAMPLE_BOOKS[0];
    const coverW = Math.round(coverH * 0.6);
    const cx = tileX + hPad, cy = rect.y + hPad;
    // cover placeholder (left)
    r.drawRect(cx, cy, coverW, coverH, true);
    r.fillRect(cx, cy + Math.floor(coverH / 3), coverW, coverH - Math.floor(coverH / 3), true);
    drawIcon(r.ctx, 'cover', cx + 24, cy + 24, 32);
    r.drawRect(cx, cy, coverW, coverH, true);
    // title + author (right), vertically centered in the tile
    const textX = tileX + hPad + coverW + vSpacing;
    const textWidth = tileWidth - 2 * hPad - vSpacing - coverW;
    const titleLines = r.wrappedText('ui12', book.title, textWidth, 3, 'bold');
    const author = r.truncatedText('ui10', book.author, textWidth);
    const titleLH = r.getLineHeight('ui12');
    const titleBlockH = titleLH * titleLines.length;
    const authorH = book.author ? Math.floor(r.getLineHeight('ui10') * 3 / 2) : 0;
    let ty = rect.y + Math.floor(rect.height / 2 - (titleBlockH + authorH) / 2);
    for (const line of titleLines) { r.drawText('ui12', textX, ty, line, true, 'bold'); ty += titleLH; }
    if (book.author) { ty += Math.floor(r.getLineHeight('ui10') / 2); r.drawText('ui10', textX, ty, author, true, 'regular'); }
  }

  function drawButtonMenu(r, rect, items, selectedIndex) {
    const spec = state.theme.components.homeMenu || DEFAULT_HOME_MENU;
    const menuRowHeight = metric('menuRowHeight'), menuSpacing = metric('menuSpacing');
    const count = items.length;
    const panelWidth = spec.panelWidth > 0 ? Math.min(spec.panelWidth, rect.width) : rect.width;
    const panelX = rect.x + Math.floor((rect.width - panelWidth) / 2);
    const panelHeight = count * menuRowHeight + Math.max(0, count - 1) * menuSpacing;
    const panelY = spec.centerVertically && panelHeight < rect.height ? rect.y + Math.floor((rect.height - panelHeight) / 2) : rect.y;
    const iconSize = 32;

    if (spec.drawPanel) r.drawRoundedRect(panelX, panelY, panelWidth, panelHeight, 1, spec.panelCornerRadius || 3, true);

    const textInsetX = spec.textInsetX != null ? spec.textInsetX : 16;
    const rowPaddingX = spec.rowPaddingX != null ? spec.rowPaddingX : 16;
    for (let i = 0; i < count; i++) {
      const sel = i === selectedIndex;
      let label = items[i].label;
      const tile = { x: panelX + spec.selectionInset, y: panelY + i * (menuRowHeight + menuSpacing), width: panelWidth - spec.selectionInset * 2, height: menuRowHeight };
      const isPill = spec.selectionStyle === 'pill';
      if (isPill) {
        const maxLabelWidth = Math.max(0, panelWidth - spec.selectionInset * 2 - rowPaddingX);
        label = r.truncatedText(spec.font, label, maxLabelWidth, spec.style);
        tile.width = Math.min(tile.width, r.getTextWidth(spec.font, label, spec.style) + rowPaddingX);
      }
      // selection background
      if (isPill) {
        r.fillRoundedRect(tile.x, tile.y, tile.width, tile.height, spec.selectionCornerRadius, sel ? 'black' : 'white');
      } else if (sel) {
        if (spec.selectionStyle === 'outline') r.drawRoundedRect(tile.x, tile.y, tile.width, tile.height, 1, spec.selectionCornerRadius, true);
        else if (spec.selectionStyle === 'triangle') {
          const tx = panelX + spec.selectionInset, cy = tile.y + tile.height / 2;
          r.fillPolygon([tx, tx, tx + 12], [cy - 9, cy + 9, cy], 3, true);
        } else if (spec.selectionStyle === 'underline') { /* after text */ }
        else r.fillRoundedRect(tile.x, tile.y, tile.width, tile.height, spec.selectionCornerRadius, spec.selectionFillBlack ? 'black' : 'gray');
      }
      const inverted = sel && (spec.selectedTextInverted || isPill);
      const lh = r.getLineHeight(spec.font);
      const textY = tile.y + Math.floor((tile.height - lh) / 2);
      let textX = tile.x + textInsetX;
      if (spec.showIcons) {
        const iconY = tile.y + Math.floor((tile.height - iconSize) / 2);
        drawIcon(r.ctx, items[i].icon, textX, iconY, iconSize, inverted);
        textX += iconSize + 8 + 2;
      }
      if (spec.centeredText) {
        const tw = r.getTextWidth(spec.font, label, spec.style);
        textX = tile.x + Math.floor((tile.width - tw) / 2);
      }
      r.drawText(spec.font, textX, textY, label, !inverted, spec.style);
      if (sel && spec.selectionStyle === 'underline') {
        const tw = r.getTextWidth(spec.font, label, spec.style);
        const uy = Math.min(tile.y + tile.height - 5, textY + lh + 2);
        r.drawLine(textX, uy, textX + tw - 1, uy, 1, true);
      }
    }
  }

  function drawList(r, rect, rows, selectedIndex, opts) {
    const spec = state.theme.components.list || DEFAULT_LIST;
    opts = opts || {};
    const hasSubtitle = !!opts.subtitle;
    const rowHeight = hasSubtitle ? metric('listWithSubtitleRowHeight') : metric('listRowHeight');
    const pageItems = Math.max(1, Math.floor(rect.height / Math.max(1, rowHeight)));
    const itemCount = rows.length;
    const totalPages = Math.ceil(itemCount / pageItems);
    const contentWidth = rect.width - (totalPages > 1 ? (metric('scrollBarWidth') + metric('scrollBarRightOffset')) : 1);
    const csp = metric('contentSidePadding');
    const hPad = 8;

    if (totalPages > 1) {
      const scrollBarHeight = Math.max(metric('scrollBarWidth'), Math.floor((rect.height * pageItems) / itemCount));
      const currentPage = Math.floor(selectedIndex / pageItems);
      const scrollBarY = rect.y + Math.floor(((rect.height - scrollBarHeight) * currentPage) / (totalPages - 1));
      const scrollBarX = rect.x + rect.width - metric('scrollBarRightOffset');
      r.drawLine(scrollBarX, rect.y, scrollBarX, rect.y + rect.height, 1, true);
      r.fillRect(scrollBarX - metric('scrollBarWidth'), scrollBarY, metric('scrollBarWidth'), scrollBarHeight, true);
    }

    const selStyle = spec.selectionStyle || 'fill';
    const rowBg = !!spec.rowBackgrounds;
    const textInsetX = spec.textInsetX != null ? spec.textInsetX : hPad;
    const rowSidePadding = spec.rowSidePadding || 0;
    const rowX = rect.x + rowSidePadding;
    const rowWidth = contentWidth - rowSidePadding * 2;

    // Selection highlight only when NOT using per-row backgrounds.
    if (selectedIndex >= 0 && !rowBg) {
      const selY = rect.y + (selectedIndex % pageItems) * rowHeight;
      const sx = rect.x + csp + spec.selectionInsetX;
      const sy = selY + spec.selectionInsetY;
      const sw = contentWidth - csp * 2 - spec.selectionInsetX * 2;
      const sh = rowHeight - spec.selectionInsetY * 2;
      if (selStyle === 'fill' && spec.selectionFill) r.fillRoundedRect(sx, sy, sw, sh, spec.selectionCornerRadius, 'gray');
      if (selStyle === 'outline' || spec.selectionOutline) r.drawRoundedRect(sx, sy, sw, sh, 1, spec.selectionCornerRadius, true);
    }

    const iconSize = spec.iconSize > 0 ? spec.iconSize : (hasSubtitle ? 32 : 24);
    let textX = rowBg ? rowX + textInsetX : rect.x + csp + hPad;
    let textW = rowBg ? rowWidth - textInsetX * 2 : contentWidth - csp * 2 - hPad * 2;
    if (opts.icons && spec.showIcons) { textX += iconSize + spec.textGap; textW -= iconSize + spec.textGap; }

    const pageStart = Math.floor(selectedIndex / pageItems) * pageItems;
    for (let i = pageStart; i < itemCount && i < pageStart + pageItems; i++) {
      const itemY = rect.y + (i % pageItems) * rowHeight;
      const sel = i === selectedIndex;
      const row = rows[i];
      const inverted = sel && spec.selectedTextInverted;
      if (rowBg) r.fillRoundedRect(rowX, itemY, rowWidth, rowHeight, spec.selectionCornerRadius, sel ? 'black' : 'white');

      let rowTextW = textW;
      let valueText = '', valueW = 0;
      if (opts.value && row.value) {
        valueText = r.truncatedText('ui10', row.value, 200);
        valueW = r.getTextWidth('ui10', valueText) + hPad;
        rowTextW -= valueW;
      }
      const lh = r.getLineHeight(spec.font);
      const centerSingle = spec.centerSingleLineRows && (!hasSubtitle || !row.subtitle);
      const titleY = centerSingle ? itemY + Math.floor((rowHeight - lh) / 2) : itemY + spec.titleOffsetY;
      const title = r.truncatedText(spec.font, row.title, rowTextW, spec.style);
      r.drawText(spec.font, textX, titleY, title, !inverted, spec.style);
      if (sel && selStyle === 'underline') {
        const tw = r.getTextWidth(spec.font, title, spec.style);
        const uy = Math.min(itemY + rowHeight - 4, titleY + lh + 2);
        r.drawLine(textX, uy, textX + tw - 1, uy, 1, true);
      }

      if (opts.icons && spec.showIcons) {
        const top = spec.titleOffsetY;
        const bottom = hasSubtitle ? spec.subtitleOffsetY + r.getLineHeight('small') : spec.titleOffsetY + lh;
        const iconY = itemY + Math.floor((top + bottom - iconSize) / 2) + spec.iconOffsetY;
        const iconX = rowBg ? rowX + textInsetX : rect.x + csp + hPad;
        drawIcon(r.ctx, row.icon, iconX, iconY, iconSize, inverted);
      }
      if (hasSubtitle && row.subtitle) {
        const sub = r.truncatedText('small', row.subtitle, rowTextW);
        r.drawText('small', textX, itemY + spec.subtitleOffsetY, sub, !inverted, 'regular');
      }
      if (valueText) {
        const vy = centerSingle ? itemY + Math.floor((rowHeight - r.getLineHeight('ui10')) / 2)
          : itemY + (hasSubtitle ? spec.subtitleValueOffsetY : spec.valueOffsetY);
        const valueX = rowBg ? rowX + rowWidth - textInsetX - valueW : rect.x + contentWidth - csp - valueW;
        r.drawText('ui10', valueX, vy, valueText, !inverted, 'regular');
      }
    }
  }

  function shapeForLabel(label) {
    if (!label) return 'none';
    const l = label.toLowerCase();
    if (['back', 'cancel', 'home'].includes(l)) return 'back';
    if (['select', 'confirm', 'ok', 'done', 'open'].includes(l)) return 'select';
    if (l === 'up') return 'up';
    if (l === 'down') return 'down';
    if (l === 'left' || label === '<' || label === '-') return 'left';
    if (l === 'right' || label === '>' || label === '+') return 'right';
    return 'none';
  }
  function drawHintShape(r, shape, cx, cy, size) {
    const half = Math.max(4, size / 2);
    if (shape === 'back') { r.fillRect(cx - half, cy - half, half * 2, half * 2, true); return; }
    if (shape === 'select') { r.ctx.beginPath(); r.ctx.fillStyle = '#111'; r.ctx.arc(cx, cy, half, 0, Math.PI * 2); r.ctx.fill(); return; }
    let xs, ys;
    if (shape === 'up') { xs = [cx, cx - half, cx + half]; ys = [cy - half, cy + half, cy + half]; }
    else if (shape === 'down') { xs = [cx - half, cx + half, cx]; ys = [cy - half, cy - half, cy + half]; }
    else if (shape === 'left') { xs = [cx - half, cx + half, cx + half]; ys = [cy, cy - half, cy + half]; }
    else if (shape === 'right') { xs = [cx + half, cx - half, cx - half]; ys = [cy, cy - half, cy + half]; }
    else return;
    r.fillPolygon(xs, ys, 3, true);
  }
  // Front-button hints (X3). Tabs are anchored flush to the bottom edge with
  // only their TOP corners rounded — the bottoms are square and cut off at the
  // screen edge, exactly like the firmware (drawRoundedRect top corners only).
  const TOP_CORNERS = { tl: true, tr: true, br: false, bl: false };
  // Vertically center the label within the tab. textOffsetY nudges from center
  // (default 7 ≈ centered; larger pushes the text down), keeping the field live
  // while looking right by default at our font scale.
  function hintTextY(tabTop, tabHeight, spec) {
    return tabTop + Math.round((tabHeight - r.getLineHeight(spec.font)) / 2) + ((spec.textOffsetY || 0) - 7);
  }
  function hintLayout(spec) { return spec.layout || (spec.shapes ? 'shapes' : 'buttons'); }

  // "groups" layout (e.g. RoundedRaff): two rounded pill groups floating
  // bottomMargin above the bottom. Left group = [back … select], right group =
  // [up … down]. Mirrors LyraTheme::drawButtonHints groups branch.
  function drawHintGroups(r, screenW, outlineY, hintHeight, labels, spec) {
    const sidePadding = spec.sidePadding != null ? spec.sidePadding : 20;
    const groupGap = spec.groupGap != null ? spec.groupGap : 10;
    const innerPadding = spec.innerPadding != null ? spec.innerPadding : 16;
    const cr = spec.cornerRadius != null ? spec.cornerRadius : 15;
    const groupWidth = Math.max(1, Math.floor((screenW - sidePadding * 2 - groupGap) / 2));
    const leftX = sidePadding, rightX = leftX + groupWidth + groupGap;
    r.drawRoundedRect(leftX, outlineY, groupWidth, hintHeight, 2, cr, true);
    r.drawRoundedRect(rightX, outlineY, groupWidth, hintHeight, 2, cr, true);
    const textY = outlineY + Math.round((hintHeight - r.getLineHeight(spec.font)) / 2);
    const put = (label, gx, right) => {
      if (!label) return;
      const w = r.getTextWidth(spec.font, label, spec.style);
      r.drawText(spec.font, right ? gx + groupWidth - innerPadding - w : gx + innerPadding, textY, label, true, spec.style);
    };
    put(labels[0], leftX, false); put(labels[1], leftX, true);
    put(labels[2], rightX, false); put(labels[3], rightX, true);
  }

  function drawButtonHints(r, screenW, screenH, labels) {
    const spec = state.theme.components.buttonHints || DEFAULT_BUTTON_HINTS;
    const layout = hintLayout(spec);
    const buttonHintsHeight = metric('buttonHintsHeight');
    const cr = spec.cornerRadius;

    if (layout === 'groups') {
      const bottomMargin = spec.bottomMargin != null ? spec.bottomMargin : 10;
      const hintHeight = Math.max(1, buttonHintsHeight - bottomMargin);
      drawHintGroups(r, screenW, screenH - hintHeight - bottomMargin, hintHeight, labels, spec);
      return;
    }

    const buttonWidth = spec.buttonWidth, buttonHeight = buttonHintsHeight;
    const buttonY = buttonHintsHeight; // distance of the tab TOP from the bottom edge
    const isShapes = layout === 'shapes';
    // Position arrays are calibrated to the real panel widths (X3 = 528, X4 = 480).
    const positions = state.device === 'x3' ? [65, 157, 291, 383] : [58, 146, 254, 342];
    for (let i = 0; i < 4; i++) {
      const x = positions[i], label = labels[i];
      if (label) {
        if (isShapes) { drawHintShape(r, shapeForLabel(label), x + buttonWidth / 2, screenH - buttonY + buttonHeight / 2, spec.shapeSize); continue; }
        if (spec.fill) r.fillRoundedRectCorners(x, screenH - buttonY, buttonWidth, buttonHeight, cr, TOP_CORNERS, 'white');
        if (spec.outline) r.drawRoundedRectCorners(x, screenH - buttonY, buttonWidth, buttonHeight, 1, cr, TOP_CORNERS, true);
        const tw = r.getTextWidth(spec.font, label, spec.style);
        r.drawText(spec.font, x + (buttonWidth - 1 - tw) / 2, hintTextY(screenH - buttonY, buttonHeight, spec), label, true, spec.style);
      } else if (spec.drawEmpty && !isShapes) {
        // Empty slot: a short stub tab, also flush to the bottom edge.
        if (spec.fill) r.fillRoundedRectCorners(x, screenH - spec.smallButtonHeight, buttonWidth, spec.smallButtonHeight, cr, TOP_CORNERS, 'white');
        if (spec.outline) r.drawRoundedRectCorners(x, screenH - spec.smallButtonHeight, buttonWidth, spec.smallButtonHeight, 1, cr, TOP_CORNERS, true);
      }
    }
  }

  // Per-surface labels, in firmware hardware order [back, confirm, up, down]
  // (the default front-button mapping). Home has no back label.
  const HINT_SETS = {
    home: ['', 'Select', 'Up', 'Down'],
    settings: ['Back', 'Select', 'Up', 'Down'],
    files: ['Back', 'Open', 'Up', 'Down'],
    confirm: ['Cancel', 'OK', '', ''],
  };

  // HomeActivity (and the list activities) always draw the bottom front-button
  // bar on BOTH devices — X4 just uses its own x-position array. Side hints are
  // not used on these screens.
  function drawHints(r, W, H, set) { drawButtonHints(r, W, H, set); }

  // ---------------------------------------------------------------------------
  // Top-level render
  // ---------------------------------------------------------------------------
  let canvas, r;
  function render() {
    if (!canvas) return;
    // Real panel dimensions in portrait (from the firmware simulator's
    // EInkDisplay buffer): X3 = 528×792 (792×528 landscape), X4 = 480×800.
    const W = state.device === 'x3' ? 528 : 480;
    const H = state.device === 'x3' ? 792 : 800;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const buttonHintsHeight = metric('buttonHintsHeight');
    const surface = state.surface;

    if (surface === 'home') {
      // Layout mirrors HomeActivity::render():
      //   header  = {0, topPadding, W, homeTopPadding}
      //   cover   = {0, homeTopPadding, W, homeCoverTileHeight}
      //   menu    = {0, homeTopPadding+coverTile+menuTopOffset, W,
      //              H - (headerHeight+homeTopPadding+verticalSpacing+menuTopOffset+buttonHintsHeight)}
      const recents = state.theme.components.homeRecents || { type: 'default' };
      const homeTop = metric('homeTopPadding');
      const coverTile = metric('homeCoverTileHeight');
      const coverShown = recents.type !== 'none' && coverTile > 0 && metric('homeCoverHeight') > 0;

      // Home header: battery, plus the Continue-Reading title when promoted.
      const headerTitle = (metric('homeContinueReadingInMenu') && metric('homeShowContinueReadingHeader'))
        ? SAMPLE_BOOKS[0].title : null;
      drawHeader(r, { x: 0, y: metric('topPadding'), width: W, height: homeTop }, headerTitle);

      if (coverShown) {
        const coverRect = { x: 0, y: homeTop, width: W, height: coverTile };
        // Clip to the tile so a too-tall title can never bleed into the menu.
        r.ctx.save();
        r.ctx.beginPath();
        r.ctx.rect(coverRect.x, coverRect.y, coverRect.width, coverRect.height);
        r.ctx.clip();
        if (recents.type === 'cover-strip') {
          drawCoverStrip(r, coverRect, recents, clampSel(SAMPLE_BOOKS.length));
        } else {
          drawDefaultRecents(r, coverRect);
        }
        r.ctx.restore();
      }

      const menuY = coverShown ? homeTop + coverTile + metric('homeMenuTopOffset') : homeTop;
      const menuH = H - (metric('headerHeight') + homeTop + metric('verticalSpacing') + metric('homeMenuTopOffset') + buttonHintsHeight);
      const menuRect = { x: 0, y: menuY, width: W, height: Math.max(metric('menuRowHeight'), menuH) };
      const items = homeMenuItems();
      drawButtonMenu(r, menuRect, items, clamp(state.selectedIndex, items.length));
      drawHints(r, W, H, HINT_SETS.home);
    } else if (surface === 'settings') {
      const headerH = metric('headerHeight');
      drawHeader(r, { x: 0, y: 0, width: W, height: headerH }, 'Settings');
      const rect = { x: 0, y: headerH, width: W, height: H - headerH - buttonHintsHeight };
      drawList(r, rect, SETTINGS_ROWS, clamp(state.selectedIndex, SETTINGS_ROWS.length), { icons: true, value: true });
      drawHints(r, W, H, HINT_SETS.settings);
    } else if (surface === 'files') {
      const headerH = metric('headerHeight');
      drawHeader(r, { x: 0, y: 0, width: W, height: headerH }, 'Books', '/ books');
      const rect = { x: 0, y: headerH, width: W, height: H - headerH - buttonHintsHeight };
      drawList(r, rect, FILE_ROWS, clamp(state.selectedIndex, FILE_ROWS.length), { icons: true, subtitle: true });
      drawHints(r, W, H, HINT_SETS.files);
    } else if (surface === 'hints') {
      const headerH = metric('headerHeight');
      drawHeader(r, { x: 0, y: 0, width: W, height: headerH }, 'Button Hints');
      // Showcase each common label set as its own front-button bar.
      const sets = [['Home', HINT_SETS.home], ['Settings', HINT_SETS.settings], ['File Browser', HINT_SETS.files], ['Confirmation', HINT_SETS.confirm]];
      let y = headerH + 36;
      const gap = 150;
      for (const [name, labels] of sets) {
        r.drawText('small', metric('contentSidePadding'), y - 26, name, true, 'regular');
        drawHintBarAt(r, W, y, labels);
        y += gap;
      }
    }

    // crisp pixels
    ctx.imageSmoothingEnabled = false;
  }

  // Render a hint bar with its top at a given y (for the hints showcase).
  function drawHintBarAt(r, W, top, labels) {
    const spec = state.theme.components.buttonHints || DEFAULT_BUTTON_HINTS;
    const buttonWidth = spec.buttonWidth, buttonHeight = metric('buttonHintsHeight'), cr = spec.cornerRadius;
    if (hintLayout(spec) === 'groups') {
      const bottomMargin = spec.bottomMargin != null ? spec.bottomMargin : 10;
      drawHintGroups(r, W, top, Math.max(1, buttonHeight - bottomMargin), labels, spec);
      return;
    }
    const positions = state.device === 'x3' ? [65, 157, 291, 383] : [58, 146, 254, 342];
    for (let i = 0; i < 4; i++) {
      const x = positions[i], label = labels[i];
      if (label) {
        if (spec.shapes) { drawHintShape(r, shapeForLabel(label), x + buttonWidth / 2, top + buttonHeight / 2, spec.shapeSize); continue; }
        if (spec.fill) r.fillRoundedRectCorners(x, top, buttonWidth, buttonHeight, cr, TOP_CORNERS, 'white');
        if (spec.outline) r.drawRoundedRectCorners(x, top, buttonWidth, buttonHeight, 1, cr, TOP_CORNERS, true);
        const tw = r.getTextWidth(spec.font, label, spec.style);
        r.drawText(spec.font, x + (buttonWidth - 1 - tw) / 2, hintTextY(top, buttonHeight, spec), label, true, spec.style);
      } else if (spec.drawEmpty && !spec.shapes) {
        if (spec.fill) r.fillRoundedRectCorners(x, top + buttonHeight - spec.smallButtonHeight, buttonWidth, spec.smallButtonHeight, cr, TOP_CORNERS, 'white');
        if (spec.outline) r.drawRoundedRectCorners(x, top + buttonHeight - spec.smallButtonHeight, buttonWidth, spec.smallButtonHeight, 1, cr, TOP_CORNERS, true);
      }
    }
  }

  function clamp(i, n) { if (n <= 0) return -1; return ((i % n) + n) % n; }
  function clampSel(n) { return clamp(state.selectedIndex, n); }

  // ---------------------------------------------------------------------------
  // Export — build theme.json
  // ---------------------------------------------------------------------------
  function buildThemeJson() {
    const t = state.theme;
    const out = { schema: 1, id: t.meta.id, name: t.meta.name };
    if (t.meta.description) out.description = t.meta.description;
    out.inherits = 'lyra';

    // metrics: only those differing from Lyra base, unless writeAll
    const metrics = {};
    const src = t.metrics || {};
    for (const k of Object.keys(src)) {
      if (state.writeAllMetrics || src[k] !== LYRA_METRICS[k]) metrics[k] = src[k];
    }
    if (Object.keys(metrics).length || state.writeAllMetrics) out.metrics = metrics;

    // components (write full specs, matching shipped themes)
    out.components = clone(t.components);
    // homeRecents type:none collapses to {type:'none'}
    if (out.components.homeRecents && out.components.homeRecents.type === 'none') {
      out.components.homeRecents = { type: 'none' };
    }

    out.assets = { icons: defaultIconMap() };
    out.devices = {
      x3: { constraints: DEVICE_CONSTRAINTS.x3 },
      x4: { constraints: DEVICE_CONSTRAINTS.x4 },
    };
    if (t.extensions) out.extensions = t.extensions;
    if (t._extra) Object.assign(out, t._extra);
    return out;
  }

  function defaultIconMap() {
    return {
      book: 'icons/book.bmp', book24: 'icons/book24.bmp', bookmark: 'icons/bookmark.bmp',
      cover: 'icons/cover.bmp', file24: 'icons/file24.bmp', folder: 'icons/folder.bmp',
      folder24: 'icons/folder24.bmp', hotspot: 'icons/hotspot.bmp', image24: 'icons/image24.bmp',
      library: 'icons/library.bmp', recent: 'icons/recent.bmp', settings: 'icons/settings2.bmp',
      text24: 'icons/text24.bmp', transfer: 'icons/transfer.bmp', wifi: 'icons/wifi.bmp',
    };
  }

  // Minimal store-only ZIP writer (no compression, no deps).
  function makeZip(files) {
    const enc = new TextEncoder();
    const chunks = [];
    const central = [];
    let offset = 0;
    const crcTable = (function () {
      const t = [];
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
      }
      return t;
    })();
    function crc32(buf) {
      let c = 0xFFFFFFFF;
      for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    }
    function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
    function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const data = f.data instanceof Uint8Array ? f.data : enc.encode(f.data);
      const crc = crc32(data);
      const local = [].concat(
        u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(crc), u32(data.length), u32(data.length),
        u16(nameBytes.length), u16(0)
      );
      chunks.push(new Uint8Array(local), nameBytes, data);
      central.push({ nameBytes, crc, size: data.length, offset });
      offset += local.length + nameBytes.length + data.length;
    }
    const cdStart = offset;
    for (const c of central) {
      const rec = [].concat(
        u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
        u32(c.crc), u32(c.size), u32(c.size),
        u16(c.nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset)
      );
      chunks.push(new Uint8Array(rec), c.nameBytes);
      offset += rec.length + c.nameBytes.length;
    }
    const cdSize = offset - cdStart;
    const end = [].concat(
      u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length),
      u32(cdSize), u32(cdStart), u16(0)
    );
    chunks.push(new Uint8Array(end));
    return new Blob(chunks, { type: 'application/zip' });
  }

  function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------
  function validate() {
    const errors = [], warnings = [];
    const t = state.theme;
    if (!t.meta.id) errors.push('Theme ID is required.');
    else if (!/^[A-Za-z0-9_-]+$/.test(t.meta.id)) errors.push('Theme ID may only contain letters, numbers, "-" and "_" (no spaces or slashes).');
    if (!t.meta.name) errors.push('Theme name is required.');
    const hr = t.components.homeRecents;
    if (hr && hr.type === 'cover-strip' && (!hr.slots || hr.slots.length === 0)) errors.push('Cover-strip home recents needs at least one slot.');
    if (hr && hr.type === 'none' && (metric('homeCoverHeight') > 0 || metric('homeCoverTileHeight') > 0))
      warnings.push('Home recents is "none" but cover metrics are nonzero. They will be ignored.');
    if (hr && hr.type === 'cover-strip' && hr.maxBooks > metric('homeRecentBooksCount'))
      warnings.push('Cover-strip requests more books than homeRecentBooksCount.');
    if (!iconsReady())
      warnings.push('Icon BMPs not built yet — the package will contain theme.json only. Use "Build icons via CI" to generate them.');
    return { errors, warnings };
  }

  // ---------------------------------------------------------------------------
  // Icon CI build — dispatches the firmware repo's generate-theme-icons.py /
  // convert_icon.py via GitHub Actions (see /api/theme-build/*). The BMP format
  // is owned by the firmware repo, so we never encode BMPs in the browser.
  // ---------------------------------------------------------------------------
  let iconPollTimer = null;
  async function startIconBuild() {
    const fd = new FormData();
    let customCount = 0;
    for (const key of ICON_KEYS) {
      if (state.customIcons[key]) { fd.append(key, state.customIcons[key]); customCount++; }
    }
    state.iconBuild = { status: 'pending' };
    renderIconStatus();
    try {
      const res = await fetch('/api/theme-build/icons', { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || ('HTTP ' + res.status));
      pollIconBuild();
    } catch (err) {
      state.iconBuild = { status: 'failed', error: err.message };
      renderIconStatus();
    }
  }
  function pollIconBuild() {
    clearTimeout(iconPollTimer);
    iconPollTimer = setTimeout(async () => {
      try {
        const res = await fetch('/api/theme-build/status', { credentials: 'same-origin' });
        const data = await res.json();
        if (data.build) {
          state.iconBuild = data.build;
          renderIconStatus();
          if (data.build.status === 'pending' || data.build.status === 'building') return pollIconBuild();
        } else {
          pollIconBuild();
        }
      } catch (_) {
        pollIconBuild();
      }
    }, 3000);
  }
  function iconsReady() {
    return state.iconBuild && state.iconBuild.status === 'success' && (state.iconBuild.outputs || []).length > 0;
  }
  async function fetchGeneratedIcons() {
    const out = [];
    for (const name of state.iconBuild.outputs) {
      const res = await fetch('/api/theme-build/result/' + encodeURIComponent(name), { credentials: 'same-origin' });
      if (!res.ok) throw new Error('Failed to download ' + name);
      out.push({ name, data: new Uint8Array(await res.arrayBuffer()) });
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // UI wiring
  // ---------------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue; // skip absent attrs
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'selected' || k === 'checked') e[k] = true; // set as property, not "null" attr
      else e.setAttribute(k, v);
    }
    (children || []).forEach((c) => e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
    return e;
  }

  function fieldRow(label, control) {
    return el('label', { class: 'flex items-center justify-between gap-3 py-1.5' }, [
      el('span', { class: 'text-xs text-stone-600' }, [label]), control,
    ]);
  }
  function numberInput(value, onInput) {
    return el('input', { type: 'number', value: value, class: 'w-20 rounded-md border border-stone-300 px-2 py-1 text-xs text-right focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none', oninput: (e) => onInput(parseFloat(e.target.value) || 0) });
  }
  function selectInput(value, options, onChange) {
    return el('select', { class: 'rounded-md border border-stone-300 px-2 py-1 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none', onchange: (e) => onChange(e.target.value) },
      options.map((o) => el('option', { value: o, selected: o === value ? 'selected' : null }, [o])));
  }
  function checkInput(value, onChange) {
    return el('input', { type: 'checkbox', class: 'size-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500', checked: value ? 'checked' : null, onchange: (e) => onChange(e.target.checked) });
  }
  function section(title, body, open) {
    const content = el('div', { class: 'mt-2 ' + (open ? '' : 'hidden') }, body);
    const chevron = el('span', { class: 'text-stone-400 transition-transform ' + (open ? 'rotate-90' : '') }, ['›']);
    const header = el('button', { type: 'button', class: 'flex w-full items-center gap-2 text-left text-sm font-medium text-stone-800', onclick: () => { content.classList.toggle('hidden'); chevron.classList.toggle('rotate-90'); } }, [chevron, title]);
    return el('div', { class: 'border-b border-stone-100 py-3' }, [header, content]);
  }

  function rerenderControls() {
    const panel = $('controls');
    panel.innerHTML = '';
    const t = state.theme;
    const c = t.components;

    // --- Theme details ---
    panel.appendChild(section('Theme Details', [
      fieldRow('ID', el('input', { type: 'text', value: t.meta.id, class: 'w-44 rounded-md border border-stone-300 px-2 py-1 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none', oninput: (e) => { t.meta.id = e.target.value; refreshOutput(); } })),
      fieldRow('Name', el('input', { type: 'text', value: t.meta.name, class: 'w-44 rounded-md border border-stone-300 px-2 py-1 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none', oninput: (e) => { t.meta.name = e.target.value; refreshOutput(); } })),
      el('label', { class: 'block py-1.5' }, [
        el('span', { class: 'text-xs text-stone-600' }, ['Description']),
        el('textarea', { rows: '2', class: 'mt-1 block w-full rounded-md border border-stone-300 px-2 py-1 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none', oninput: (e) => { t.meta.description = e.target.value; refreshOutput(); } }, [t.meta.description || '']),
      ]),
    ], true));

    // --- Home Recents ---
    const hr = c.homeRecents || (c.homeRecents = { type: 'default' });
    const hrBody = [
      fieldRow('Type', selectInput(hr.type || 'default', ['default', 'none', 'cover-strip'], (v) => {
        hr.type = v;
        // Seed a single cover slot the first time cover-strip is chosen so the
        // slot editor has something to work with.
        if (v === 'cover-strip' && !Array.isArray(hr.slots)) {
          hr.maxBooks = 1; hr.wrap = false; hr.selectionLineWidth = 2; hr.selectionCornerRadius = 6;
          hr.slots = [{ book: 'selected', x: 'center', y: 'top', height: 226, widthPercent: 62, yOffset: 8, selected: true, title: { enabled: true, font: 'ui12', style: 'bold', maxLines: 2, offsetY: 12 } }];
        }
        update();
      })),
    ];
    if (hr.type === 'cover-strip') {
      if (!Array.isArray(hr.slots)) hr.slots = [];
      hrBody.push(fieldRow('Wrap (carousel)', checkInput(hr.wrap, (v) => { hr.wrap = v; render(); })));
      hrBody.push(fieldRow('Selection line width', numberInput(hr.selectionLineWidth || 2, (v) => { hr.selectionLineWidth = v; render(); })));
      hrBody.push(fieldRow('Inactive selection line width', numberInput(hr.inactiveSelectionLineWidth || 0, (v) => { hr.inactiveSelectionLineWidth = v; render(); })));
      hrBody.push(fieldRow('Selection corner radius', numberInput(hr.selectionCornerRadius || 6, (v) => { hr.selectionCornerRadius = v; render(); })));
      hrBody.push(fieldRow('Draw panel', checkInput(hr.drawPanel, (v) => { hr.drawPanel = v; render(); })));
      if (hr.drawPanel) {
        hrBody.push(fieldRow('Panel corner radius', numberInput(hr.panelCornerRadius || 6, (v) => { hr.panelCornerRadius = v; render(); })));
        hrBody.push(fieldRow('Panel inset X', numberInput(hr.panelInsetX || 0, (v) => { hr.panelInsetX = v; render(); })));
      }

      // The number of cover slots is what actually controls how many covers
      // appear — each entry in slots[] is one cover.
      hrBody.push(el('div', { class: 'mt-3 mb-1 flex items-center justify-between' }, [
        el('span', { class: 'text-xs font-medium text-stone-700' }, ['Cover slots (' + hr.slots.length + ')']),
        el('button', { type: 'button', class: 'rounded-md bg-brand-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-brand-700', onclick: () => {
          const idx = hr.slots.length;
          hr.slots.push({ book: 'index', bookIndex: idx, x: 'center', y: 'top', height: 226, widthPercent: 62, selected: true, title: { enabled: true, font: 'ui10', style: 'regular', maxLines: 2, offsetY: 12 } });
          update();
        } }, ['+ Add cover slot']),
      ]));

      hr.slots.forEach((slot, i) => {
        slot.title = slot.title || { enabled: false, font: 'ui10', style: 'regular', maxLines: 2, offsetY: 12 };
        const card = el('div', { class: 'mb-2 rounded-lg border border-stone-200 p-2' }, [
          el('div', { class: 'mb-1 flex items-center justify-between' }, [
            el('span', { class: 'text-[11px] font-semibold text-stone-600' }, ['Slot ' + (i + 1)]),
            el('button', { type: 'button', class: 'text-[11px] font-medium text-red-600 hover:text-red-700', onclick: () => { hr.slots.splice(i, 1); update(); } }, ['Remove']),
          ]),
          fieldRow('Book', selectInput(slot.book || 'selected', ['previous', 'selected', 'next', 'index'], (v) => { slot.book = v; update(); })),
        ]);
        if (slot.book === 'index') card.appendChild(fieldRow('Book index', numberInput(slot.bookIndex || 0, (v) => { slot.bookIndex = v; render(); })));
        card.appendChild(fieldRow('X', selectInput(slot.x || 'center', ['padding', 'center', 'right-padding'], (v) => { slot.x = v; render(); })));
        card.appendChild(fieldRow('Y', selectInput(slot.y || 'top', ['top', 'center'], (v) => { slot.y = v; render(); })));
        card.appendChild(fieldRow('Height', numberInput(slot.height || 226, (v) => { slot.height = v; render(); })));
        card.appendChild(fieldRow('Width %', numberInput(slot.widthPercent || 62, (v) => { slot.widthPercent = v; render(); })));
        card.appendChild(fieldRow('Selected', checkInput(slot.selected, (v) => { slot.selected = v; render(); })));
        card.appendChild(fieldRow('Title', checkInput(slot.title.enabled, (v) => { slot.title.enabled = v; render(); })));
        hrBody.push(card);
      });

      // maxBooks is a real firmware field but a common source of confusion: it
      // caps how many recent books feed previous/selected/next — it does NOT
      // set the number of covers (that's the slots above).
      hrBody.push(fieldRow('Max recent books', numberInput(hr.maxBooks || hr.slots.length || 1, (v) => { hr.maxBooks = v; render(); })));
      hrBody.push(el('p', { class: 'text-[11px] text-stone-400' }, ['Caps how many recent books feed previous/selected/next slots. To change how many covers show, add or remove slots above.']));
    }
    panel.appendChild(section('Home Recents', hrBody, true));

    // --- Home Menu ---
    const hm = c.homeMenu || (c.homeMenu = clone(DEFAULT_HOME_MENU));
    panel.appendChild(section('Home Menu', [
      fieldRow('Font', selectInput(hm.font, ['small', 'ui10', 'ui12'], (v) => { hm.font = v; render(); })),
      fieldRow('Style', selectInput(hm.style, ['regular', 'bold'], (v) => { hm.style = v; render(); })),
      fieldRow('Centered text', checkInput(hm.centeredText, (v) => { hm.centeredText = v; render(); })),
      fieldRow('Center vertically', checkInput(hm.centerVertically, (v) => { hm.centerVertically = v; render(); })),
      fieldRow('Show icons', checkInput(hm.showIcons, (v) => { hm.showIcons = v; render(); })),
      fieldRow('Draw panel', checkInput(hm.drawPanel, (v) => { hm.drawPanel = v; render(); })),
      fieldRow('Panel width', numberInput(hm.panelWidth || 0, (v) => { hm.panelWidth = v; render(); })),
      fieldRow('Selection style', selectInput(hm.selectionStyle, ['fill', 'outline', 'triangle', 'underline', 'pill'], (v) => { hm.selectionStyle = v; render(); })),
      fieldRow('Selection fill black', checkInput(hm.selectionFillBlack, (v) => { hm.selectionFillBlack = v; render(); })),
      fieldRow('Selected text inverted', checkInput(hm.selectedTextInverted, (v) => { hm.selectedTextInverted = v; render(); })),
      fieldRow('Selection corner radius', numberInput(hm.selectionCornerRadius, (v) => { hm.selectionCornerRadius = v; render(); })),
      fieldRow('Selection inset', numberInput(hm.selectionInset, (v) => { hm.selectionInset = v; render(); })),
      fieldRow('Has OPDS item', checkInput(state.hasOpds, (v) => { state.hasOpds = v; render(); })),
    ], false));

    // --- List ---
    const ls = c.list || (c.list = clone(DEFAULT_LIST));
    panel.appendChild(section('List', [
      fieldRow('Font', selectInput(ls.font, ['small', 'ui10', 'ui12'], (v) => { ls.font = v; render(); })),
      fieldRow('Style', selectInput(ls.style, ['regular', 'bold'], (v) => { ls.style = v; render(); })),
      fieldRow('Show icons', checkInput(ls.showIcons, (v) => { ls.showIcons = v; render(); })),
      fieldRow('Text gap', numberInput(ls.textGap, (v) => { ls.textGap = v; render(); })),
      fieldRow('Selection style', selectInput(ls.selectionStyle || 'fill', ['fill', 'outline', 'underline'], (v) => { ls.selectionStyle = v; render(); })),
      fieldRow('Row backgrounds', checkInput(ls.rowBackgrounds, (v) => { ls.rowBackgrounds = v; render(); })),
      fieldRow('Selected text inverted', checkInput(ls.selectedTextInverted, (v) => { ls.selectedTextInverted = v; render(); })),
      fieldRow('Center single-line rows', checkInput(ls.centerSingleLineRows, (v) => { ls.centerSingleLineRows = v; render(); })),
      fieldRow('Selection corner radius', numberInput(ls.selectionCornerRadius, (v) => { ls.selectionCornerRadius = v; render(); })),
      fieldRow('Selection fill', checkInput(ls.selectionFill, (v) => { ls.selectionFill = v; render(); })),
      fieldRow('Selection outline', checkInput(ls.selectionOutline, (v) => { ls.selectionOutline = v; render(); })),
      fieldRow('Selection inset X', numberInput(ls.selectionInsetX, (v) => { ls.selectionInsetX = v; render(); })),
      fieldRow('Selection inset Y', numberInput(ls.selectionInsetY, (v) => { ls.selectionInsetY = v; render(); })),
      fieldRow('Title offset Y', numberInput(ls.titleOffsetY, (v) => { ls.titleOffsetY = v; render(); })),
      fieldRow('Subtitle offset Y', numberInput(ls.subtitleOffsetY, (v) => { ls.subtitleOffsetY = v; render(); })),
      fieldRow('Value offset Y', numberInput(ls.valueOffsetY, (v) => { ls.valueOffsetY = v; render(); })),
    ], false));

    // --- Button Hints ---
    const bh = c.buttonHints || (c.buttonHints = clone(DEFAULT_BUTTON_HINTS));
    const bhLayout = bh.layout || (bh.shapes ? 'shapes' : 'buttons');
    const bhBody = [
      fieldRow('Layout', selectInput(bhLayout, ['buttons', 'shapes', 'groups'], (v) => { bh.layout = v; if (v !== 'shapes') bh.shapes = false; update(); })),
      fieldRow('Font', selectInput(bh.font, ['small', 'ui10', 'ui12'], (v) => { bh.font = v; render(); })),
      fieldRow('Style', selectInput(bh.style, ['regular', 'bold'], (v) => { bh.style = v; render(); })),
      fieldRow('Corner radius', numberInput(bh.cornerRadius, (v) => { bh.cornerRadius = v; render(); })),
    ];
    if (bhLayout === 'groups') {
      bhBody.push(fieldRow('Side padding', numberInput(bh.sidePadding != null ? bh.sidePadding : 20, (v) => { bh.sidePadding = v; render(); })));
      bhBody.push(fieldRow('Group gap', numberInput(bh.groupGap != null ? bh.groupGap : 10, (v) => { bh.groupGap = v; render(); })));
      bhBody.push(fieldRow('Bottom margin', numberInput(bh.bottomMargin != null ? bh.bottomMargin : 10, (v) => { bh.bottomMargin = v; render(); })));
      bhBody.push(fieldRow('Inner padding', numberInput(bh.innerPadding != null ? bh.innerPadding : 16, (v) => { bh.innerPadding = v; render(); })));
    } else if (bhLayout === 'shapes') {
      bhBody.push(fieldRow('Shape size', numberInput(bh.shapeSize, (v) => { bh.shapeSize = v; render(); })));
    } else {
      bhBody.push(fieldRow('Button width', numberInput(bh.buttonWidth, (v) => { bh.buttonWidth = v; render(); })));
      bhBody.push(fieldRow('Fill', checkInput(bh.fill, (v) => { bh.fill = v; render(); })));
      bhBody.push(fieldRow('Outline', checkInput(bh.outline, (v) => { bh.outline = v; render(); })));
      bhBody.push(fieldRow('Draw empty', checkInput(bh.drawEmpty, (v) => { bh.drawEmpty = v; render(); })));
      bhBody.push(fieldRow('Text offset Y', numberInput(bh.textOffsetY, (v) => { bh.textOffsetY = v; render(); })));
    }
    panel.appendChild(section('Button Hints', bhBody, false));

    // --- Icon assets (generated by the firmware-repo CI script) ---
    const iconBody = [];
    iconBody.push(el('p', { class: 'text-[11px] text-stone-500' }, ['Icons are converted to firmware-exact 1-bit BMPs by the official CrossPoint Python script (run in CI) — not in the browser. Leave all blank to use the standard Lyra icon set, or upload custom SVG/PNG icons to override individual keys.']));
    const grid = el('div', { class: 'mt-2 grid grid-cols-2 gap-x-4 gap-y-1' }, ICON_KEYS.map((key) => {
      const label = el('span', { class: 'text-xs text-stone-600' }, [key]);
      const input = el('input', { type: 'file', accept: '.svg,.png,image/svg+xml,image/png', class: 'block w-full text-[11px] text-stone-500 file:mr-2 file:rounded file:border-0 file:bg-stone-100 file:px-2 file:py-0.5 file:text-[11px] file:font-medium file:text-stone-700 hover:file:bg-stone-200', onchange: (e) => { state.customIcons[key] = e.target.files[0] || undefined; if (!e.target.files[0]) delete state.customIcons[key]; } });
      return el('label', { class: 'flex flex-col gap-0.5 py-1' }, [label, input]);
    }));
    iconBody.push(grid);
    iconBody.push(el('button', { type: 'button', class: 'mt-3 rounded-md bg-stone-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700', onclick: startIconBuild }, ['Build icons via CI']));
    iconBody.push(el('div', { id: 'iconStatus', class: 'mt-2 text-xs' }, []));
    panel.appendChild(section('Icon Assets', iconBody, false));

    // --- Metrics ---
    const metricGroups = {
      Home: ['homeTopPadding', 'homeCoverHeight', 'homeCoverTileHeight', 'homeRecentBooksCount', 'homeContinueReadingInMenu', 'homeShowContinueReadingHeader', 'homeMenuTopOffset', 'menuRowHeight', 'menuSpacing'],
      'Global layout': ['topPadding', 'headerHeight', 'verticalSpacing', 'contentSidePadding', 'buttonHintsHeight', 'sideButtonHintsWidth'],
      Lists: ['listRowHeight', 'listWithSubtitleRowHeight', 'scrollBarWidth', 'scrollBarRightOffset'],
      Tabs: ['tabSpacing', 'tabBarHeight'],
    };
    for (const group in metricGroups) {
      panel.appendChild(section('Metrics · ' + group, metricGroups[group].map((key) => metricRow(key)), false));
    }

    refreshOutput();
    renderIconStatus();
  }

  function metricRow(key) {
    const isBool = typeof LYRA_METRICS[key] === 'boolean';
    const cur = metric(key);
    const control = isBool
      ? checkInput(cur, (v) => { setMetric(key, v); render(); refreshOutput(); markMetricRow(key); })
      : numberInput(cur, (v) => { setMetric(key, v); render(); refreshOutput(); markMetricRow(key); });
    const row = fieldRow(key, control);
    row.dataset.metric = key;
    if (key in (state.theme.metrics || {}) && state.theme.metrics[key] !== LYRA_METRICS[key]) {
      row.querySelector('span').classList.add('font-semibold', 'text-brand-700');
    }
    return row;
  }
  function markMetricRow(key) {
    const row = document.querySelector('[data-metric="' + key + '"]');
    if (!row) return;
    const span = row.querySelector('span');
    if (state.theme.metrics[key] !== LYRA_METRICS[key]) span.classList.add('font-semibold', 'text-brand-700');
    else span.classList.remove('font-semibold', 'text-brand-700');
  }
  function setMetric(key, value) {
    if (!state.theme.metrics) state.theme.metrics = {};
    state.theme.metrics[key] = value;
  }

  function renderIconStatus() {
    const box = $('iconStatus');
    if (!box) return;
    box.innerHTML = '';
    const b = state.iconBuild;
    if (!b) return;
    if (b.status === 'pending' || b.status === 'building') {
      box.appendChild(el('div', { class: 'text-stone-500' }, ['⏳ Building icons in CI… this runs the firmware script and can take a minute.']));
    } else if (b.status === 'success') {
      box.appendChild(el('div', { class: 'text-brand-600' }, ['✓ Generated ' + (b.outputs || []).length + ' BMP icon(s). They will be bundled into the package zip.']));
    } else if (b.status === 'failed') {
      box.appendChild(el('div', { class: 'text-red-600' }, ['✕ Icon build failed: ' + (b.error || 'unknown error')]));
    }
    refreshOutput();
  }

  function update() { rerenderControls(); render(); }

  function refreshOutput() {
    const json = buildThemeJson();
    $('jsonOutput').textContent = JSON.stringify(json, null, 2);
    const { errors, warnings } = validate();
    const box = $('validation');
    box.innerHTML = '';
    if (errors.length === 0 && warnings.length === 0) {
      box.appendChild(el('div', { class: 'text-xs text-brand-600' }, ['✓ Theme is valid.']));
    }
    errors.forEach((e) => box.appendChild(el('div', { class: 'text-xs text-red-600' }, ['✕ ' + e])));
    warnings.forEach((w) => box.appendChild(el('div', { class: 'text-xs text-amber-600' }, ['⚠ ' + w])));
    render();
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  function applyBuilt(built) {
    state.theme = { meta: built.meta, metrics: built.metrics || {}, components: built.components };
    state.selectedIndex = 0;
    update();
  }

  // Preset values:
  //   "lyra"          -> built-in firmware default (no SD theme to fetch)
  //   "sd:<id>"       -> fetched live from /themes/<id>/theme.json (the repo,
  //                      via the Worker proxy — single source of truth)
  //   "fallback:<k>"  -> baked-in copy, only used if the live manifest fails
  async function loadPreset(value) {
    if (!value || value === 'lyra') { applyBuilt(PRESETS.lyra.build()); return; }
    if (value.indexOf('fallback:') === 0) {
      const k = value.slice('fallback:'.length);
      if (PRESETS[k]) applyBuilt(PRESETS[k].build());
      return;
    }
    if (value.indexOf('sd:') === 0) {
      const id = value.slice('sd:'.length);
      try {
        const res = await fetch('/themes/' + encodeURIComponent(id) + '/theme.json');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        importTheme(await res.json());
      } catch (err) {
        alert('Could not load "' + id + '" from the repo: ' + err.message);
      }
    }
  }

  // Populate the preset dropdown from the live theme manifest (the same
  // /themes/themes.json the device downloads). Falls back to the baked-in
  // preset names if the manifest can't be fetched (e.g. offline).
  async function populatePresets() {
    const sel = $('presetSelect');
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: 'lyra' }, ['Lyra (default, built-in)']));
    try {
      const res = await fetch('/themes/themes.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      (data.themes || []).forEach((t) => sel.appendChild(el('option', { value: 'sd:' + t.id }, [(t.name || t.id) + ' — live'])));
    } catch (err) {
      Object.keys(PRESETS).filter((k) => k !== 'lyra').forEach((k) =>
        sel.appendChild(el('option', { value: 'fallback:' + k }, [PRESETS[k].name + ' — offline copy'])));
    }
  }

  function importTheme(obj) {
    const known = ['schema', 'id', 'name', 'description', 'inherits', 'metrics', 'components', 'assets', 'devices', 'extensions', 'requires'];
    const extra = {};
    for (const k in obj) if (!known.includes(k)) extra[k] = obj[k];
    state.theme = {
      meta: { id: obj.id || 'imported-theme', name: obj.name || 'Imported Theme', description: obj.description || '' },
      metrics: obj.metrics || {},
      components: Object.assign({ homeRecents: { type: 'default' }, homeMenu: clone(DEFAULT_HOME_MENU), list: clone(DEFAULT_LIST), buttonHints: clone(DEFAULT_BUTTON_HINTS) }, obj.components || {}),
      extensions: obj.extensions,
      _extra: Object.keys(extra).length ? extra : undefined,
    };
    state.selectedIndex = 0;
    update();
  }

  function init() {
    canvas = $('deviceCanvas');
    r = new Renderer(canvas.getContext('2d'));
    preloadIcons();

    // preset selector — populated live from the repo manifest
    const presetSel = $('presetSelect');
    presetSel.addEventListener('change', (e) => loadPreset(e.target.value));
    $('loadPresetBtn').addEventListener('click', () => loadPreset(presetSel.value));
    populatePresets();

    // device + surface tabs
    document.querySelectorAll('[data-device]').forEach((b) => b.addEventListener('click', () => {
      state.device = b.dataset.device;
      document.querySelectorAll('[data-device]').forEach((x) => x.classList.toggle('bg-brand-600', x === b));
      document.querySelectorAll('[data-device]').forEach((x) => x.classList.toggle('text-white', x === b));
      document.querySelectorAll('[data-device]').forEach((x) => x.classList.toggle('text-stone-600', x !== b));
      render();
    }));
    document.querySelectorAll('[data-surface]').forEach((b) => b.addEventListener('click', () => {
      state.surface = b.dataset.surface;
      state.selectedIndex = 0;
      document.querySelectorAll('[data-surface]').forEach((x) => x.classList.toggle('bg-stone-900', x === b));
      document.querySelectorAll('[data-surface]').forEach((x) => x.classList.toggle('text-white', x === b));
      document.querySelectorAll('[data-surface]').forEach((x) => x.classList.toggle('text-stone-600', x !== b));
      render();
    }));

    // selection nav
    $('selPrev').addEventListener('click', () => { state.selectedIndex--; render(); });
    $('selNext').addEventListener('click', () => { state.selectedIndex++; render(); });

    // export buttons
    $('copyJsonBtn').addEventListener('click', () => {
      navigator.clipboard.writeText(JSON.stringify(buildThemeJson(), null, 2));
      flash($('copyJsonBtn'), 'Copied!');
    });
    $('downloadJsonBtn').addEventListener('click', () => {
      download(new Blob([JSON.stringify(buildThemeJson(), null, 2)], { type: 'application/json' }), (state.theme.meta.id || 'theme') + '.json');
    });
    $('downloadZipBtn').addEventListener('click', async () => {
      const btn = $('downloadZipBtn');
      const id = state.theme.meta.id || 'theme';
      const json = JSON.stringify(buildThemeJson(), null, 2);
      const files = [{ name: id + '/theme.json', data: json }];
      try {
        if (iconsReady()) {
          flash(btn, 'Fetching icons…');
          const icons = await fetchGeneratedIcons();
          for (const ic of icons) files.push({ name: id + '/icons/' + ic.name, data: ic.data });
        }
      } catch (err) {
        alert('Could not fetch generated icons: ' + err.message + '\nExporting theme.json only.');
      }
      download(makeZip(files), id + '.zip');
    });
    $('writeAll').addEventListener('change', (e) => { state.writeAllMetrics = e.target.checked; refreshOutput(); });

    // import
    $('importInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try { importTheme(JSON.parse(reader.result)); }
        catch (err) { alert('Could not parse theme.json: ' + err.message); }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // Optional deep-link: ?preset=&device=&surface= (handy for testing/sharing)
    const params = new URLSearchParams(location.search);
    if (params.get('device') === 'x3' || params.get('device') === 'x4') state.device = params.get('device');
    if (['home', 'settings', 'files', 'hints'].includes(params.get('surface'))) state.surface = params.get('surface');
    const p = params.get('preset');
    loadPreset(!p || p === 'lyra' ? 'lyra' : 'sd:' + p);
    syncTabs();

    // Restore a previously completed icon build (cookie-scoped) if present.
    fetch('/api/theme-build/status', { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((data) => { if (data && data.build) { state.iconBuild = data.build; renderIconStatus(); if (['pending', 'building'].includes(data.build.status)) pollIconBuild(); } })
      .catch(() => {});
  }

  // Reflect state.device / state.surface onto the tab button styles.
  function syncTabs() {
    document.querySelectorAll('[data-device]').forEach((x) => {
      const on = x.dataset.device === state.device;
      x.classList.toggle('bg-brand-600', on);
      x.classList.toggle('text-white', on);
      x.classList.toggle('text-stone-600', !on);
    });
    document.querySelectorAll('[data-surface]').forEach((x) => {
      const on = x.dataset.surface === state.surface;
      x.classList.toggle('bg-stone-900', on);
      x.classList.toggle('text-white', on);
      x.classList.toggle('text-stone-600', !on);
    });
  }

  function flash(btn, text) {
    const orig = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = orig; }, 1200);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
