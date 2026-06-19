// Buy modal — device picker that links out to the Xteink store for the unlocked developer edition.

const MODAL_HTML = `
<div id="buy-modal" class="fixed inset-0 z-[100] hidden items-center justify-center px-4 py-8" role="dialog" aria-modal="true" aria-labelledby="buy-modal-title">
  <div id="buy-modal-backdrop" class="absolute inset-0 bg-stone-900/40 backdrop-blur-sm"></div>
  <div class="relative w-full max-w-lg max-h-[calc(100vh-4rem)] overflow-y-auto rounded-2xl bg-white shadow-xl ring-1 ring-stone-950/5">
    <div class="flex items-start justify-between gap-4 border-b border-stone-100 px-6 py-4">
      <div>
        <h2 id="buy-modal-title" class="font-serif text-xl font-medium text-stone-900">Buy an unlocked developer edition</h2>
      </div>
      <button id="buy-modal-close" type="button" class="-mr-2 -mt-1 rounded-md p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700" aria-label="Close">
        <svg class="size-5" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>

    <div class="space-y-5 px-6 py-5">
      <p class="text-sm/6 text-stone-500 text-pretty">Developer editions ship unlocked, ready to flash CrossPoint over USB. Pick your device to view it on the Xteink store.</p>

      <!-- Device -->
      <div>
        <div class="text-sm font-semibold text-stone-900">Select your device</div>
        <div class="mt-3 grid grid-cols-2 gap-3">
          <a href="https://go.sjv.io/2RV5N7" target="_blank" rel="noopener" class="group relative rounded-xl border border-stone-200 p-4 no-underline hover:border-brand-500 hover:bg-brand-50/40">
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-semibold text-stone-900">Xteink X4</div>
              <svg class="size-4 shrink-0 text-stone-300 group-hover:text-brand-500" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/></svg>
            </div>
            <div class="mt-0.5 text-xs text-stone-400">480 &times; 800</div>
          </a>
          <a href="https://go.sjv.io/m4oEmM" target="_blank" rel="noopener" class="group relative rounded-xl border border-stone-200 p-4 no-underline hover:border-brand-500 hover:bg-brand-50/40">
            <div class="flex items-center justify-between gap-2">
              <div class="text-sm font-semibold text-stone-900">Xteink X3</div>
              <svg class="size-4 shrink-0 text-stone-300 group-hover:text-brand-500" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"/></svg>
            </div>
            <div class="mt-0.5 text-xs text-stone-400">528 &times; 792</div>
          </a>
        </div>
      </div>

      <p class="text-xs/5 text-stone-400">Opens xteink.com in a new tab.</p>
    </div>
  </div>
</div>
`;

let open = false;

function $(id) { return document.getElementById(id); }

function openModal() {
  if (open) return;
  open = true;
  const modal = $('buy-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  open = false;
  const modal = $('buy-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  document.body.style.overflow = '';
}

function bindEvents() {
  $('buy-modal-close').addEventListener('click', closeModal);
  $('buy-modal-backdrop').addEventListener('click', closeModal);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && open) closeModal();
  });
  document.querySelectorAll('[data-open-buy-modal]').forEach(el => {
    el.addEventListener('click', e => {
      e.preventDefault();
      openModal();
    });
  });
}

export function initBuyModal() {
  if (document.getElementById('buy-modal')) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = MODAL_HTML;
  document.body.appendChild(wrapper.firstElementChild);
  bindEvents();
}
