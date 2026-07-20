/* CrossPoint Theme Builder (v2 — screens + widgets)
 *
 * A client-side, browser-based builder for CrossPoint SD-card themes
 * (schema version 1, inherits "lyra"). It edits a theme model, renders a
 * faithful device mockup on a canvas using the same layout math as the
 * firmware's ThemeLayout + ThemeHomeRenderer, and exports a firmware-compatible
 * theme.json / theme package zip.
 *
 * This targets the new firmware theme system documented in
 * crosspoint-reader-main/docs/theme-creation.md:
 *   - top-level `constraints` (screen size) and `version`
 *   - `components`: homeRecents, homeMenu, list, header, tabBar, buttonHints
 *   - `screens.<screen>`: a row/column `layout` slot tree, `widgets`, home
 *     `navigation` mode, and reader `chrome`
 *   - fonts named small / medium / large (+ semantic aliases)
 *
 * Grounded in firmware source: ThemeLayout.{h,cpp}, BaseTheme.h (struct
 * defaults + LyraMetrics), ThemeHomeRenderer.cpp.
 *
 * Loaded as an ES module by the React page (src/pages/ThemeBuilderPage.jsx),
 * which calls initThemeBuilder() after the markup has mounted.
 */
  'use strict';

  // ---------------------------------------------------------------------------
  // Base metrics: values inherited from the firmware "lyra" theme
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

  // Component defaults (firmware BaseTheme.h struct defaults). Used as the
  // editable starting point. Fonts use the new small/medium/large names.
  const DEFAULT_HOME_MENU = {
    font: 'large', style: 'regular', centeredText: false, centerVertically: false,
    showIcons: true, panelWidth: 0, drawPanel: false, panelCornerRadius: 3,
    selectionStyle: 'fill', selectionCornerRadius: 6, selectionInset: 16,
    selectedTextInverted: false, selectionFillBlack: false, rowPaddingX: 16, textInsetX: 16,
  };
  const DEFAULT_LIST = {
    font: 'medium', style: 'regular', showIcons: true, iconSize: 0, textGap: 8,
    selectionStyle: 'fill', selectionCornerRadius: 6, selectionFill: true, selectionOutline: false,
    selectedTextInverted: false, rowBackgrounds: false, centerSingleLineRows: false,
    rowSidePadding: 0, textInsetX: 8, selectionInsetX: 0, selectionInsetY: 0,
    titleOffsetY: 7, subtitleOffsetY: 30, valueOffsetY: 6,
    subtitleValueOffsetY: 16, iconOffsetY: 0,
  };
  const DEFAULT_HEADER = {
    font: 'large', style: 'bold', centeredTitle: false, showDivider: true,
    titleOffsetY: 0, batteryOffsetY: 5,
  };
  const DEFAULT_TABBAR = {
    font: 'medium', style: 'regular', equalWidth: false, selectionStyle: 'fill',
    selectedCornerRadius: 6, selectedTextInverted: true, drawDivider: true, horizontalInset: 2,
  };
  const DEFAULT_BUTTON_HINTS = {
    font: 'small', style: 'regular',
    // layout: 'buttons' (fixed per-key tabs) | 'shapes'/'icons' (icon-only
    // arrows/circle/square) | 'groups' (two rounded pill groups). Mirrors the
    // firmware's ThemeButtonHintsStyle. `shapes:true` is the legacy form.
    layout: 'buttons',
    buttonWidth: 80, smallButtonHeight: 15, cornerRadius: 6,
    fill: true, outline: true, drawEmpty: true, shapes: false, shapeSize: 18,
    sidePadding: 20, groupGap: 10, bottomMargin: 10, innerPadding: 16,
    textOffsetY: 7,
  };
  const DEFAULT_READER_CHROME = { battery: { style: 'icon', showPercentage: true } };

  // Default launcher actions shown on home.
  const DEFAULT_LAUNCHER_ITEMS = [
    { text: 'Browse Files', icon: 'folder', action: 'activity:fileBrowser' },
    { text: 'Recent Books', icon: 'recent', action: 'activity:recentBooks' },
    { text: 'Remote Library', icon: 'library', action: 'activity:opds' },
    { text: 'File Transfer', icon: 'transfer', action: 'activity:fileTransfer' },
    { text: 'Settings', icon: 'settings', action: 'activity:settings' },
  ];
  const LAUNCHER_ACTIONS = [
    'activity:fileBrowser', 'activity:recentBooks', 'activity:opds',
    'activity:fileTransfer', 'activity:settings', 'activity:reader', 'reader:recent',
  ];

  // ---------------------------------------------------------------------------
  // Fonts. The new firmware font ids are small / medium / large, with semantic
  // aliases. small = NotoSans 8, medium = Ubuntu 10, large = Ubuntu 12, taken
  // from the firmware font descriptors (advanceY = line height) at native
  // resolution (also our canvas resolution). `size` is the canvas px (≈
  // ascender); `lh` is advanceY.
  // ---------------------------------------------------------------------------
  const FONTS = {
    small: { size: 17, lh: 23 },
    medium: { size: 19, lh: 24 },
    large: { size: 23, lh: 29 },
  };
  const FONT_ALIASES = {
    chrome: 'small', caption: 'small', body: 'medium', label: 'medium',
    title: 'large', display: 'large',
    // legacy ids from the previous builder / firmware fontId numbers
    ui10: 'medium', ui12: 'large', 8: 'small', 10: 'medium', 12: 'large',
  };
  function canonFont(id) { return FONTS[id] ? id : (FONT_ALIASES[id] || 'medium'); }
  function fontInfo(id) { return FONTS[canonFont(id)]; }
  const FONT_CHOICES = ['small', 'medium', 'large'];

  // ---------------------------------------------------------------------------
  // Default screen set. A new theme starts fully populated so the slot-tree and
  // widget editors have content and the export matches the shipped themes.
  // ---------------------------------------------------------------------------
  function defaultScreens() {
    return {
      home: {
        navigation: 'linear',
        layout: {
          axis: 'column', gap: 0, slots: [
            { id: 'top', fixed: 5 },
            {
              id: 'header', fixed: 84, axis: 'row', gap: 4, slots: [
                { id: 'homeClock', fixed: 64 },
                { id: 'homeTitle', flex: 1 },
                { id: 'homeBattery', fixed: 66 },
              ],
            },
            { id: 'recents', fixed: 242 },
            { id: 'homeMenuGap', fixed: 16 },
            { id: 'launchers', flex: 1 },
            { id: 'buttons', fixed: 40 },
          ],
        },
        widgets: [
          { slot: 'homeClock', type: 'clock', inset: { left: 12 } },
          { slot: 'homeTitle', type: 'headerTitle' },
          { slot: 'homeBattery', type: 'battery', inset: { right: 12 } },
          { slot: 'recents', type: 'recents' },
          { slot: 'launchers', type: 'launcherList', items: clone(DEFAULT_LAUNCHER_ITEMS) },
          { slot: 'buttons', type: 'buttonHints', labels: {} },
        ],
      },
      fileBrowser: {
        layout: {
          axis: 'column', gap: 8, slots: [
            { id: 'header', fixed: 84 },
            { id: 'list', flex: 1 },
            { id: 'path', fixed: 14 },
            { id: 'buttons', fixed: 40 },
          ],
        },
        widgets: [{ slot: 'list', type: 'list' }],
      },
      recentBooks: {
        layout: {
          axis: 'column', gap: 8, slots: [
            { id: 'header', fixed: 84 },
            { id: 'list', flex: 1 },
            { id: 'buttons', fixed: 40 },
          ],
        },
        widgets: [{ slot: 'list', type: 'list' }],
      },
      settings: {
        layout: {
          axis: 'column', gap: 0, slots: [
            { id: 'header', fixed: 84 },
            { id: 'tabs', fixed: 40 },
            { id: 'gap', fixed: 16 },
            { id: 'list', flex: 1 },
            { id: 'buttons', fixed: 40 },
          ],
        },
        widgets: [],
      },
      reader: {
        layout: {
          axis: 'row', gap: 8, slots: [
            { id: 'bookmark', fixed: 18 },
            { id: 'battery', fixed: 38 },
            { id: 'title', flex: 1 },
            { id: 'clock', fixed: 42 },
            { id: 'progress', fixed: 82 },
          ],
        },
        chrome: clone(DEFAULT_READER_CHROME),
      },
    };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function newTheme() {
    return {
      meta: { id: 'my-theme', name: 'My Theme', description: '', version: 1 },
      inherits: 'lyra',
      constraints: { screenWidth: 480, screenHeight: 800 },
      metrics: {},
      components: {
        homeRecents: { type: 'default' },
        homeMenu: clone(DEFAULT_HOME_MENU),
        list: clone(DEFAULT_LIST),
        header: clone(DEFAULT_HEADER),
        tabBar: clone(DEFAULT_TABBAR),
        buttonHints: clone(DEFAULT_BUTTON_HINTS),
      },
      screens: defaultScreens(),
      includeHeader: false, // emit components.header only when on
      includeTabBar: false, // emit components.tabBar only when on
    };
  }

  // ---------------------------------------------------------------------------
  // App state
  // ---------------------------------------------------------------------------
  const state = {
    device: 'x3',           // active preview device
    surface: 'home',        // home | fileBrowser | recentBooks | settings | reader
    selectedIndex: 0,       // simulated selection for the active surface
    writeAllMetrics: false, // export every metric vs only diffs
    hasOpds: true,          // home menu shows OPDS/library item
    theme: null,
    customIcons: {},        // icon key -> File (custom SVG/PNG upload)
    iconBuild: null,        // { status, outputs, log, error } from the CI build
  };

  // Icon keys the firmware understands (theme.json assets.icons). "settings"
  // maps to the firmware's settings2.bmp; everything else is key.bmp.
  const ICON_KEYS = ['book', 'book24', 'bookmark', 'cover', 'file24', 'folder', 'folder24', 'hotspot', 'image24', 'library', 'recent', 'settings', 'text24', 'transfer', 'wifi'];

  // Effective metric = override if present else Lyra base.
  function metric(key) {
    const m = state.theme.metrics;
    return (m && key in m) ? m[key] : LYRA_METRICS[key];
  }

  // ---------------------------------------------------------------------------
  // Layout engine: mirrors firmware ThemeLayout. A node has an axis (column |
  // row), a gap, and slots; each slot is sized fixed | token | flex along the
  // parent axis and fills the cross axis. computeLayout returns id -> rect.
  // ---------------------------------------------------------------------------
  const TOKEN_METRIC = {
    topPadding: 'topPadding', header: 'headerHeight', tabBar: 'tabBarHeight',
    tabs: 'tabBarHeight', footer: 'buttonHintsHeight', buttons: 'buttonHintsHeight',
    buttonHints: 'buttonHintsHeight', row: 'listRowHeight',
    subtitleRow: 'listWithSubtitleRowHeight', menuRow: 'menuRowHeight',
    recents: 'homeCoverTileHeight', cover: 'homeCoverHeight',
    verticalSpacing: 'verticalSpacing', gap: 'verticalSpacing',
    progress: 'progressBarHeight',
  };
  function resolveToken(name) {
    const key = TOKEN_METRIC[name];
    return key ? metric(key) : 0;
  }
  // The active sizing of a node: returns {type, value(px for fixed/token), flex}.
  function nodeSizing(node) {
    if (typeof node.fixed === 'number') return { type: 'fixed', value: node.fixed };
    if (node.token) return { type: 'token', value: resolveToken(node.token) };
    return { type: 'flex', flex: node.flex != null ? node.flex : 1 };
  }
  function computeLayout(node, rect, out) {
    out = out || {};
    if (node.id) out[node.id] = rect;
    const slots = node.slots || [];
    if (!slots.length) return out;
    const axis = node.axis || 'column';
    const gap = node.gap || 0;
    const total = axis === 'row' ? rect.width : rect.height;
    let used = 0, flexTotal = 0;
    const sizes = slots.map((c) => {
      const s = nodeSizing(c);
      if (s.type === 'flex') { flexTotal += s.flex; return null; }
      used += s.value; return s.value;
    });
    const gaps = gap * Math.max(0, slots.length - 1);
    let remaining = Math.max(0, total - used - gaps);
    for (let i = 0; i < slots.length; i++) {
      if (sizes[i] == null) {
        const s = nodeSizing(slots[i]);
        sizes[i] = flexTotal > 0 ? Math.round((remaining * s.flex) / flexTotal) : 0;
      }
    }
    let pos = axis === 'row' ? rect.x : rect.y;
    for (let i = 0; i < slots.length; i++) {
      const len = sizes[i];
      const childRect = axis === 'row'
        ? { x: pos, y: rect.y, width: len, height: rect.height }
        : { x: rect.x, y: pos, width: rect.width, height: len };
      computeLayout(slots[i], childRect, out);
      pos += len + gap;
    }
    return out;
  }
  // Apply a widget's placement (offsetX/offsetY/inset/bleed) to its slot rect.
  function edge(v, side) {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    return v[side] || 0;
  }
  function widgetRect(w, rect) {
    if (!rect) return null;
    let { x, y, width, height } = rect;
    x += (w.offsetX || 0); y += (w.offsetY || 0);
    x += edge(w.inset, 'left'); y += edge(w.inset, 'top');
    width -= edge(w.inset, 'left') + edge(w.inset, 'right');
    height -= edge(w.inset, 'top') + edge(w.inset, 'bottom');
    x -= edge(w.bleed, 'left'); y -= edge(w.bleed, 'top');
    width += edge(w.bleed, 'left') + edge(w.bleed, 'right');
    height += edge(w.bleed, 'top') + edge(w.bleed, 'bottom');
    return { x, y, width: Math.max(0, width), height: Math.max(0, height) };
  }

  // ---------------------------------------------------------------------------
  // Canvas renderer: a small GfxRenderer-like surface in device space.
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
      lines[maxLines - 1] = this.truncatedText(id, lines[maxLines - 1], maxWidth, style);
    }
    return lines.slice(0, maxLines);
  };
  Renderer.prototype.drawText = function (id, x, y, text, black, style) {
    const f = fontInfo(id);
    this.ctx.font = this._font(id, style);
    this.ctx.fillStyle = black === false ? '#fff' : '#000';
    this.ctx.textBaseline = 'top';
    this.ctx.fillText(text || '', x, y + (f.lh - f.size) / 2 - 1);
  };
  Renderer.prototype.fillRect = function (x, y, w, h, black) {
    this.ctx.fillStyle = black === false ? '#fff' : '#000';
    this.ctx.fillRect(x, y, w, h);
  };
  Renderer.prototype.fillRectGray = function (x, y, w, h) {
    this.ctx.fillStyle = GRAY;
    this.ctx.fillRect(x, y, w, h);
  };
  Renderer.prototype.drawRect = function (x, y, w, h, black) {
    this.ctx.strokeStyle = black === false ? '#fff' : '#000';
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
    this.ctx.fillStyle = color === 'gray' ? GRAY : (color === 'white' ? '#fff' : '#000');
    this.ctx.fill();
  };
  Renderer.prototype.drawRoundedRect = function (x, y, w, h, lw, r, black) {
    this._roundPath(x + 0.5, y + 0.5, w - 1, h - 1, r);
    this.ctx.strokeStyle = black === false ? '#fff' : '#000';
    this.ctx.lineWidth = lw || 1;
    this.ctx.stroke();
  };
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
    this.ctx.fillStyle = color === 'gray' ? GRAY : (color === 'white' ? '#fff' : '#000');
    this.ctx.fill();
  };
  Renderer.prototype.drawRoundedRectCorners = function (x, y, w, h, lw, r, c, black) {
    this._roundPathCorners(x + 0.5, y + 0.5, w - 1, h - 1, r, c);
    this.ctx.strokeStyle = black === false ? '#fff' : '#000';
    this.ctx.lineWidth = lw || 1;
    this.ctx.stroke();
  };
  Renderer.prototype.drawLine = function (x1, y1, x2, y2, lw, black) {
    this.ctx.strokeStyle = black === false ? '#fff' : '#000';
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
    c.fillStyle = black === false ? '#fff' : '#000';
    c.fill();
  };

  // Simple monochrome icon glyphs (vector approximations of the SD icons),
  // used as a fallback while the real BMPs load.
  function drawIconGlyph(ctx, name, x, y, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#000';
    ctx.lineWidth = Math.max(1.5, size / 14);
    ctx.lineJoin = 'round';
    const s = size;
    const p = s * 0.16;
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
      case 'folder': case 'folder24':
        ctx.beginPath();
        ctx.moveTo(p, p + h * 0.18); ctx.lineTo(p + w * 0.42, p + h * 0.18);
        ctx.lineTo(p + w * 0.52, p + h * 0.32); ctx.lineTo(p + w, p + h * 0.32);
        ctx.lineTo(p + w, p + h); ctx.lineTo(p, p + h); ctx.closePath(); ctx.stroke();
        break;
      case 'book': case 'book24': case 'cover':
        rr(p + w * 0.18, p, w * 0.64, h, s * 0.06); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p + w * 0.18, p + h * 0.12); ctx.lineTo(p + w * 0.82, p + h * 0.12); ctx.stroke();
        break;
      case 'recent':
        ctx.beginPath(); ctx.arc(s / 2, s / 2, w / 2, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(s / 2, s / 2); ctx.lineTo(s / 2, p + h * 0.28);
        ctx.moveTo(s / 2, s / 2); ctx.lineTo(p + w * 0.72, s / 2 + h * 0.1); ctx.stroke();
        break;
      case 'settings': {
        ctx.beginPath(); ctx.arc(s / 2, s / 2, w * 0.22, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(s / 2, s / 2, w * 0.44, 0, Math.PI * 2);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.moveTo(s / 2 + Math.cos(a) * w * 0.44, s / 2 + Math.sin(a) * w * 0.44);
          ctx.lineTo(s / 2 + Math.cos(a) * w * 0.5, s / 2 + Math.sin(a) * w * 0.5);
        }
        ctx.stroke(); break;
      }
      case 'transfer':
        ctx.beginPath();
        ctx.moveTo(p, p + h * 0.35); ctx.lineTo(p + w, p + h * 0.35);
        ctx.moveTo(p + w - h * 0.25, p + h * 0.1); ctx.lineTo(p + w, p + h * 0.35); ctx.lineTo(p + w - h * 0.25, p + h * 0.6);
        ctx.moveTo(p + w, p + h * 0.75); ctx.lineTo(p, p + h * 0.75);
        ctx.moveTo(p + h * 0.25, p + h * 0.5); ctx.lineTo(p, p + h * 0.75); ctx.lineTo(p + h * 0.25, p + h);
        ctx.stroke(); break;
      case 'library':
        for (let i = 0; i < 3; i++) { rr(p + i * (w / 3), p + (i === 1 ? h * 0.08 : 0), w / 3 - s * 0.04, h - (i === 1 ? h * 0.08 : 0), s * 0.03); ctx.stroke(); }
        break;
      case 'wifi':
        for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.arc(s / 2, p + h * 0.85, (w / 2) * (i / 3), Math.PI * 1.15, Math.PI * 1.85); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(s / 2, p + h * 0.85, 1.5, 0, Math.PI * 2); ctx.fill(); break;
      case 'text': case 'text24':
        ctx.beginPath();
        ctx.moveTo(p, p + h * 0.2); ctx.lineTo(p + w, p + h * 0.2);
        ctx.moveTo(p, p + h * 0.45); ctx.lineTo(p + w, p + h * 0.45);
        ctx.moveTo(p, p + h * 0.7); ctx.lineTo(p + w * 0.6, p + h * 0.7);
        ctx.stroke(); break;
      case 'image': case 'image24':
        rr(p, p, w, h, s * 0.06); ctx.stroke();
        ctx.beginPath(); ctx.arc(p + w * 0.3, p + h * 0.32, w * 0.1, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p, p + h); ctx.lineTo(p + w * 0.4, p + h * 0.55); ctx.lineTo(p + w * 0.65, p + h * 0.78);
        ctx.lineTo(p + w * 0.8, p + h * 0.62); ctx.lineTo(p + w, p + h); ctx.stroke(); break;
      case 'file': case 'file24':
        ctx.beginPath();
        ctx.moveTo(p, p); ctx.lineTo(p + w * 0.65, p); ctx.lineTo(p + w, p + h * 0.3);
        ctx.lineTo(p + w, p + h); ctx.lineTo(p, p + h); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(p + w * 0.65, p); ctx.lineTo(p + w * 0.65, p + h * 0.3); ctx.lineTo(p + w, p + h * 0.3); ctx.stroke();
        break;
      default: rr(p, p, w, h, s * 0.08); ctx.stroke();
    }
    ctx.restore();
  }

  // Real icon assets: render the actual firmware 1-bit BMP icons (proxied at
  // /themes/<id>/icons/*.bmp). Vector glyphs remain a fallback while images load.
  const ICON_BMP_BASE = '/themes/carousel/icons/';
  const iconImages = {};
  function iconBmpFile(name) { return name === 'settings' ? 'settings2.bmp' : name + '.bmp'; }
  function resolveIconBmp(uiName, size) {
    const small = size <= 26;
    switch (uiName) {
      case 'folder': return small ? 'folder24' : 'folder';
      case 'book': return small ? 'book24' : 'book';
      case 'text': return 'text24';
      case 'image': return 'image24';
      case 'file': return 'file24';
      case 'settings': return 'settings';
      default: return uiName;
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
    { title: 'Mistborn', author: 'Brandon Sanderson' },
    { title: 'Hyperion', author: 'Dan Simmons' },
    { title: 'Neuromancer', author: 'William Gibson' },
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
  const SETTINGS_TABS = ['Reading', 'Display', 'System'];

  // ---------------------------------------------------------------------------
  // Component-level renderers (mirror LyraTheme draw* methods)
  // ---------------------------------------------------------------------------
  function headerSpec() { return state.theme.components.header || DEFAULT_HEADER; }

  // Draw a battery icon within a rect (right-aligned, vertically centered).
  function drawBatteryIcon(r, rect, pct) {
    const battW = metric('batteryWidth'), battH = metric('batteryHeight');
    const bx = rect.x + rect.width - battW - 2;
    const by = rect.y + Math.floor((rect.height - battH) / 2);
    r.drawRect(bx, by, battW, battH, true);
    r.fillRect(bx + 2, by + 2, Math.max(0, (battW - 5) * (pct / 100)), battH - 4, true);
    r.fillRect(bx + battW, by + 3, 2, battH - 6, true);
  }

  // Full page header: title (+ optional divider) and battery. Used by the
  // non-home screens and the home `header` widget.
  function drawHeader(r, rect, title, subtitle) {
    const spec = headerSpec();
    r.fillRect(rect.x, rect.y, rect.width, rect.height, false);
    const csp = metric('contentSidePadding');
    drawBatteryIcon(r, { x: rect.x, y: rect.y + (spec.batteryOffsetY || 0), width: rect.width - 12, height: Math.min(rect.height, 40) }, 78);
    if (title) {
      const lh = r.getLineHeight(spec.font);
      const ty = rect.y + Math.max(0, Math.floor((rect.height - lh) / 2)) + (spec.titleOffsetY || 0);
      let tx = rect.x + csp;
      if (spec.centeredTitle) {
        const tw = r.getTextWidth(spec.font, title, spec.style);
        tx = rect.x + Math.floor((rect.width - tw) / 2);
      }
      r.drawText(spec.font, tx, ty, title, true, spec.style);
      if (spec.showDivider) r.drawLine(rect.x, rect.y + rect.height - 3, rect.x + rect.width - 1, rect.y + rect.height - 3, 3, true);
    }
    if (subtitle) {
      const sw = r.getTextWidth('small', subtitle, 'regular');
      r.drawText('small', rect.x + rect.width - csp - sw, rect.y + Math.min(50, rect.height - 24), subtitle, true, 'regular');
    }
  }

  function drawTabBar(r, rect, tabs, selectedIndex) {
    const spec = state.theme.components.tabBar || DEFAULT_TABBAR;
    const inset = spec.horizontalInset || 0;
    const innerW = rect.width - inset * 2;
    const lh = r.getLineHeight(spec.font);
    const ty = rect.y + Math.floor((rect.height - lh) / 2);
    let x = rect.x + inset;
    const widths = tabs.map((t) => spec.equalWidth ? Math.floor(innerW / tabs.length) : r.getTextWidth(spec.font, t, spec.style) + 2 * metric('tabSpacing'));
    for (let i = 0; i < tabs.length; i++) {
      const w = widths[i];
      const sel = i === selectedIndex;
      const tw = r.getTextWidth(spec.font, tabs[i], spec.style);
      const tx = x + Math.floor((w - tw) / 2);
      if (sel) {
        if (spec.selectionStyle === 'fill') {
          r.fillRoundedRect(x, rect.y + 2, w, rect.height - 4, spec.selectedCornerRadius, 'black');
        }
      }
      const inverted = sel && spec.selectionStyle === 'fill' && spec.selectedTextInverted;
      r.drawText(spec.font, tx, ty, tabs[i], !inverted, spec.style);
      if (sel && spec.selectionStyle === 'underline') r.drawLine(tx, ty + lh + 2, tx + tw, ty + lh + 2, 2, true);
      x += w + metric('tabSpacing');
    }
    if (spec.drawDivider) r.drawLine(rect.x, rect.y + rect.height - 1, rect.x + rect.width - 1, rect.y + rect.height - 1, 1, true);
  }

  function drawCoverStrip(r, rect, spec, selected) {
    const csp = metric('contentSidePadding');
    const books = SAMPLE_BOOKS;
    const count = Math.min(metric('homeRecentBooksCount') || books.length, books.length);
    const slots = spec.slots || [];
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
      if (slot.x === 'padding') x = rect.x + csp;
      else if (slot.x === 'right-padding') x = rect.x + rect.width - csp - w;
      x += slot.xOffset || 0;
      let y = rect.y;
      if (slot.y === 'center') y = rect.y + Math.floor((rect.height - h) / 2);
      y += slot.yOffset || 0;
      const isSel = slot.selected && (slot.book !== 'index' || bi === selected);
      r.drawRect(x, y, w, h, true);
      r.fillRect(x, y + Math.floor(h / 3), w, h - Math.floor(h / 3), true);
      drawIcon(r.ctx, 'cover', x + Math.max(4, (w - 32) / 2), y + 16, 32);
      r.drawRect(x, y, w, h, true);
      if (isSel) {
        const lineWidth = Math.max(1, spec.selectionLineWidth || 2);
        for (let i = 0; i < lineWidth; i++) {
          r.drawRoundedRect(x - 6 - i, y - 6 - i, w + 12 + 2 * i, h + 12 + 2 * i, lineWidth, spec.selectionCornerRadius || 6, true);
        }
      } else if (spec.inactiveSelectionLineWidth > 0 && slot.selected) {
        r.drawRoundedRect(x - 6, y - 6, w + 12, h + 12, spec.inactiveSelectionLineWidth, spec.selectionCornerRadius || 6, true);
      }
      if (slot.title && slot.title.enabled) {
        const maxWidth = slot.title.fullWidth ? rect.width - 2 * csp : Math.max(40, w + 28);
        const lines = r.wrappedText(slot.title.font, books[bi].title, maxWidth, slot.title.maxLines || 2, slot.title.style);
        let ty = y + h + (slot.title.offsetY || 12);
        const cx = slot.title.fullWidth ? rect.x + rect.width / 2 : x + w / 2;
        for (const line of lines) {
          const tw = r.getTextWidth(slot.title.font, line, slot.title.style);
          r.drawText(slot.title.font, cx - tw / 2, ty, line, true, slot.title.style);
          ty += r.getLineHeight(slot.title.font);
        }
      }
    }
  }

  // Built-in default home recents: a single "Continue Reading" card.
  function drawDefaultRecents(r, rect) {
    const csp = metric('contentSidePadding');
    const coverH = Math.min(metric('homeCoverHeight'), rect.height - 16);
    const vSpacing = metric('verticalSpacing');
    const hPad = 8;
    const tileX = rect.x + csp;
    const tileWidth = rect.width - 2 * csp;
    const book = SAMPLE_BOOKS[0];
    const coverW = Math.round(coverH * 0.6);
    const cx = tileX + hPad, cy = rect.y + Math.floor((rect.height - coverH) / 2);
    r.drawRect(cx, cy, coverW, coverH, true);
    r.fillRect(cx, cy + Math.floor(coverH / 3), coverW, coverH - Math.floor(coverH / 3), true);
    drawIcon(r.ctx, 'cover', cx + 24, cy + 24, 32);
    r.drawRect(cx, cy, coverW, coverH, true);
    const textX = tileX + hPad + coverW + vSpacing;
    const textWidth = tileWidth - 2 * hPad - vSpacing - coverW;
    const titleLines = r.wrappedText('large', book.title, textWidth, 3, 'bold');
    const author = r.truncatedText('medium', book.author, textWidth);
    const titleLH = r.getLineHeight('large');
    const titleBlockH = titleLH * titleLines.length;
    const authorH = book.author ? Math.floor(r.getLineHeight('medium') * 3 / 2) : 0;
    let ty = rect.y + Math.floor(rect.height / 2 - (titleBlockH + authorH) / 2);
    for (const line of titleLines) { r.drawText('large', textX, ty, line, true, 'bold'); ty += titleLH; }
    if (book.author) { ty += Math.floor(r.getLineHeight('medium') / 2); r.drawText('medium', textX, ty, author, true, 'regular'); }
  }

  // Recents widget dispatch (cover-strip | default | none) into a slot rect.
  function drawRecents(r, rect, selector) {
    const recents = state.theme.components.homeRecents || { type: 'default' };
    if (recents.type === 'none') return;
    r.ctx.save();
    r.ctx.beginPath(); r.ctx.rect(rect.x, rect.y, rect.width, rect.height); r.ctx.clip();
    if (recents.type === 'cover-strip') drawCoverStrip(r, rect, recents, selector);
    else drawDefaultRecents(r, rect);
    r.ctx.restore();
  }

  // One-column themed home menu (launcherList, or one cell of a launcherGrid).
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
    const selInset = spec.selectionInset != null ? spec.selectionInset : 16;
    for (let i = 0; i < count; i++) {
      const sel = i === selectedIndex;
      let label = items[i].label != null ? items[i].label : items[i].text;
      const tile = { x: panelX + selInset, y: panelY + i * (menuRowHeight + menuSpacing), width: panelWidth - selInset * 2, height: menuRowHeight };
      const isPill = spec.selectionStyle === 'pill';
      if (isPill) {
        const maxLabelWidth = Math.max(0, panelWidth - selInset * 2 - rowPaddingX);
        label = r.truncatedText(spec.font, label, maxLabelWidth, spec.style);
        tile.width = Math.min(tile.width, r.getTextWidth(spec.font, label, spec.style) + rowPaddingX);
      }
      if (isPill) {
        r.fillRoundedRect(tile.x, tile.y, tile.width, tile.height, spec.selectionCornerRadius, sel ? 'black' : 'white');
      } else if (sel) {
        if (spec.selectionStyle === 'outline') r.drawRoundedRect(tile.x, tile.y, tile.width, tile.height, 1, spec.selectionCornerRadius, true);
        else if (spec.selectionStyle === 'triangle') {
          const tx = panelX + selInset, cy = tile.y + tile.height / 2;
          r.fillPolygon([tx, tx, tx + 12], [cy - 9, cy + 9, cy], 3, true);
        } else if (spec.selectionStyle === 'underline') { /* after text */ }
        else r.fillRoundedRect(tile.x, tile.y, tile.width, tile.height, spec.selectionCornerRadius, spec.selectionFillBlack ? 'black' : 'gray');
      }
      const inverted = sel && (spec.selectedTextInverted || isPill);
      const lh = r.getLineHeight(spec.font);
      const textY = tile.y + Math.floor((tile.height - lh) / 2);
      let textX = tile.x + textInsetX;
      if (spec.showIcons && items[i].icon) {
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

  // launcherGrid: grid of action cells. presentation 'iconTabs' = icon-only
  // outlined/filled tabs; otherwise each cell is a one-item themed menu.
  function drawLauncherGrid(r, rect, w, selectedIndex) {
    const items = w.items || DEFAULT_LAUNCHER_ITEMS;
    const cols = Math.max(1, w.columns || 1);
    const rows = Math.max(1, w.rows || Math.ceil(items.length / cols));
    const gap = w.gap || 0;
    const cellW = Math.floor((rect.width - gap * (cols - 1)) / cols);
    const cellH = Math.floor((rect.height - gap * (rows - 1)) / rows);
    for (let i = 0; i < items.length; i++) {
      const c = i % cols, rr = Math.floor(i / cols);
      if (rr >= rows) break;
      const cx = rect.x + c * (cellW + gap);
      const cy = rect.y + rr * (cellH + gap);
      const sel = i === selectedIndex;
      if (w.presentation === 'iconTabs') {
        // Icon-only tabs (matches firmware): outlined unselected, filled selected.
        const radius = w.selectedRadius != null ? w.selectedRadius : 5;
        const iconSize = Math.min(w.iconSize || 32, cellH - 6, cellW - 6);
        if (sel) r.fillRoundedRect(cx, cy, cellW, cellH, radius, 'black');
        else r.drawRoundedRect(cx, cy, cellW, cellH, 1, radius, true);
        const iconY = cy + Math.floor((cellH - iconSize) / 2);
        drawIcon(r.ctx, items[i].icon, cx + Math.floor((cellW - iconSize) / 2), iconY, iconSize, sel);
      } else {
        drawButtonMenu(r, { x: cx, y: cy, width: cellW, height: cellH }, [items[i]], sel ? 0 : -1);
      }
    }
  }

  // featuredBookCard: "Continue Reading" cover + title/author card.
  function drawFeaturedBookCard(r, rect, w, focused) {
    const book = SAMPLE_BOOKS[w.startIndex || 0] || SAMPLE_BOOKS[0];
    const coverW = w.coverWidth || 96, coverH = Math.min(w.coverHeight || 142, rect.height - (w.titleGap || 8));
    const coverGap = w.coverGap != null ? w.coverGap : 14;
    const titleGap = w.titleGap != null ? w.titleGap : 8;
    r.drawText('small', rect.x, rect.y, 'Continue Reading', true, 'regular');
    const top = rect.y + r.getLineHeight('small') + titleGap;
    const cx = rect.x, cy = top;
    r.drawRect(cx, cy, coverW, coverH, true);
    r.fillRect(cx, cy + Math.floor(coverH / 3), coverW, coverH - Math.floor(coverH / 3), true);
    drawIcon(r.ctx, 'cover', cx + Math.max(4, (coverW - 28) / 2), cy + 16, w.placeholderIconSize || 28);
    r.drawRect(cx, cy, coverW, coverH, true);
    if (focused) r.drawRoundedRect(cx - 4, cy - 4, coverW + 8, coverH + 8, 2, w.selectedRadius != null ? w.selectedRadius : 5, true);
    const textX = cx + coverW + coverGap;
    const textW = rect.x + rect.width - textX;
    const titleLines = r.wrappedText('large', book.title, textW, 3, 'bold');
    let ty = cy + 6;
    for (const line of titleLines) { r.drawText('large', textX, ty, line, true, 'bold'); ty += r.getLineHeight('large'); }
    ty += 6;
    r.drawText('medium', textX, ty, r.truncatedText('medium', book.author, textW), true, 'regular');
  }

  // coverGrid / recentCoverGrid: a grid of cover thumbnails with labels.
  function drawCoverGrid(r, rect, w, selectedIndex) {
    const cols = Math.max(1, w.columns || 1);
    const gap = w.gap || 0;
    const rowGap = w.rowGap != null && w.rowGap >= 0 ? w.rowGap : gap;
    const labelHeight = w.labelHeight != null ? w.labelHeight : 20;
    const labelGap = w.labelGap != null ? w.labelGap : 2;
    const labelLines = w.labelLines || 1;
    const start = w.startIndex || 0;
    const cellW = Math.floor((rect.width - gap * (cols - 1)) / cols);
    let coverH = w.coverHeight || 0;
    const rowHeight = w.rowHeight || ((coverH || 120) + Math.max(0, labelHeight) + 6);
    if (!coverH) coverH = Math.max(1, rowHeight - labelHeight - 6);
    let coverW = w.coverWidth || Math.max(1, Math.floor(coverH * 62 / 100));
    const rows = w.rows || Math.max(1, Math.floor((rect.height + rowGap) / (rowHeight + rowGap)));
    const total = Math.min(cols * rows, SAMPLE_BOOKS.length - start);
    const cellInsetTop = edge(w.cellInset, 'top');
    for (let i = 0; i < total; i++) {
      const c = i % cols, rr = Math.floor(i / cols);
      const book = SAMPLE_BOOKS[start + i]; if (!book) break;
      const cellX = rect.x + c * (cellW + gap);
      const cellY = rect.y + rr * (rowHeight + rowGap) + cellInsetTop;
      const coverX = cellX + Math.floor((cellW - coverW) / 2);
      const sel = i === selectedIndex;
      r.drawRect(coverX, cellY, coverW, coverH, true);
      r.fillRect(coverX, cellY + Math.floor(coverH / 3), coverW, coverH - Math.floor(coverH / 3), true);
      drawIcon(r.ctx, 'cover', coverX + Math.max(2, (coverW - (w.placeholderIconSize || 20)) / 2), cellY + 12, w.placeholderIconSize || 20);
      r.drawRect(coverX, cellY, coverW, coverH, true);
      if (sel) {
        const radius = w.selectedRadius || 0;
        if (w.selectionStyle === 'coverFrame' || !w.selectionStyle) {
          for (let k = 0; k < 2; k++) r.drawRoundedRect(coverX - 3 - k, cellY - 3 - k, coverW + 6 + 2 * k, coverH + 6 + 2 * k, 2, radius, true);
        } else if (w.selectionStyle === 'fill') {
          r.drawRoundedRect(cellX, cellY, cellW, rowHeight, 2, radius, true);
        } else if (w.selectionStyle === 'outline') {
          r.drawRoundedRect(cellX, cellY, cellW, coverH + labelHeight, 1, radius, true);
        }
      }
      if (labelHeight > 0) {
        const li = w.labelInset || {};
        const lx = cellX + edge(li, 'left');
        const lw = cellW - edge(li, 'left') - edge(li, 'right');
        const lines = r.wrappedText('small', book.title, lw, labelLines, 'regular');
        let ly = cellY + coverH + labelGap;
        for (const line of lines) {
          const tw = r.getTextWidth('small', line, 'regular');
          r.drawText('small', cellX + Math.floor((cellW - tw) / 2), ly, line, true, 'regular');
          ly += r.getLineHeight('small');
        }
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
      const scrollBarY = rect.y + Math.floor(((rect.height - scrollBarHeight) * currentPage) / Math.max(1, totalPages - 1));
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
        valueText = r.truncatedText('medium', row.value, 200);
        valueW = r.getTextWidth('medium', valueText) + hPad;
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
        const vy = centerSingle ? itemY + Math.floor((rowHeight - r.getLineHeight('medium')) / 2)
          : itemY + (hasSubtitle ? spec.subtitleValueOffsetY : spec.valueOffsetY);
        const valueX = rowBg ? rowX + rowWidth - textInsetX - valueW : rect.x + contentWidth - csp - valueW;
        r.drawText('medium', valueX, vy, valueText, !inverted, 'regular');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Button hints. Labels come from semantic tokens; we draw them as tabs,
  // shapes/icons, or pill groups inside a slot rect.
  // ---------------------------------------------------------------------------
  const HINT_TOKEN_TEXT = {
    back: 'Back', home: 'Home', select: 'Select', confirm: 'Confirm', open: 'Open',
    toggle: 'Toggle', up: 'Up', down: 'Down', left: 'Left', right: 'Right', empty: '', default: null,
  };
  function shapeForLabel(label) {
    if (!label) return 'none';
    const l = label.toLowerCase();
    if (['back', 'cancel', 'home'].includes(l)) return 'back';
    if (['select', 'confirm', 'ok', 'done', 'open', 'toggle'].includes(l)) return 'select';
    if (l === 'up') return 'up';
    if (l === 'down') return 'down';
    if (l === 'left' || label === '<' || label === '-') return 'left';
    if (l === 'right' || label === '>' || label === '+') return 'right';
    return 'none';
  }
  function drawHintShape(r, shape, cx, cy, size) {
    const half = Math.max(4, size / 2);
    if (shape === 'back') { r.fillRect(cx - half, cy - half, half * 2, half * 2, true); return; }
    if (shape === 'select') { r.ctx.beginPath(); r.ctx.fillStyle = '#000'; r.ctx.arc(cx, cy, half, 0, Math.PI * 2); r.ctx.fill(); return; }
    let xs, ys;
    if (shape === 'up') { xs = [cx, cx - half, cx + half]; ys = [cy - half, cy + half, cy + half]; }
    else if (shape === 'down') { xs = [cx - half, cx + half, cx]; ys = [cy - half, cy - half, cy + half]; }
    else if (shape === 'left') { xs = [cx - half, cx + half, cx + half]; ys = [cy, cy - half, cy + half]; }
    else if (shape === 'right') { xs = [cx + half, cx - half, cx - half]; ys = [cy, cy - half, cy + half]; }
    else return;
    r.fillPolygon(xs, ys, 3, true);
  }
  const TOP_CORNERS = { tl: true, tr: true, br: false, bl: false };
  function hintLayout(spec) { return spec.layout || (spec.shapes ? 'shapes' : 'buttons'); }

  // Resolve the 4 hardware-order labels [back, confirm, previous, next] for a
  // buttonHints widget, given its semantic-token overrides and the screen's
  // default fallbacks.
  function resolveHintLabels(widgetLabels, defaults) {
    const out = defaults.slice();
    if (!widgetLabels) return out;
    const order = ['back', 'confirm', 'previous', 'next'];
    order.forEach((key, i) => {
      const tok = widgetLabels[key];
      if (tok == null) return;
      const txt = HINT_TOKEN_TEXT[tok];
      if (txt === null) return;          // 'default' → keep fallback
      out[i] = txt;
    });
    return out;
  }

  // Draw 4 hint tabs/shapes/groups spread across the slot rect.
  function drawButtonHintsInSlot(r, rect, labels) {
    const spec = state.theme.components.buttonHints || DEFAULT_BUTTON_HINTS;
    const layout = hintLayout(spec);
    const cr = spec.cornerRadius;
    const bw = spec.buttonWidth || 80, bh = rect.height;
    if (layout === 'groups') {
      const sidePadding = spec.sidePadding != null ? spec.sidePadding : 20;
      const groupGap = spec.groupGap != null ? spec.groupGap : 10;
      const innerPadding = spec.innerPadding != null ? spec.innerPadding : 16;
      const groupWidth = Math.max(1, Math.floor((rect.width - sidePadding * 2 - groupGap) / 2));
      const leftX = rect.x + sidePadding, rightX = leftX + groupWidth + groupGap;
      r.drawRoundedRect(leftX, rect.y, groupWidth, bh, 2, cr, true);
      r.drawRoundedRect(rightX, rect.y, groupWidth, bh, 2, cr, true);
      const textY = rect.y + Math.round((bh - r.getLineHeight(spec.font)) / 2);
      const put = (label, gx, right) => {
        if (!label) return;
        const tw = r.getTextWidth(spec.font, label, spec.style);
        r.drawText(spec.font, right ? gx + groupWidth - innerPadding - tw : gx + innerPadding, textY, label, true, spec.style);
      };
      put(labels[0], leftX, false); put(labels[1], leftX, true);
      put(labels[2], rightX, false); put(labels[3], rightX, true);
      return;
    }
    const isShapes = layout === 'shapes' || layout === 'icons';
    // Four columns spread evenly across the slot.
    const cols = 4;
    const colW = rect.width / cols;
    for (let i = 0; i < cols; i++) {
      const center = rect.x + colW * (i + 0.5);
      const x = Math.round(center - bw / 2);
      const label = labels[i];
      if (label) {
        if (isShapes) { drawHintShape(r, shapeForLabel(label), center, rect.y + bh / 2, spec.shapeSize); continue; }
        if (spec.fill) r.fillRoundedRectCorners(x, rect.y, bw, bh, cr, TOP_CORNERS, 'white');
        if (spec.outline) r.drawRoundedRectCorners(x, rect.y, bw, bh, 1, cr, TOP_CORNERS, true);
        const tw = r.getTextWidth(spec.font, label, spec.style);
        const ty = rect.y + Math.round((bh - r.getLineHeight(spec.font)) / 2) + ((spec.textOffsetY || 0) - 7);
        r.drawText(spec.font, x + (bw - 1 - tw) / 2, ty, label, true, spec.style);
      } else if (spec.drawEmpty && !isShapes) {
        const sh = spec.smallButtonHeight;
        if (spec.fill) r.fillRoundedRectCorners(x, rect.y + bh - sh, bw, sh, cr, TOP_CORNERS, 'white');
        if (spec.outline) r.drawRoundedRectCorners(x, rect.y + bh - sh, bw, sh, 1, cr, TOP_CORNERS, true);
      }
    }
  }

  // Default hint labels per screen (hardware order [back, confirm, prev, next]).
  function defaultHintLabels(screen) {
    const nav = (state.theme.screens.home || {}).navigation;
    const horizontal = nav === 'splitAxis' || nav === 'carousel';
    const updown = horizontal ? ['Left', 'Right'] : ['Up', 'Down'];
    switch (screen) {
      case 'home': return ['', 'Select', updown[0], updown[1]];
      case 'fileBrowser': return ['Back', 'Open', 'Up', 'Down'];
      default: return ['Back', 'Select', 'Up', 'Down'];
    }
  }

  // ---------------------------------------------------------------------------
  // Widget dispatch + per-screen render
  // ---------------------------------------------------------------------------
  // The slot id of the focusable widget for selection simulation.
  function focusSlot(screen, spec) {
    const widgets = spec.widgets || [];
    if (screen === 'home') {
      if ((spec.navigation === 'carousel') ) {
        const rec = widgets.find((w) => w.type === 'recents' || w.type === 'recentCoverGrid');
        if (rec) return rec.slot;
      }
      const launch = widgets.find((w) => w.type === 'launcherList' || w.type === 'launcherGrid');
      if (launch) return launch.slot;
      const rec = widgets.find((w) => w.type === 'recents' || w.type === 'recentCoverGrid' || w.type === 'featuredBookCard');
      return rec ? rec.slot : null;
    }
    const list = widgets.find((w) => w.type === 'list' || w.type === 'coverGrid');
    return list ? list.slot : 'list';
  }

  function drawWidget(r, w, rect, screen, focused) {
    if (!rect) return;
    const sel = focused ? clamp(state.selectedIndex, 64) : -1;
    switch (w.type) {
      case 'clock':
        r.drawText('small', rect.x, rect.y + Math.floor((rect.height - r.getLineHeight('small')) / 2), '10:24', true, 'regular');
        break;
      case 'headerTitle': {
        const sp = headerSpec();
        const title = (metric('homeShowContinueReadingHeader')) ? 'CrossPoint' : '';
        if (title) r.drawText(sp.font, rect.x, rect.y + Math.floor((rect.height - r.getLineHeight(sp.font)) / 2), title, true, sp.style);
        break;
      }
      case 'header':
        drawHeader(r, rect, 'CrossPoint');
        break;
      case 'battery':
        drawBatteryIcon(r, rect, 78);
        break;
      case 'recents': {
        const recents = state.theme.components.homeRecents || { type: 'default' };
        const selector = recents.type === 'cover-strip' ? clamp(state.selectedIndex, Math.min(metric('homeRecentBooksCount') || SAMPLE_BOOKS.length, SAMPLE_BOOKS.length)) : 0;
        drawRecents(r, rect, focused ? selector : (recents.type === 'cover-strip' ? selector : 0));
        break;
      }
      case 'recentCoverGrid':
        drawCoverGrid(r, rect, w, focused ? clamp(state.selectedIndex, 64) : -1);
        break;
      case 'launcherList':
        drawButtonMenu(r, rect, launcherItems(w), focused ? clamp(state.selectedIndex, launcherItems(w).length) : -1);
        break;
      case 'launcherGrid':
        drawLauncherGrid(r, rect, w, focused ? clamp(state.selectedIndex, launcherItems(w).length) : -1);
        break;
      case 'featuredBookCard':
        drawFeaturedBookCard(r, rect, w, focused);
        break;
      case 'list':
        drawList(r, rect, listRowsFor(screen), sel >= 0 ? clamp(state.selectedIndex, listRowsFor(screen).length) : 0, listOptsFor(screen));
        break;
      case 'coverGrid':
        drawCoverGrid(r, rect, w, clamp(state.selectedIndex, 64));
        break;
      case 'buttonHints':
        drawButtonHintsInSlot(r, rect, resolveHintLabels(w.labels, defaultHintLabels(screen)));
        break;
      default:
        r.drawRect(rect.x, rect.y, rect.width, rect.height, true);
    }
  }

  function launcherItems(w) {
    let items = (w.items && w.items.length) ? w.items : DEFAULT_LAUNCHER_ITEMS;
    if (!state.hasOpds) items = items.filter((it) => it.action !== 'activity:opds');
    return items;
  }
  function listRowsFor(screen) {
    if (screen === 'settings') return SETTINGS_ROWS;
    if (screen === 'recentBooks') return SAMPLE_BOOKS.map((b) => ({ title: b.title, subtitle: b.author, icon: 'book' }));
    return FILE_ROWS;
  }
  function listOptsFor(screen) {
    if (screen === 'settings') return { icons: true, value: true };
    return { icons: true, subtitle: true };
  }

  // ---------------------------------------------------------------------------
  // Top-level render
  // ---------------------------------------------------------------------------
  let canvas, r;
  const PREVIEW_CSS_WIDTH = 360; // on-screen width of the simulated screen
  // 8×8 ordered (Bayer) dither matrix, 0..63.
  const BAYER8 = [
    0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
    12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
    3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
    15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
  ];
  // Snap the whole frame to pure black/white using ordered dithering, exactly
  // like a 1-bit e-ink panel: solid ink for text/lines, dot patterns for grays.
  function dither1bit(ctx, w, h) {
    let img;
    try { img = ctx.getImageData(0, 0, w, h); } catch (e) { return; }
    const d = img.data;
    for (let y = 0; y < h; y++) {
      const row = (y & 7) * 8;
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        const th = (BAYER8[row + (x & 7)] + 0.5) * (255 / 64);
        const v = lum < th ? 0 : 255;
        d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function render() {
    if (!canvas) return;
    // Logical panel dimensions in portrait (firmware UITheme.cpp):
    // X3 = 528×792 (UC8253), X4 = 480×800 (SSD1677).
    const W = state.device === 'x3' ? 528 : 480;
    const H = state.device === 'x3' ? 792 : 800;
    // Render into a backing buffer sized to actual on-screen pixels (CSS px ×
    // devicePixelRatio). Drawing in device units is mapped in with one scale,
    // so there is no second resample — text and 1px lines stay crisp.
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(3, Math.max(1, window.devicePixelRatio)) : 1;
    const cssW = PREVIEW_CSS_WIDTH;
    const cssH = Math.round(cssW * H / W);
    const bw = Math.round(cssW * dpr), bh = Math.round(cssH * dpr);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    const ctx = canvas.getContext('2d');
    const s = bw / W; // device units → backing pixels
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);

    const screen = state.surface;
    const spec = state.theme.screens[screen];

    if (screen === 'reader') {
      renderReader(W, H, spec);
    } else if (spec && spec.layout) {
      const slots = computeLayout(spec.layout, { x: 0, y: 0, width: W, height: H });

      // Synthesize a header widget for list screens that have a header slot but
      // no explicit header widget (matches firmware's default header drawing).
      const widgets = (spec.widgets || []).slice();
      const hasHeaderWidget = widgets.some((w) => w.slot === 'header');
      if (!hasHeaderWidget && slots.header && screen !== 'home') {
        const title = screen === 'fileBrowser' ? 'Books' : screen === 'recentBooks' ? 'Recent Books' : 'Settings';
        drawHeader(r, slots.header, title, screen === 'fileBrowser' ? '/ books' : null);
      }
      if (slots.tabs && screen === 'settings' && !widgets.some((w) => w.slot === 'tabs')) {
        drawTabBar(r, slots.tabs, SETTINGS_TABS, 0);
      }
      if (slots.path && screen === 'fileBrowser') {
        r.drawText('small', slots.path.x + metric('contentSidePadding'), slots.path.y, '/ books / fiction', true, 'regular');
      }

      const focus = focusSlot(screen, spec);
      // Firmware fills a `list` slot with the built-in list/cover-grid even when
      // no explicit widget targets it (e.g. Settings). Mirror that for preview.
      if (screen !== 'home' && slots.list && !widgets.some((w) => w.slot === 'list')) {
        widgets.push({ slot: 'list', type: 'list' });
      }
      // Draw widgets in layer order (lower first).
      widgets.sort((a, b) => (a.layer || 0) - (b.layer || 0));
      for (const w of widgets) {
        const rect = widgetRect(w, slots[w.slot]);
        drawWidget(r, w, rect, screen, w.slot === focus);
      }
    }

    // 1-bit ordered-dither pass at backing resolution → crisp e-ink look.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    dither1bit(ctx, bw, bh);
  }

  function renderReader(W, H, spec) {
    // Sample reading page: body text lines, then a status lane at the bottom
    // laid out from screens.reader.layout (a row of slots).
    const margin = metric('contentSidePadding');
    const body = [
      'The wind blew across the shattered plains, carrying with it the',
      'scent of rain and the distant rumble of a highstorm gathering',
      'on the horizon. Kaladin stood at the edge of the chasm, looking',
      'down into the darkness below, and wondered how many had fallen',
      'here before him — bridgemen, soldiers, men with names long since',
      'forgotten by everyone but the stones themselves.',
    ];
    let y = 70;
    r.drawText('large', margin, 30, 'Chapter 12', true, 'bold');
    for (const line of body) { r.drawText('medium', margin, y, line, true, 'regular'); y += 34; }

    const laneH = metric('batteryBarHeight');
    const laneY = H - laneH - metric('statusBarVerticalMargin');
    const laneRect = { x: margin, y: laneY, width: W - 2 * margin, height: laneH };
    r.drawLine(laneRect.x, laneY - 6, laneRect.x + laneRect.width, laneY - 6, 1, true);
    if (!spec || !spec.layout) return;
    const slots = computeLayout(spec.layout, laneRect);
    const chrome = (spec.chrome && spec.chrome.battery) || DEFAULT_READER_CHROME.battery;
    if (slots.bookmark) drawIcon(r.ctx, 'bookmark', slots.bookmark.x, slots.bookmark.y + (laneH - 18) / 2, 18);
    if (slots.battery) drawReaderBattery(r, slots.battery, chrome, 72);
    if (slots.title) r.drawText('small', slots.title.x, slots.title.y + (laneH - r.getLineHeight('small')) / 2, 'The Way of Kings', true, 'regular');
    if (slots.clock) r.drawText('small', slots.clock.x, slots.clock.y + (laneH - r.getLineHeight('small')) / 2, '10:24', true, 'regular');
    if (slots.progress) {
      const pr = slots.progress;
      const tw = r.getTextWidth('small', '38%', 'regular');
      r.drawText('small', pr.x + pr.width - tw, pr.y + (laneH - r.getLineHeight('small')) / 2, '38%', true, 'regular');
    }
  }

  function drawReaderBattery(r, rect, chrome, pct) {
    const cy = rect.y + Math.floor(rect.height / 2) + (chrome.offsetY || 0);
    if (chrome.style === 'bar') {
      const w = chrome.width || rect.width, h = chrome.height || 4;
      const x = rect.x, y = cy - Math.floor(h / 2);
      if (chrome.track === 'outline') r.drawRect(x, y, w, h, true);
      else if (chrome.track === 'hairline') r.drawLine(x, y + h, x + w, y + h, 1, true);
      const fillW = Math.max(0, Math.floor(w * pct / 100));
      if (chrome.fill === 'segments') {
        const segs = chrome.segments || 5, gap = chrome.segmentGap != null ? chrome.segmentGap : 1;
        const segW = Math.floor((w - gap * (segs - 1)) / segs);
        const on = Math.round(segs * pct / 100);
        for (let i = 0; i < on; i++) r.fillRect(x + i * (segW + gap), y, segW, h, true);
      } else {
        r.fillRect(chrome.direction === 'right-to-left' ? x + w - fillW : x, y, fillW, h, true);
      }
    } else {
      drawBatteryIcon(r, { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, pct);
    }
    if (chrome.showPercentage) {
      const pctText = pct + '%';
      r.drawText('small', rect.x, cy - r.getLineHeight('small') - 4, pctText, true, 'regular');
    }
  }

  function clamp(i, n) { if (n <= 0) return -1; return ((i % n) + n) % n; }

  // ---------------------------------------------------------------------------
  // Export: build theme.json
  // ---------------------------------------------------------------------------
  function serializeLayout(node) {
    const out = {};
    if (node.id != null) out.id = node.id;
    if (typeof node.fixed === 'number') out.fixed = node.fixed;
    else if (node.token) out.token = node.token;
    else if (node.flex != null) out.flex = node.flex;
    if (node.slots && node.slots.length) {
      if (node.axis) out.axis = node.axis;
      if (node.gap != null) out.gap = node.gap;
      out.slots = node.slots.map(serializeLayout);
    }
    return out;
  }
  function serializeScreen(s) {
    const out = {};
    if (s.navigation && s.navigation !== 'linear') out.navigation = s.navigation;
    if (s.layout) out.layout = serializeLayout(s.layout);
    if (s.widgets && s.widgets.length) out.widgets = clone(s.widgets);
    if (s.chrome) out.chrome = clone(s.chrome);
    return out;
  }

  function buildThemeJson() {
    const t = state.theme;
    const out = { schema: 1 };
    if (t.meta.version != null) out.version = t.meta.version;
    out.id = t.meta.id;
    out.name = t.meta.name;
    if (t.meta.description) out.description = t.meta.description;
    out.inherits = t.inherits || 'lyra';
    out.constraints = { screenWidth: t.constraints.screenWidth, screenHeight: t.constraints.screenHeight };
    if (t.requires) out.requires = t.requires;

    const metrics = {};
    const src = t.metrics || {};
    for (const k of Object.keys(src)) {
      if (state.writeAllMetrics || src[k] !== LYRA_METRICS[k]) metrics[k] = src[k];
    }
    if (Object.keys(metrics).length || state.writeAllMetrics) out.metrics = metrics;

    out.components = {};
    const c = t.components;
    out.components.homeRecents = c.homeRecents.type === 'none' ? { type: 'none' } : clone(c.homeRecents);
    out.components.homeMenu = clone(c.homeMenu);
    out.components.list = clone(c.list);
    if (t.includeHeader) out.components.header = clone(c.header);
    if (t.includeTabBar) out.components.tabBar = clone(c.tabBar);
    out.components.buttonHints = clone(c.buttonHints);

    out.screens = {};
    for (const name of ['home', 'fileBrowser', 'recentBooks', 'settings', 'reader']) {
      if (t.screens[name]) out.screens[name] = serializeScreen(t.screens[name]);
    }

    // Icons are optional. Declare assets.icons only when the package actually
    // bundles icon BMPs (freshly built in CI), otherwise preserve the source
    // theme's assets, otherwise omit it and inherit Lyra's icons. This matches
    // the shipped themes (carousel bundles+declares; the others omit).
    if (iconsReady()) out.assets = { icons: defaultIconMap() };
    else if (t.assets) out.assets = t.assets;
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
      const tt = [];
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); tt[n] = c >>> 0; }
      return tt;
    })();
    function crc32(buf) { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
    function u16(v) { return [v & 0xFF, (v >>> 8) & 0xFF]; }
    function u32(v) { return [v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF]; }
    for (const f of files) {
      const nameBytes = enc.encode(f.name);
      const data = f.data instanceof Uint8Array ? f.data : enc.encode(f.data);
      const crc = crc32(data);
      const local = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0));
      chunks.push(new Uint8Array(local), nameBytes, data);
      central.push({ nameBytes, crc, size: data.length, offset });
      offset += local.length + nameBytes.length + data.length;
    }
    const cdStart = offset;
    for (const c of central) {
      const rec = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(c.crc), u32(c.size), u32(c.size), u16(c.nameBytes.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset));
      chunks.push(new Uint8Array(rec), c.nameBytes);
      offset += rec.length + c.nameBytes.length;
    }
    const cdSize = offset - cdStart;
    const end = [].concat(u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(cdSize), u32(cdStart), u16(0));
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
    // Widget slots must reference an existing layout slot id.
    for (const name of Object.keys(t.screens)) {
      const s = t.screens[name];
      if (!s.layout) continue;
      const ids = collectSlotIds(s.layout);
      for (const w of (s.widgets || [])) {
        if (w.slot && !ids.has(w.slot)) warnings.push(`${name}: widget "${w.type}" targets unknown slot "${w.slot}".`);
      }
    }
    if (!iconsReady())
      warnings.push('Icon BMPs not built yet. The package will contain theme.json only. Use "Build icons via CI" to generate them.');
    return { errors, warnings };
  }
  function collectSlotIds(node, set) {
    set = set || new Set();
    if (node.id) set.add(node.id);
    (node.slots || []).forEach((c) => collectSlotIds(c, set));
    return set;
  }

  // ---------------------------------------------------------------------------
  // Icon CI build (unchanged): dispatches the firmware repo's icon scripts via
  // GitHub Actions. The BMP format is owned by the firmware repo.
  // ---------------------------------------------------------------------------
  let iconPollTimer = null;
  async function startIconBuild() {
    const fd = new FormData();
    for (const key of ICON_KEYS) if (state.customIcons[key]) fd.append(key, state.customIcons[key]);
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
        } else { pollIconBuild(); }
      } catch (_) { pollIconBuild(); }
    }, 3000);
  }
  function iconsReady() { return state.iconBuild && state.iconBuild.status === 'success' && (state.iconBuild.outputs || []).length > 0; }
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
  // UI wiring helpers
  // ---------------------------------------------------------------------------
  function $(id) { return document.getElementById(id); }
  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'selected' || k === 'checked') e[k] = true;
      else e.setAttribute(k, v);
    }
    const kids = Array.isArray(children) ? children : (children == null ? [] : [children]);
    kids.forEach((c) => { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function fieldRow(label, control) {
    return el('label', { class: 'flex items-center justify-between gap-3 py-1.5' }, [el('span', { class: 'text-xs text-stone-600' }, [label]), control]);
  }
  function numberInput(value, onInput, width) {
    return el('input', { type: 'number', value: value, class: (width || 'w-20') + ' rounded-md border border-stone-300 px-2 py-1 text-xs text-right focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none', oninput: (e) => onInput(e.target.value === '' ? 0 : (parseFloat(e.target.value) || 0)) });
  }
  function textInput(value, onInput, width) {
    return el('input', { type: 'text', value: value || '', class: (width || 'w-44') + ' rounded-md border border-stone-300 px-2 py-1 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none', oninput: (e) => onInput(e.target.value) });
  }
  function selectInput(value, options, onChange) {
    return el('select', { class: 'rounded-md border border-stone-300 px-2 py-1 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none', onchange: (e) => onChange(e.target.value) },
      options.map((o) => {
        const val = typeof o === 'object' ? o.value : o;
        const lbl = typeof o === 'object' ? o.label : o;
        return el('option', { value: val, selected: val === value ? 'selected' : null }, [lbl]);
      }));
  }
  function checkInput(value, onChange) {
    return el('input', { type: 'checkbox', class: 'size-4 rounded border-stone-300 text-brand-600 focus:ring-brand-500', checked: value ? 'checked' : null, onchange: (e) => onChange(e.target.checked) });
  }
  function section(title, body, open, badge) {
    const content = el('div', { class: 'mt-2 ' + (open ? '' : 'hidden') }, body);
    const chevron = el('span', { class: 'text-stone-400 transition-transform ' + (open ? 'rotate-90' : '') }, ['›']);
    const header = el('button', { type: 'button', class: 'flex w-full items-center gap-2 text-left text-sm font-medium text-stone-800', onclick: () => { content.classList.toggle('hidden'); chevron.classList.toggle('rotate-90'); } }, [chevron, title, badge ? el('span', { class: 'ml-auto rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-500' }, [badge]) : null]);
    return el('div', { class: 'border-b border-stone-100 py-3' }, [header, content]);
  }
  function subCard(title, body, onRemove) {
    return el('div', { class: 'mb-2 rounded-lg border border-stone-200 p-2' }, [
      el('div', { class: 'mb-1 flex items-center justify-between' }, [
        el('span', { class: 'text-[11px] font-semibold text-stone-600' }, [title]),
        onRemove ? el('button', { type: 'button', class: 'text-[11px] font-medium text-red-600 hover:text-red-700', onclick: onRemove }, ['Remove']) : null,
      ]),
    ].concat(body));
  }

  // ---------------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------------
  function rerenderControls() {
    const panel = $('controls');
    panel.innerHTML = '';
    const t = state.theme;
    const c = t.components;

    // --- Theme details ---
    panel.appendChild(section('Theme Details', [
      fieldRow('ID', textInput(t.meta.id, (v) => { t.meta.id = v; refreshOutput(); })),
      fieldRow('Name', textInput(t.meta.name, (v) => { t.meta.name = v; refreshOutput(); })),
      fieldRow('Version', numberInput(t.meta.version || 1, (v) => { t.meta.version = v; refreshOutput(); })),
      el('label', { class: 'block py-1.5' }, [
        el('span', { class: 'text-xs text-stone-600' }, ['Description']),
        el('textarea', { rows: '2', class: 'mt-1 block w-full rounded-md border border-stone-300 px-2 py-1 text-xs focus:border-brand-500 focus:ring-1 focus:ring-brand-500 focus:outline-none', oninput: (e) => { t.meta.description = e.target.value; refreshOutput(); } }, [t.meta.description || '']),
      ]),
      fieldRow('Inherits', selectInput(t.inherits || 'lyra', ['lyra', 'classic'], (v) => { t.inherits = v; refreshOutput(); })),
      fieldRow('Screen width', numberInput(t.constraints.screenWidth, (v) => { t.constraints.screenWidth = v; refreshOutput(); })),
      fieldRow('Screen height', numberInput(t.constraints.screenHeight, (v) => { t.constraints.screenHeight = v; refreshOutput(); })),
    ], true));

    // --- Screens (layout + widgets) ---
    panel.appendChild(section('Screens · Layout & Widgets', [screensEditor()], true, 'new'));

    // --- Home Recents ---
    panel.appendChild(section('Home Recents', homeRecentsEditor(), false));

    // --- Home Menu ---
    const hm = c.homeMenu || (c.homeMenu = clone(DEFAULT_HOME_MENU));
    panel.appendChild(section('Home Menu', [
      fieldRow('Font', selectInput(hm.font, FONT_CHOICES, (v) => { hm.font = v; render(); })),
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
      fieldRow('Text inset X', numberInput(hm.textInsetX != null ? hm.textInsetX : 16, (v) => { hm.textInsetX = v; render(); })),
      fieldRow('Has OPDS/Library item', checkInput(state.hasOpds, (v) => { state.hasOpds = v; render(); })),
    ], false));

    // --- List ---
    const ls = c.list || (c.list = clone(DEFAULT_LIST));
    panel.appendChild(section('List', [
      fieldRow('Font', selectInput(ls.font, FONT_CHOICES, (v) => { ls.font = v; render(); })),
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
      fieldRow('Title offset Y', numberInput(ls.titleOffsetY, (v) => { ls.titleOffsetY = v; render(); })),
      fieldRow('Subtitle offset Y', numberInput(ls.subtitleOffsetY, (v) => { ls.subtitleOffsetY = v; render(); })),
      fieldRow('Value offset Y', numberInput(ls.valueOffsetY, (v) => { ls.valueOffsetY = v; render(); })),
    ], false));

    // --- Header (optional) ---
    const hd = c.header || (c.header = clone(DEFAULT_HEADER));
    panel.appendChild(section('Header', [
      fieldRow('Include in export', checkInput(t.includeHeader, (v) => { t.includeHeader = v; refreshOutput(); })),
      fieldRow('Font', selectInput(hd.font, FONT_CHOICES, (v) => { hd.font = v; t.includeHeader = true; update(); })),
      fieldRow('Style', selectInput(hd.style, ['regular', 'bold'], (v) => { hd.style = v; t.includeHeader = true; update(); })),
      fieldRow('Centered title', checkInput(hd.centeredTitle, (v) => { hd.centeredTitle = v; t.includeHeader = true; update(); })),
      fieldRow('Show divider', checkInput(hd.showDivider, (v) => { hd.showDivider = v; t.includeHeader = true; update(); })),
      fieldRow('Title offset Y', numberInput(hd.titleOffsetY, (v) => { hd.titleOffsetY = v; t.includeHeader = true; update(); })),
      fieldRow('Battery offset Y', numberInput(hd.batteryOffsetY, (v) => { hd.batteryOffsetY = v; t.includeHeader = true; update(); })),
    ], false));

    // --- Tab bar (optional) ---
    const tb = c.tabBar || (c.tabBar = clone(DEFAULT_TABBAR));
    panel.appendChild(section('Tab Bar', [
      fieldRow('Include in export', checkInput(t.includeTabBar, (v) => { t.includeTabBar = v; refreshOutput(); })),
      fieldRow('Font', selectInput(tb.font, FONT_CHOICES, (v) => { tb.font = v; t.includeTabBar = true; update(); })),
      fieldRow('Style', selectInput(tb.style, ['regular', 'bold'], (v) => { tb.style = v; t.includeTabBar = true; update(); })),
      fieldRow('Equal width', checkInput(tb.equalWidth, (v) => { tb.equalWidth = v; t.includeTabBar = true; update(); })),
      fieldRow('Selection style', selectInput(tb.selectionStyle, ['fill', 'underline'], (v) => { tb.selectionStyle = v; t.includeTabBar = true; update(); })),
      fieldRow('Selected corner radius', numberInput(tb.selectedCornerRadius, (v) => { tb.selectedCornerRadius = v; t.includeTabBar = true; update(); })),
      fieldRow('Selected text inverted', checkInput(tb.selectedTextInverted, (v) => { tb.selectedTextInverted = v; t.includeTabBar = true; update(); })),
      fieldRow('Draw divider', checkInput(tb.drawDivider, (v) => { tb.drawDivider = v; t.includeTabBar = true; update(); })),
      fieldRow('Horizontal inset', numberInput(tb.horizontalInset, (v) => { tb.horizontalInset = v; t.includeTabBar = true; update(); })),
    ], false));

    // --- Button Hints ---
    const bh = c.buttonHints || (c.buttonHints = clone(DEFAULT_BUTTON_HINTS));
    const bhLayout = hintLayout(bh);
    const bhBody = [
      fieldRow('Layout', selectInput(bhLayout, ['buttons', 'shapes', 'icons', 'groups'], (v) => { bh.layout = v; bh.shapes = (v === 'shapes'); update(); })),
      fieldRow('Font', selectInput(bh.font, FONT_CHOICES, (v) => { bh.font = v; render(); })),
      fieldRow('Style', selectInput(bh.style, ['regular', 'bold'], (v) => { bh.style = v; render(); })),
      fieldRow('Corner radius', numberInput(bh.cornerRadius, (v) => { bh.cornerRadius = v; render(); })),
    ];
    if (bhLayout === 'groups') {
      bhBody.push(fieldRow('Side padding', numberInput(bh.sidePadding != null ? bh.sidePadding : 20, (v) => { bh.sidePadding = v; render(); })));
      bhBody.push(fieldRow('Group gap', numberInput(bh.groupGap != null ? bh.groupGap : 10, (v) => { bh.groupGap = v; render(); })));
      bhBody.push(fieldRow('Inner padding', numberInput(bh.innerPadding != null ? bh.innerPadding : 16, (v) => { bh.innerPadding = v; render(); })));
    } else if (bhLayout === 'shapes' || bhLayout === 'icons') {
      bhBody.push(fieldRow('Shape size', numberInput(bh.shapeSize, (v) => { bh.shapeSize = v; render(); })));
    } else {
      bhBody.push(fieldRow('Button width', numberInput(bh.buttonWidth, (v) => { bh.buttonWidth = v; render(); })));
      bhBody.push(fieldRow('Fill', checkInput(bh.fill, (v) => { bh.fill = v; render(); })));
      bhBody.push(fieldRow('Outline', checkInput(bh.outline, (v) => { bh.outline = v; render(); })));
      bhBody.push(fieldRow('Draw empty', checkInput(bh.drawEmpty, (v) => { bh.drawEmpty = v; render(); })));
      bhBody.push(fieldRow('Text offset Y', numberInput(bh.textOffsetY, (v) => { bh.textOffsetY = v; render(); })));
    }
    panel.appendChild(section('Button Hints', bhBody, false));

    // --- Icon assets ---
    const iconBody = [];
    iconBody.push(el('p', { class: 'text-[11px] text-stone-500' }, ['Icons are converted to firmware-exact 1-bit BMPs by the official CrossPoint Python script (run in CI), not in the browser. Leave all blank to use the standard Lyra icon set, or upload custom SVG/PNG icons to override individual keys.']));
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
      Reader: ['batteryBarHeight', 'progressBarHeight', 'statusBarHorizontalMargin', 'statusBarVerticalMargin'],
    };
    for (const group in metricGroups) {
      panel.appendChild(section('Metrics · ' + group, metricGroups[group].map((key) => metricRow(key)), false));
    }

    refreshOutput();
    renderIconStatus();
  }

  // --- Home recents editor (cover-strip slots) ---
  function homeRecentsEditor() {
    const c = state.theme.components;
    const hr = c.homeRecents || (c.homeRecents = { type: 'default' });
    const body = [
      fieldRow('Type', selectInput(hr.type || 'default', ['default', 'none', 'cover-strip'], (v) => {
        hr.type = v;
        if (v === 'cover-strip' && !Array.isArray(hr.slots)) {
          hr.maxBooks = 1; hr.wrap = false; hr.selectionLineWidth = 2; hr.selectionCornerRadius = 6;
          hr.slots = [{ book: 'selected', x: 'center', y: 'top', height: 226, widthPercent: 62, yOffset: 8, selected: true, title: { enabled: true, font: 'large', style: 'bold', maxLines: 2, offsetY: 12 } }];
        }
        update();
      })),
    ];
    if (hr.type === 'cover-strip') {
      if (!Array.isArray(hr.slots)) hr.slots = [];
      body.push(fieldRow('Wrap (carousel)', checkInput(hr.wrap, (v) => { hr.wrap = v; render(); })));
      body.push(fieldRow('Selection line width', numberInput(hr.selectionLineWidth || 2, (v) => { hr.selectionLineWidth = v; render(); })));
      body.push(fieldRow('Inactive selection line width', numberInput(hr.inactiveSelectionLineWidth || 0, (v) => { hr.inactiveSelectionLineWidth = v; render(); })));
      body.push(fieldRow('Selection corner radius', numberInput(hr.selectionCornerRadius || 6, (v) => { hr.selectionCornerRadius = v; render(); })));
      body.push(fieldRow('Draw panel', checkInput(hr.drawPanel, (v) => { hr.drawPanel = v; render(); })));
      body.push(el('div', { class: 'mt-3 mb-1 flex items-center justify-between' }, [
        el('span', { class: 'text-xs font-medium text-stone-700' }, ['Cover slots (' + hr.slots.length + ')']),
        el('button', { type: 'button', class: 'rounded-md bg-brand-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-brand-700', onclick: () => {
          const idx = hr.slots.length;
          hr.slots.push({ book: 'index', bookIndex: idx, x: 'center', y: 'top', height: 226, widthPercent: 62, selected: true, title: { enabled: true, font: 'medium', style: 'regular', maxLines: 2, offsetY: 12 } });
          update();
        } }, ['+ Add cover slot']),
      ]));
      hr.slots.forEach((slot, i) => {
        slot.title = slot.title || { enabled: false, font: 'medium', style: 'regular', maxLines: 2, offsetY: 12 };
        const rows = [
          fieldRow('Book', selectInput(slot.book || 'selected', ['previous', 'selected', 'next', 'index'], (v) => { slot.book = v; update(); })),
        ];
        if (slot.book === 'index') rows.push(fieldRow('Book index', numberInput(slot.bookIndex || 0, (v) => { slot.bookIndex = v; render(); })));
        rows.push(fieldRow('X', selectInput(slot.x || 'center', ['padding', 'center', 'right-padding'], (v) => { slot.x = v; render(); })));
        rows.push(fieldRow('Y', selectInput(slot.y || 'top', ['top', 'center'], (v) => { slot.y = v; render(); })));
        rows.push(fieldRow('Height', numberInput(slot.height || 226, (v) => { slot.height = v; render(); })));
        rows.push(fieldRow('Width %', numberInput(slot.widthPercent || 62, (v) => { slot.widthPercent = v; render(); })));
        rows.push(fieldRow('X offset', numberInput(slot.xOffset || 0, (v) => { slot.xOffset = v; render(); })));
        rows.push(fieldRow('Y offset', numberInput(slot.yOffset || 0, (v) => { slot.yOffset = v; render(); })));
        rows.push(fieldRow('Selected', checkInput(slot.selected, (v) => { slot.selected = v; render(); })));
        rows.push(fieldRow('Title', checkInput(slot.title.enabled, (v) => { slot.title.enabled = v; update(); })));
        if (slot.title.enabled) {
          rows.push(fieldRow('Title font', selectInput(slot.title.font, FONT_CHOICES, (v) => { slot.title.font = v; render(); })));
          rows.push(fieldRow('Title style', selectInput(slot.title.style, ['regular', 'bold'], (v) => { slot.title.style = v; render(); })));
          rows.push(fieldRow('Title max lines', numberInput(slot.title.maxLines || 2, (v) => { slot.title.maxLines = v; render(); })));
          rows.push(fieldRow('Title full width', checkInput(slot.title.fullWidth, (v) => { slot.title.fullWidth = v; render(); })));
        }
        body.push(subCard('Slot ' + (i + 1), rows, () => { hr.slots.splice(i, 1); update(); }));
      });
      body.push(fieldRow('Max recent books', numberInput(hr.maxBooks || hr.slots.length || 1, (v) => { hr.maxBooks = v; render(); })));
    }
    return el('div', {}, body);
  }

  // --- Screens editor: per-screen navigation, slot tree, widgets, chrome ---
  const SCREEN_LABELS = { home: 'Home', fileBrowser: 'File Browser', recentBooks: 'Recent Books', settings: 'Settings', reader: 'Reader' };
  const HOME_WIDGET_TYPES = ['clock', 'headerTitle', 'header', 'battery', 'recents', 'recentCoverGrid', 'launcherList', 'launcherGrid', 'featuredBookCard', 'buttonHints'];
  const LIST_WIDGET_TYPES = ['list', 'coverGrid'];

  function screensEditor() {
    const wrap = el('div', {});
    const t = state.theme;
    for (const name of ['home', 'fileBrowser', 'recentBooks', 'settings', 'reader']) {
      const s = t.screens[name] || (t.screens[name] = { layout: { axis: 'column', gap: 0, slots: [] } });
      const body = [];
      if (name === 'home') {
        body.push(fieldRow('Navigation', selectInput(s.navigation || 'linear', ['linear', 'splitAxis', 'carousel'], (v) => { s.navigation = v; update(); })));
      }
      // Layout tree
      body.push(el('div', { class: 'mt-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500' }, ['Layout slots']));
      body.push(layoutNodeEditor(s.layout, null, -1));
      // Widgets (not reader, which uses chrome)
      if (name !== 'reader') {
        const types = name === 'home' ? HOME_WIDGET_TYPES : LIST_WIDGET_TYPES;
        body.push(widgetsEditor(name, s, types));
      } else {
        body.push(readerChromeEditor(s));
      }
      wrap.appendChild(section('· ' + SCREEN_LABELS[name], body, name === state.surface || name === 'home'));
    }
    return wrap;
  }

  // Recursive layout slot tree editor.
  function layoutNodeEditor(node, parent, index) {
    const sizing = nodeSizing(node);
    const rows = [];
    const isRoot = parent === null;
    const head = el('div', { class: 'flex flex-wrap items-center gap-1.5' }, [
      textInput(node.id || '', (v) => { node.id = v || undefined; update(); }, 'w-28'),
      selectInput(node.axis || 'column', ['column', 'row'], (v) => { node.axis = v; render(); }),
      el('span', { class: 'text-[10px] text-stone-400' }, ['gap']),
      numberInput(node.gap || 0, (v) => { node.gap = v; render(); }, 'w-14'),
      isRoot ? null : selectInput(sizing.type, ['fixed', 'flex', 'token'], (v) => {
        delete node.fixed; delete node.flex; delete node.token;
        if (v === 'fixed') node.fixed = sizing.type === 'token' ? resolveToken(node.token) : (sizing.value || 40);
        else if (v === 'flex') node.flex = 1;
        else node.token = 'header';
        update();
      }),
      isRoot ? null : sizeValueControl(node, sizing),
      isRoot ? null : el('button', { type: 'button', class: 'text-[11px] font-medium text-red-600 hover:text-red-700', onclick: () => { parent.slots.splice(index, 1); update(); } }, ['✕']),
    ]);
    rows.push(head);
    const childWrap = el('div', { class: 'ml-3 mt-1 border-l border-stone-200 pl-2' }, (node.slots || []).map((ch, i) => layoutNodeEditor(ch, node, i)));
    rows.push(childWrap);
    rows.push(el('button', { type: 'button', class: 'ml-3 mt-1 rounded border border-stone-300 px-1.5 py-0.5 text-[10px] font-medium text-stone-600 hover:bg-stone-50', onclick: () => { if (!node.slots) node.slots = []; node.slots.push({ id: 'slot' + (node.slots.length + 1), flex: 1 }); update(); } }, ['+ child slot']));
    return el('div', { class: 'mb-1.5 rounded-md bg-stone-50 p-1.5' }, rows);
  }
  function sizeValueControl(node, sizing) {
    if (sizing.type === 'token') {
      return selectInput(node.token || 'header', Object.keys(TOKEN_METRIC), (v) => { node.token = v; render(); });
    }
    if (sizing.type === 'flex') {
      return numberInput(node.flex != null ? node.flex : 1, (v) => { node.flex = v; render(); }, 'w-14');
    }
    return numberInput(node.fixed || 0, (v) => { node.fixed = v; render(); }, 'w-16');
  }

  // Widgets list editor for a screen.
  function widgetsEditor(screen, s, types) {
    if (!Array.isArray(s.widgets)) s.widgets = [];
    const slotIds = Array.from(collectSlotIds(s.layout));
    const body = [el('div', { class: 'mt-2 flex items-center justify-between' }, [
      el('span', { class: 'text-[11px] font-semibold uppercase tracking-wide text-stone-500' }, ['Widgets (' + s.widgets.length + ')']),
      el('button', { type: 'button', class: 'rounded-md bg-brand-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-brand-700', onclick: () => { s.widgets.push({ slot: slotIds[0] || '', type: types[0] }); update(); } }, ['+ Add widget']),
    ])];
    s.widgets.forEach((w, i) => {
      const rows = [
        fieldRow('Slot', selectInput(w.slot || '', slotIds.length ? slotIds : [''], (v) => { w.slot = v; update(); })),
        fieldRow('Type', selectInput(w.type, types, (v) => { w.type = v; update(); })),
      ];
      rows.push.apply(rows, widgetTypeFields(screen, w));
      // placement
      rows.push(fieldRow('Layer', numberInput(w.layer || 0, (v) => { w.layer = v; render(); })));
      rows.push(fieldRow('Offset X / Y', el('span', { class: 'flex gap-1' }, [
        numberInput(w.offsetX || 0, (v) => { w.offsetX = v; render(); }, 'w-14'),
        numberInput(w.offsetY || 0, (v) => { w.offsetY = v; render(); }, 'w-14'),
      ])));
      rows.push(insetEditor('Inset', w, 'inset'));
      rows.push(insetEditor('Bleed', w, 'bleed'));
      body.push(subCard(w.type + ' → ' + (w.slot || '?'), rows, () => { s.widgets.splice(i, 1); update(); }));
    });
    return el('div', {}, body);
  }
  function insetEditor(label, obj, key) {
    const v = obj[key] || {};
    const norm = typeof v === 'number' ? { top: v, right: v, bottom: v, left: v } : v;
    function set(side, val) { if (typeof obj[key] !== 'object' || obj[key] == null) obj[key] = {}; obj[key][side] = val; if (!obj[key][side]) delete obj[key][side]; if (!Object.keys(obj[key]).length) delete obj[key]; render(); }
    return fieldRow(label + ' (T R B L)', el('span', { class: 'flex gap-1' }, [
      numberInput(norm.top || 0, (x) => set('top', x), 'w-12'),
      numberInput(norm.right || 0, (x) => set('right', x), 'w-12'),
      numberInput(norm.bottom || 0, (x) => set('bottom', x), 'w-12'),
      numberInput(norm.left || 0, (x) => set('left', x), 'w-12'),
    ]));
  }

  // Type-specific widget fields.
  function widgetTypeFields(screen, w) {
    const rows = [];
    if (w.type === 'launcherList' || w.type === 'launcherGrid') {
      if (w.type === 'launcherGrid') {
        rows.push(fieldRow('Presentation', selectInput(w.presentation || 'menu', ['menu', 'iconTabs'], (v) => { w.presentation = v === 'menu' ? undefined : v; update(); })));
        rows.push(fieldRow('Columns', numberInput(w.columns || 2, (v) => { w.columns = v; render(); })));
        rows.push(fieldRow('Rows (0=auto)', numberInput(w.rows || 0, (v) => { w.rows = v || undefined; render(); })));
        rows.push(fieldRow('Gap', numberInput(w.gap || 0, (v) => { w.gap = v; render(); })));
        if (w.presentation === 'iconTabs') {
          rows.push(fieldRow('Icon size', numberInput(w.iconSize || 32, (v) => { w.iconSize = v; render(); })));
          rows.push(fieldRow('Selected radius', numberInput(w.selectedRadius != null ? w.selectedRadius : 5, (v) => { w.selectedRadius = v; render(); })));
        }
      }
      rows.push(launcherItemsEditor(w));
    } else if (w.type === 'featuredBookCard') {
      rows.push(fieldRow('Cover W / H', el('span', { class: 'flex gap-1' }, [
        numberInput(w.coverWidth || 96, (v) => { w.coverWidth = v; render(); }, 'w-14'),
        numberInput(w.coverHeight || 142, (v) => { w.coverHeight = v; render(); }, 'w-14'),
      ])));
      rows.push(fieldRow('Cover gap', numberInput(w.coverGap != null ? w.coverGap : 14, (v) => { w.coverGap = v; render(); })));
      rows.push(fieldRow('Title gap', numberInput(w.titleGap != null ? w.titleGap : 8, (v) => { w.titleGap = v; render(); })));
      rows.push(fieldRow('Start index', numberInput(w.startIndex || 0, (v) => { w.startIndex = v; render(); })));
      rows.push(fieldRow('Placeholder icon size', numberInput(w.placeholderIconSize || 0, (v) => { w.placeholderIconSize = v || undefined; render(); })));
    } else if (w.type === 'recentCoverGrid' || w.type === 'coverGrid') {
      rows.push(fieldRow('Columns / Rows', el('span', { class: 'flex gap-1' }, [
        numberInput(w.columns || 3, (v) => { w.columns = v; render(); }, 'w-14'),
        numberInput(w.rows || 0, (v) => { w.rows = v || undefined; render(); }, 'w-14'),
      ])));
      rows.push(fieldRow('Gap / Row gap', el('span', { class: 'flex gap-1' }, [
        numberInput(w.gap || 0, (v) => { w.gap = v; render(); }, 'w-14'),
        numberInput(w.rowGap != null ? w.rowGap : -1, (v) => { w.rowGap = v; render(); }, 'w-14'),
      ])));
      rows.push(fieldRow('Cover W / H', el('span', { class: 'flex gap-1' }, [
        numberInput(w.coverWidth || 0, (v) => { w.coverWidth = v || undefined; render(); }, 'w-14'),
        numberInput(w.coverHeight || 0, (v) => { w.coverHeight = v || undefined; render(); }, 'w-14'),
      ])));
      rows.push(fieldRow('Row height', numberInput(w.rowHeight || 0, (v) => { w.rowHeight = v || undefined; render(); })));
      rows.push(fieldRow('Label height / lines', el('span', { class: 'flex gap-1' }, [
        numberInput(w.labelHeight != null ? w.labelHeight : 20, (v) => { w.labelHeight = v; render(); }, 'w-14'),
        numberInput(w.labelLines || 1, (v) => { w.labelLines = v; render(); }, 'w-14'),
      ])));
      rows.push(fieldRow('Selection style', selectInput(w.selectionStyle || 'coverFrame', ['coverFrame', 'fill', 'outline', 'none'], (v) => { w.selectionStyle = v; render(); })));
      rows.push(fieldRow('Start index', numberInput(w.startIndex || 0, (v) => { w.startIndex = v; render(); })));
    } else if (w.type === 'buttonHints') {
      if (!w.labels) w.labels = {};
      const tokens = ['default', 'empty', 'back', 'home', 'select', 'confirm', 'open', 'toggle', 'up', 'down', 'left', 'right'];
      ['back', 'confirm', 'previous', 'next'].forEach((slot) => {
        rows.push(fieldRow('Label · ' + slot, selectInput(w.labels[slot] || 'default', tokens, (v) => { if (v === 'default') delete w.labels[slot]; else w.labels[slot] = v; render(); })));
      });
    }
    return rows;
  }

  function launcherItemsEditor(w) {
    if (!Array.isArray(w.items)) w.items = clone(DEFAULT_LAUNCHER_ITEMS);
    const body = [el('div', { class: 'mt-1 flex items-center justify-between' }, [
      el('span', { class: 'text-[11px] font-medium text-stone-600' }, ['Items (' + w.items.length + ')']),
      el('button', { type: 'button', class: 'rounded bg-stone-700 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-stone-600', onclick: () => { w.items.push({ text: 'Action', icon: 'folder', action: LAUNCHER_ACTIONS[0] }); update(); } }, ['+ item']),
    ])];
    w.items.forEach((it, i) => {
      body.push(el('div', { class: 'mb-1 flex flex-wrap items-center gap-1' }, [
        textInput(it.text || '', (v) => { it.text = v; render(); }, 'w-24'),
        selectInput(it.icon || 'folder', ICON_KEYS, (v) => { it.icon = v; render(); }),
        selectInput(it.action || LAUNCHER_ACTIONS[0], LAUNCHER_ACTIONS, (v) => { it.action = v; render(); }),
        el('button', { type: 'button', class: 'text-[11px] font-medium text-red-600 hover:text-red-700', onclick: () => { w.items.splice(i, 1); update(); } }, ['✕']),
      ]));
    });
    return el('div', { class: 'rounded-md border border-stone-200 p-1.5' }, body);
  }

  function readerChromeEditor(s) {
    if (!s.chrome) s.chrome = clone(DEFAULT_READER_CHROME);
    const b = s.chrome.battery || (s.chrome.battery = clone(DEFAULT_READER_CHROME.battery));
    const rows = [
      el('div', { class: 'mt-2 text-[11px] font-semibold uppercase tracking-wide text-stone-500' }, ['Reader chrome · battery']),
      fieldRow('Style', selectInput(b.style || 'icon', ['icon', 'bar'], (v) => { b.style = v; update(); })),
      fieldRow('Show percentage', checkInput(b.showPercentage, (v) => { b.showPercentage = v; render(); })),
    ];
    if (b.style === 'bar') {
      rows.push(fieldRow('Width / Height', el('span', { class: 'flex gap-1' }, [
        numberInput(b.width || 38, (v) => { b.width = v; render(); }, 'w-14'),
        numberInput(b.height || 3, (v) => { b.height = v; render(); }, 'w-14'),
      ])));
      rows.push(fieldRow('Offset Y', numberInput(b.offsetY || 0, (v) => { b.offsetY = v; render(); })));
      rows.push(fieldRow('Track', selectInput(b.track || 'none', ['none', 'hairline', 'outline', 'dither'], (v) => { b.track = v; render(); })));
      rows.push(fieldRow('Fill', selectInput(b.fill || 'solid', ['solid', 'dither', 'segments'], (v) => { b.fill = v; update(); })));
      rows.push(fieldRow('Direction', selectInput(b.direction || 'left-to-right', ['left-to-right', 'right-to-left', 'center-out', 'bottom-to-top', 'top-to-bottom'], (v) => { b.direction = v; render(); })));
      if (b.fill === 'segments') {
        rows.push(fieldRow('Segments / gap', el('span', { class: 'flex gap-1' }, [
          numberInput(b.segments || 5, (v) => { b.segments = v; render(); }, 'w-14'),
          numberInput(b.segmentGap != null ? b.segmentGap : 1, (v) => { b.segmentGap = v; render(); }, 'w-14'),
        ])));
      }
      rows.push(fieldRow('Radius', numberInput(b.radius || 0, (v) => { b.radius = v; render(); })));
    }
    return el('div', {}, rows);
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
    if (b.status === 'pending' || b.status === 'building') box.appendChild(el('div', { class: 'text-stone-500' }, ['⏳ Building icons in CI… this runs the firmware script and can take a minute.']));
    else if (b.status === 'success') box.appendChild(el('div', { class: 'text-brand-600' }, ['✓ Generated ' + (b.outputs || []).length + ' BMP icon(s). They will be bundled into the package zip.']));
    else if (b.status === 'failed') box.appendChild(el('div', { class: 'text-red-600' }, ['✕ Icon build failed: ' + (b.error || 'unknown error')]));
    refreshOutput();
  }

  function update() { rerenderControls(); render(); }

  function refreshOutput() {
    const json = buildThemeJson();
    $('jsonOutput').textContent = JSON.stringify(json, null, 2);
    const { errors, warnings } = validate();
    const box = $('validation');
    box.innerHTML = '';
    if (errors.length === 0 && warnings.length === 0) box.appendChild(el('div', { class: 'text-xs text-brand-600' }, ['✓ Theme is valid.']));
    errors.forEach((e) => box.appendChild(el('div', { class: 'text-xs text-red-600' }, ['✕ ' + e])));
    warnings.forEach((w) => box.appendChild(el('div', { class: 'text-xs text-amber-600' }, ['⚠ ' + w])));
    render();
  }

  // ---------------------------------------------------------------------------
  // Import / presets
  // ---------------------------------------------------------------------------
  // Migrate legacy font ids (ui10/ui12 and numeric) to small/medium/large.
  function migrateFonts(obj) {
    if (obj == null || typeof obj !== 'object') return;
    if (Array.isArray(obj)) { obj.forEach(migrateFonts); return; }
    for (const k in obj) {
      if (k === 'font' && typeof obj[k] === 'string' && !FONTS[obj[k]]) obj[k] = canonFont(obj[k]);
      else migrateFonts(obj[k]);
    }
  }

  function importTheme(obj) {
    migrateFonts(obj);
    const known = ['schema', 'version', 'id', 'name', 'description', 'inherits', 'constraints', 'metrics', 'components', 'screens', 'assets', 'devices', 'extensions', 'requires'];
    const extra = {};
    for (const k in obj) if (!known.includes(k)) extra[k] = obj[k];
    // Legacy themes used devices.<id>.constraints; lift to top-level constraints.
    let constraints = obj.constraints;
    if (!constraints && obj.devices && obj.devices.x3 && obj.devices.x3.constraints) {
      constraints = { screenWidth: obj.devices.x3.constraints.screenWidth, screenHeight: obj.devices.x3.constraints.screenHeight };
    }
    const comps = obj.components || {};
    const t = {
      meta: { id: obj.id || 'imported-theme', name: obj.name || 'Imported Theme', description: obj.description || '', version: obj.version != null ? obj.version : 1 },
      inherits: obj.inherits || 'lyra',
      constraints: constraints || { screenWidth: 480, screenHeight: 800 },
      requires: obj.requires,
      metrics: obj.metrics || {},
      components: {
        homeRecents: comps.homeRecents || { type: 'default' },
        homeMenu: Object.assign(clone(DEFAULT_HOME_MENU), comps.homeMenu || {}),
        list: Object.assign(clone(DEFAULT_LIST), comps.list || {}),
        header: Object.assign(clone(DEFAULT_HEADER), comps.header || {}),
        tabBar: Object.assign(clone(DEFAULT_TABBAR), comps.tabBar || {}),
        buttonHints: Object.assign(clone(DEFAULT_BUTTON_HINTS), comps.buttonHints || {}),
      },
      screens: obj.screens ? normalizeScreens(obj.screens) : defaultScreens(),
      assets: obj.assets,
      includeHeader: !!comps.header,
      includeTabBar: !!comps.tabBar,
      extensions: obj.extensions,
      _extra: Object.keys(extra).length ? extra : undefined,
    };
    state.theme = t;
    state.selectedIndex = 0;
    update();
  }
  // Ensure every screen has a layout object the editor can mutate.
  function normalizeScreens(screens) {
    const out = clone(screens);
    for (const name of ['home', 'fileBrowser', 'recentBooks', 'settings', 'reader']) {
      if (!out[name]) continue;
      if (!out[name].layout) out[name].layout = { axis: 'column', gap: 0, slots: [] };
    }
    // Backfill any missing screens with defaults so the editor is complete.
    const def = defaultScreens();
    for (const name in def) if (!out[name]) out[name] = def[name];
    return out;
  }

  async function loadPreset(value) {
    if (!value || value === 'new') { state.theme = newTheme(); state.selectedIndex = 0; update(); return; }
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

  // Populate the preset dropdown from the live theme manifest.
  async function populatePresets() {
    const sel = $('presetSelect');
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: 'new' }, ['New theme (blank, Lyra defaults)']));
    try {
      const res = await fetch('/themes/themes.json');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      (data.themes || []).forEach((th) => sel.appendChild(el('option', { value: 'sd:' + th.id }, [(th.name || th.id) + ' (live)'])));
    } catch (err) { /* offline: only the blank option */ }
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  const SURFACES = ['home', 'fileBrowser', 'recentBooks', 'settings', 'reader'];
  function init() {
    canvas = $('deviceCanvas');
    r = new Renderer(canvas.getContext('2d'));
    preloadIcons();

    const presetSel = $('presetSelect');
    presetSel.addEventListener('change', (e) => loadPreset(e.target.value));
    $('loadPresetBtn').addEventListener('click', () => loadPreset(presetSel.value));
    populatePresets();

    document.querySelectorAll('[data-device]').forEach((b) => b.addEventListener('click', () => {
      state.device = b.dataset.device; syncTabs(); render();
    }));
    document.querySelectorAll('[data-surface]').forEach((b) => b.addEventListener('click', () => {
      state.surface = b.dataset.surface; state.selectedIndex = 0; syncTabs(); render();
    }));

    $('selPrev').addEventListener('click', () => { state.selectedIndex--; render(); });
    $('selNext').addEventListener('click', () => { state.selectedIndex++; render(); });

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

    $('importInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { try { importTheme(JSON.parse(reader.result)); } catch (err) { alert('Could not parse theme.json: ' + err.message); } };
      reader.readAsText(file);
      e.target.value = '';
    });

    const params = new URLSearchParams(location.search);
    if (params.get('device') === 'x3' || params.get('device') === 'x4') state.device = params.get('device');
    if (SURFACES.includes(params.get('surface'))) state.surface = params.get('surface');
    const p = params.get('preset');
    loadPreset(!p ? 'new' : 'sd:' + p);
    syncTabs();

    fetch('/api/theme-build/status', { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((data) => { if (data && data.build) { state.iconBuild = data.build; renderIconStatus(); if (['pending', 'building'].includes(data.build.status)) pollIconBuild(); } })
      .catch(() => {});
  }

  function syncTabs() {
    document.querySelectorAll('[data-device]').forEach((x) => {
      const on = x.dataset.device === state.device;
      x.classList.toggle('bg-brand-600', on); x.classList.toggle('text-white', on); x.classList.toggle('text-stone-600', !on);
    });
    document.querySelectorAll('[data-surface]').forEach((x) => {
      const on = x.dataset.surface === state.surface;
      x.classList.toggle('bg-stone-900', on); x.classList.toggle('text-white', on); x.classList.toggle('text-stone-600', !on);
    });
  }

  function flash(btn, text) {
    const orig = btn.textContent;
    btn.textContent = text;
    setTimeout(() => { btn.textContent = orig; }, 1200);
  }

  // Test hook (harmless in the browser; `module` is undefined there). Lets a
  // node harness drive importTheme/buildThemeJson against a stubbed DOM.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { importTheme, buildThemeJson, newTheme, render, getState: () => state };
  }

  // Module entry point, called by the React page once the markup is in the DOM.
  // Guarded per-canvas so React StrictMode's double-invoked effects (and any
  // re-mounts of the page) never attach duplicate event listeners.
  export function initThemeBuilder() {
    const canvasEl = document.getElementById('deviceCanvas');
    if (!canvasEl || canvasEl.dataset.tbInit) return;
    canvasEl.dataset.tbInit = '1';
    clearTimeout(iconPollTimer);
    init();
  }
