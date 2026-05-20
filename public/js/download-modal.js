// Download .bin modal — device picker + firmware picker (from /api/catalog) → download.

const MODAL_HTML = `
<div id="download-modal" class="fixed inset-0 z-[100] hidden items-center justify-center px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="download-modal-title">
  <div id="download-modal-backdrop" class="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"></div>
  <div class="relative w-full max-w-lg max-h-[calc(100vh-4rem)] overflow-y-auto rounded-2xl bg-white shadow-xl ring-1 ring-stone-950/5">
    <div class="flex items-start justify-between gap-4 border-b border-stone-100 px-6 py-4">
      <div>
        <h2 id="download-modal-title" class="font-serif text-xl font-medium text-stone-900">Download firmware</h2>
      </div>
      <button id="download-modal-close" type="button" class="-mr-2 -mt-1 rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Close">
        <svg class="size-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>

    <div class="space-y-6 px-6 py-5">
      <div class="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm/6 text-amber-900">
        <p>If your device is locked, our <a href="/#unlock-tool" class="font-medium underline underline-offset-2 hover:text-amber-950">Unlock Tool</a> lets you install CrossPoint over OTA instead of USB.</p>
      </div>

      <!-- Device -->
      <div>
        <div class="text-sm font-semibold text-stone-900">Select your device</div>
        <div class="mt-3 grid grid-cols-2 gap-3">
          <button class="dl-model-btn group relative rounded-xl border border-stone-200 p-4 text-left hover:border-stone-300" data-model="x4">
            <div class="text-sm font-semibold text-stone-900">Xteink X4</div>
            <div class="mt-0.5 text-xs text-stone-400">480 &times; 800</div>
          </button>
          <button class="dl-model-btn group relative rounded-xl border border-stone-200 p-4 text-left hover:border-stone-300" data-model="x3">
            <div class="text-sm font-semibold text-stone-900">Xteink X3</div>
            <div class="mt-0.5 text-xs text-stone-400">528 &times; 792</div>
          </button>
        </div>
      </div>

      <!-- Firmware -->
      <div id="dl-fw-section" class="hidden">
        <div class="text-sm font-semibold text-stone-900">Choose firmware</div>
        <div id="dl-fw-list" class="mt-3 space-y-2">
          <p class="text-sm text-stone-400">Loading...</p>
        </div>
      </div>

      <!-- Download -->
      <div id="dl-action" class="hidden">
        <button id="dl-download-btn" type="button" class="inline-flex items-center justify-center rounded-lg bg-brand-500 py-2 pr-4 pl-3 text-sm font-semibold text-white hover:bg-brand-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
          <svg class="mr-1.5 size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12l4.5 4.5m0 0l4.5-4.5M12 16.5V3"/></svg>
          <span id="dl-download-label">Download .bin</span>
        </button>
        <p id="dl-status" class="mt-2 text-xs text-stone-400"></p>
      </div>
    </div>
  </div>
</div>
`;

let state = {
  open: false,
  model: null,
  catalog: null,
  selectedReleaseId: null,
  loading: false,
};

function $(id) { return document.getElementById(id); }

function channelLabel(channel) {
  if (channel === 'stable') return 'Stable';
  if (channel === 'insider') return 'Insider (nightly)';
  if (channel === 'beta') return 'Beta';
  return channel;
}

function formatSize(bytes) {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function selectedRelease() {
  if (!state.catalog || !state.selectedReleaseId) return null;
  return state.catalog.releases.find(r => r.id === state.selectedReleaseId) || null;
}

function renderFirmwareList() {
  const section = $('dl-fw-section');
  const list = $('dl-fw-list');
  const action = $('dl-action');
  if (!state.model) {
    section.classList.add('hidden');
    action.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');

  if (state.loading || !state.catalog) {
    list.innerHTML = '<p class="text-sm text-stone-400">Loading...</p>';
    action.classList.add('hidden');
    return;
  }

  const releases = (state.catalog.releases || []).filter(r =>
    !r.supported_devices || r.supported_devices.includes(state.model)
  );
  if (releases.length === 0) {
    list.innerHTML = '<p class="text-sm text-stone-400">No firmware available right now.</p>';
    action.classList.add('hidden');
    return;
  }

  if (state.selectedReleaseId && !releases.some(r => r.id === state.selectedReleaseId)) {
    state.selectedReleaseId = null;
  }

  // Order: stable, insider, betas (newest first)
  const order = { stable: 0, insider: 1, beta: 2 };
  const sorted = [...releases].sort((a, b) => {
    const ca = order[a.channel] ?? 99;
    const cb = order[b.channel] ?? 99;
    if (ca !== cb) return ca - cb;
    return (b.released_at || '').localeCompare(a.released_at || '');
  });

  list.innerHTML = sorted.map(r => {
    const isSel = r.id === state.selectedReleaseId;
    const cls = isSel
      ? 'dl-fw-option w-full rounded-xl border-2 border-brand-500 bg-brand-50/40 p-3 text-left'
      : 'dl-fw-option w-full rounded-xl border border-stone-200 p-3 text-left hover:border-stone-300';
    const date = r.released_at ? new Date(r.released_at).toLocaleDateString() : '';
    return `
      <button type="button" class="${cls}" data-release-id="${r.id}">
        <div class="flex items-baseline justify-between gap-3">
          <div class="text-sm font-semibold text-stone-900">${escapeHtml(r.name || r.id)}</div>
          <div class="shrink-0 text-[11px] font-medium uppercase tracking-wide text-brand-500">${channelLabel(r.channel)}</div>
        </div>
        <div class="mt-0.5 font-mono text-[11px] text-stone-400 tabular-nums">${escapeHtml(r.version || '')} ${date ? '· ' + date : ''} ${r.size ? '· ' + formatSize(r.size) : ''}</div>
      </button>
    `;
  }).join('');

  list.querySelectorAll('.dl-fw-option').forEach(btn => {
    btn.addEventListener('click', () => {
      state.selectedReleaseId = btn.dataset.releaseId;
      renderFirmwareList();
    });
  });

  const sel = selectedRelease();
  action.classList.toggle('hidden', !sel);
  $('dl-download-btn').disabled = !sel;
  $('dl-status').textContent = '';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadCatalog() {
  state.loading = true;
  renderFirmwareList();
  try {
    const res = await fetch('/api/catalog');
    if (!res.ok) throw new Error(`Catalog request failed: ${res.status}`);
    state.catalog = await res.json();
  } catch (err) {
    console.error(err);
    state.catalog = { releases: [] };
    $('dl-fw-list').innerHTML = `<p class="text-sm text-red-600">Failed to load firmware list: ${escapeHtml(err.message)}</p>`;
  } finally {
    state.loading = false;
    renderFirmwareList();
  }
}

async function downloadSelected() {
  const r = selectedRelease();
  if (!r) return;
  const btn = $('dl-download-btn');
  const status = $('dl-status');
  btn.disabled = true;
  status.textContent = 'Downloading...';
  try {
    const res = await fetch(r.firmware_url);
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const blob = await res.blob();
    const filename = `crosspoint-${r.channel}-${(r.version || r.name || r.id).replace(/[^a-zA-Z0-9._-]+/g, '-')}-${state.model}.bin`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    status.textContent = `Saved as ${filename}`;
  } catch (err) {
    console.error(err);
    status.textContent = `Error: ${err.message}`;
    status.className = 'mt-2 text-xs text-red-600';
  } finally {
    btn.disabled = false;
  }
}

function styleModelButtons() {
  document.querySelectorAll('.dl-model-btn').forEach(btn => {
    const active = btn.dataset.model === state.model;
    btn.className = active
      ? 'dl-model-btn group relative rounded-xl border-2 border-brand-500 bg-brand-50/40 p-4 text-left'
      : 'dl-model-btn group relative rounded-xl border border-stone-200 p-4 text-left hover:border-stone-300';
  });
}

function openModal() {
  if (state.open) return;
  state.open = true;
  const modal = $('download-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';
  if (!state.catalog && !state.loading) loadCatalog();
}

function closeModal() {
  state.open = false;
  const modal = $('download-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.style.overflow = '';
}

function bindEvents() {
  $('download-modal-close').addEventListener('click', closeModal);
  $('download-modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && state.open) closeModal();
  });
  document.querySelectorAll('.dl-model-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      state.model = btn.dataset.model;
      styleModelButtons();
      renderFirmwareList();
    });
  });
  $('dl-download-btn').addEventListener('click', downloadSelected);
}

export function initDownloadModal() {
  if (document.getElementById('download-modal')) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = MODAL_HTML;
  document.body.appendChild(wrapper.firstElementChild);
  bindEvents();
  document.querySelectorAll('[data-open-download-modal]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      openModal();
    });
  });
}
