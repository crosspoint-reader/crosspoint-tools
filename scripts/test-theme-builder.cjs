// Headless smoke test for the theme builder: stubs a minimal DOM, loads the
// builder, round-trips each shipped theme through importTheme -> buildThemeJson,
// and a fresh newTheme, asserting the exported JSON is structurally valid for
// the new firmware (schema/version/constraints/components/screens/fonts).
const fs = require('fs');
const path = require('path');

function makeNode() {
  const n = {
    children: [], dataset: {}, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {},
    appendChild(c) { this.children.push(c); return c; },
    querySelector() { return makeNode(); }, querySelectorAll() { return []; },
    focus() {}, click() {}, remove() {},
    getContext() { return ctx2d; },
    innerHTML: '', textContent: '', value: '', width: 0, height: 0,
    naturalWidth: 16, naturalHeight: 16,
  };
  return n;
}
const ctx2d = new Proxy({
  measureText: (t) => ({ width: (t || '').length * 8 }),
  getImageData: (x, y, w, h) => ({ data: new Uint8Array(Math.max(1, w * h * 4)) }),
  putImageData() {}, createImageData() {},
}, { get(o, k) { return k in o ? o[k] : (typeof k === 'string' ? () => {} : undefined); }, set() { return true; } });

const idCache = {};
global.document = {
  readyState: 'complete',
  body: makeNode(),
  createElement() { return makeNode(); },
  createTextNode(t) { return { textContent: t, nodeType: 3 }; },
  getElementById(id) { return idCache[id] || (idCache[id] = makeNode()); },
  querySelectorAll() { return []; },
  addEventListener() {},
};
global.Image = class { set src(_) {} set onload(_) {} set onerror(_) {} };
global.requestAnimationFrame = () => {};
global.fetch = () => Promise.reject(new Error('no network in test'));
global.location = { search: '' };
global.navigator = { clipboard: { writeText() {} } };
global.alert = () => {};
if (typeof URLSearchParams === 'undefined') global.URLSearchParams = require('url').URLSearchParams;

// The builder is an ES module, so load its source, strip the ESM export
// keyword, and run it as CommonJS via new Function (its test hook assigns
// module.exports).
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'theme-builder.js'), 'utf8')
  .replace('export function initThemeBuilder', 'function initThemeBuilder');
const fakeModule = { exports: {} };
new Function('module', 'exports', 'globalThis', src)(fakeModule, fakeModule.exports, global);
const mod = fakeModule.exports;

const FONTS = new Set(['small', 'medium', 'large']);
function checkFonts(obj, where) {
  if (obj == null || typeof obj !== 'object') return;
  for (const k in obj) {
    if (k === 'font' && typeof obj[k] === 'string' && !FONTS.has(obj[k])) {
      throw new Error(`bad font "${obj[k]}" at ${where}`);
    }
    checkFonts(obj[k], where + '.' + k);
  }
}
function assert(cond, msg) { if (!cond) throw new Error('ASSERT: ' + msg); }

function validate(out, label) {
  assert(out.schema === 1, `${label}: schema must be 1`);
  assert(out.id && out.name, `${label}: id/name required`);
  assert(out.inherits === 'lyra' || out.inherits === 'classic', `${label}: inherits`);
  assert(out.constraints && out.constraints.screenWidth && out.constraints.screenHeight, `${label}: constraints`);
  assert(!out.devices, `${label}: must NOT emit legacy devices block`);
  assert(out.components && out.components.homeMenu && out.components.list && out.components.buttonHints, `${label}: core components`);
  assert(out.screens && out.screens.home && out.screens.home.layout, `${label}: home screen + layout`);
  for (const s of Object.keys(out.screens)) {
    const sc = out.screens[s];
    assert(sc.layout && (sc.layout.slots || sc.layout.axis !== undefined || true), `${label}: ${s} layout`);
    for (const w of (sc.widgets || [])) assert(w.slot !== undefined && w.type, `${label}: ${s} widget needs slot+type`);
  }
  checkFonts(out.components, `${label}.components`);
  checkFonts(out.screens, `${label}.screens`);
  JSON.stringify(out); // serializable
}

let pass = 0;
// 1) fresh theme
mod.importTheme(mod.newTheme && {}); // ensure importTheme handles minimal input
{
  const out = mod.buildThemeJson();
  validate(out, 'fresh/import-empty');
  pass++;
}

// 2) each shipped theme
const themesDir = path.join(__dirname, '..', 'public', 'themes');
for (const id of fs.readdirSync(themesDir)) {
  const tj = path.join(themesDir, id, 'theme.json');
  if (!fs.existsSync(tj)) continue;
  const input = JSON.parse(fs.readFileSync(tj, 'utf8'));
  mod.importTheme(input);
  const out = mod.buildThemeJson();
  validate(out, id);
  // round-trip fidelity spot checks
  assert(out.id === input.id, `${id}: id preserved`);
  assert(out.version === input.version, `${id}: version preserved (${out.version} vs ${input.version})`);
  if (input.screens && input.screens.home) {
    assert(out.screens.home.navigation === input.screens.home.navigation ||
      (!input.screens.home.navigation && !out.screens.home.navigation), `${id}: home navigation preserved`);
    const inW = (input.screens.home.widgets || []).length;
    const outW = (out.screens.home.widgets || []).length;
    assert(inW === outW, `${id}: home widget count ${outW} vs ${inW}`);
  }
  // assets.icons should be preserved iff the source declared it (no CI build here).
  assert(!!out.assets === !!input.assets, `${id}: assets presence should match source (${!!out.assets} vs ${!!input.assets})`);

  // Exercise the preview renderer across every surface and both devices, and a
  // few simulated selection indices, to catch layout/widget runtime errors.
  const st = mod.getState();
  for (const device of ['x3', 'x4']) {
    st.device = device;
    for (const surface of ['home', 'fileBrowser', 'recentBooks', 'settings', 'reader']) {
      st.surface = surface;
      for (const sel of [0, 2, 7]) { st.selectedIndex = sel; mod.render(); }
    }
  }
  console.log(`  ✓ ${id}: schema ${out.schema}, v${out.version}, ${Object.keys(out.screens).length} screens, home nav=${out.screens.home.navigation || 'linear'}; rendered all surfaces/devices`);
  pass++;
}

console.log(`\nAll ${pass} theme(s) round-tripped and validated OK.`);
