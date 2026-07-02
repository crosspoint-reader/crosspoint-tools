const headerLinks = [
  {
    href: '/fonts',
    paths: ['/fonts', '/fonts.html'],
    shortLabel: 'Fonts',
    label: 'Font Builder',
  },
  {
    href: '/docs.html',
    paths: ['/docs.html', '/docs'],
    label: 'Docs',
  },
  {
    href: '/roadmap',
    paths: ['/roadmap', '/roadmap.html'],
    label: 'Roadmap',
  },
  {
    href: '#',
    label: 'Download Firmware',
    shortLabel: 'Download',
    attrs: 'data-open-download-modal',
  },
  {
    href: '/#get-in-touch',
    homeHref: '#get-in-touch',
    label: 'Get In Touch',
    shortLabel: 'Contact',
  },
  {
    href: '/#unlock-tool',
    homeHref: '#unlock-tool',
    label: 'Have a locked device?',
    shortLabel: 'Locked?',
  },
];

const footerLinks = [
  {
    href: 'https://github.com/crosspoint-reader/crosspoint-reader',
    label: 'GitHub',
    attrs: 'target="_blank" rel="noopener"',
  },
  { href: '/docs.html', label: 'Docs' },
  { href: '/roadmap', label: 'Roadmap' },
  { href: '/fonts', label: 'Font Builder' },
  { href: '/kosync', label: 'Register for KoSync' },
];

const currentPath = window.location.pathname;
const isHome = currentPath === '/' || currentPath === '/index.html';

function isActive(link) {
  return Boolean(link.paths?.includes(currentPath));
}

function responsiveLabel(link) {
  if (!link.shortLabel) return link.label;
  return `
    <span class="sm:hidden">${link.shortLabel}</span>
    <span class="hidden sm:inline">${link.label}</span>
  `;
}

function headerLink(link) {
  const active = isActive(link);
  const href = isHome && link.homeHref ? link.homeHref : link.href;
  const className = active
    ? 'rounded-md bg-stone-100 px-2.5 py-1.5 text-xs/5 font-medium text-stone-900 no-underline sm:text-sm/5'
    : 'rounded-md px-2.5 py-1.5 text-xs/5 font-medium text-stone-500 no-underline hover:text-stone-700 sm:text-sm/5';

  return `
    <a href="${href}" ${link.attrs || ''} class="${className}">
      ${responsiveLabel(link)}
    </a>
  `;
}

function renderHeader(target) {
  target.outerHTML = `
    <nav class="border-b border-stone-200 bg-white">
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-y-3 px-4 py-3 sm:flex-nowrap sm:px-6">
        <a href="/" class="order-1 flex min-w-0 shrink-0 items-center gap-2 text-stone-900 no-underline" aria-label="Homepage">
          <img src="/logo.png" alt="" class="size-7 shrink-0 rounded-md">
          <span class="text-sm/5 font-medium tracking-tight sm:text-sm/6">
            <span class="sm:hidden">CrossPoint</span>
            <span class="hidden sm:inline">CrossPoint Reader</span>
          </span>
        </a>
        <div class="order-3 flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-2 sm:order-2 sm:ml-0 sm:w-auto sm:flex-1 sm:justify-center">
          ${headerLinks.map(headerLink).join('')}
        </div>
        <a href="https://app.royalty.dev/crosspoint-reader/crosspoint-reader" target="_blank" rel="noopener" class="order-2 inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#B8953A] py-1.5 pr-3 pl-2 text-xs/5 font-semibold text-white no-underline transition-colors hover:bg-[#9A7A2E] sm:order-3 sm:text-sm/5">
          <img src="/crown.svg" alt="" class="size-4 brightness-0 invert">
          <span class="sm:hidden">Fund</span>
          <span class="hidden sm:inline">Fund CrossPoint</span>
        </a>
      </div>
    </nav>
  `;
}

function renderFooter(target) {
  target.outerHTML = `
    <footer class="border-t border-stone-200 bg-stone-50 py-8">
      <div class="mx-auto max-w-6xl px-6">
        <div class="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p class="text-sm text-stone-400">CrossPoint Reader is open-source under the MIT license.</p>
          <div class="flex flex-wrap justify-center gap-x-4 gap-y-2">
            ${footerLinks.map(link => `<a href="${link.href}" ${link.attrs || ''} class="text-sm text-stone-400 no-underline hover:text-stone-600">${link.label}</a>`).join('')}
          </div>
        </div>
      </div>
    </footer>
  `;
}

document.querySelectorAll('[data-site-header]').forEach(renderHeader);
document.querySelectorAll('[data-site-footer]').forEach(renderFooter);

import('./download-modal.js')
  .then(({ initDownloadModal }) => initDownloadModal())
  .catch(err => console.error('Failed to initialize download modal', err));
