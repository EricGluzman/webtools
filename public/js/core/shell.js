import { h, mount, $ } from './dom.js';
import { icon } from './icons.js';
import { navigate, currentPath } from './router.js';
import { openPalette } from './palette.js';
import { store, applyTheme } from './store.js';

export const NAV = [
  { id: 'home', label: 'Overview', icon: 'home', path: '/' },
  { id: 'tools', label: 'Tools', icon: 'grid', path: '/tools' },
  { id: 'notes', label: 'Notes', icon: 'note', path: '/notes' },
  { id: 'docs', label: 'Documents', icon: 'folder', path: '/docs' },
];

const counts = { notes: null, docs: null };

function navItem(item, { compact = false } = {}) {
  const node = h('a.nav-item', {
    href: `#${item.path}`,
    'data-nav': item.id,
    onclick: () => closeMobileNav(),
  }, icon(item.icon, { size: compact ? 18 : 17 }), h('span', item.label));

  if (!compact && counts[item.id] !== null && counts[item.id] !== undefined) {
    node.append(h('span.count', String(counts[item.id])));
  }
  return node;
}

export function renderNav() {
  const nav = $('#nav');
  const tabbar = $('#tabbar');
  if (nav) mount(nav, NAV.map((item) => navItem(item)));
  if (tabbar) mount(tabbar, NAV.map((item) => navItem(item, { compact: true })));
  markActive();
}

export function setCount(id, value) {
  counts[id] = value;
  renderNav();
}

export function markActive() {
  const path = currentPath();
  const active =
    NAV.slice().reverse().find((item) => item.path !== '/' && path.startsWith(item.path)) ||
    NAV[0];
  for (const node of document.querySelectorAll('[data-nav]')) {
    node.classList.toggle('active', node.dataset.nav === active.id);
  }
}

export function closeMobileNav() {
  $('#shell')?.classList.remove('nav-open');
}

/** Top bar contents are owned by whichever view is on screen. */
export function setTopbar({ title, subtitle, actions = [], back = null }) {
  const bar = $('#topbar');
  if (!bar) return;

  const menuButton = h('button.btn.btn-icon.sidebar-toggle', {
    'aria-label': 'Menu',
    onclick: () => $('#shell').classList.toggle('nav-open'),
  }, icon('menu', { size: 18 }));

  const backButton = back
    ? h('button.btn.btn-icon', {
        'aria-label': 'Back',
        title: 'Back',
        onclick: () => navigate(back),
      }, icon('arrowLeft', { size: 17 }))
    : null;

  const search = h('button.searchbox', { onclick: () => openPalette(), 'aria-label': 'Search tools' },
    icon('search'),
    h('span.label-text', 'Search tools…'),
    h('span.kbd', navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K')
  );

  const theme = h('button.btn.btn-icon', {
    'aria-label': 'Toggle theme',
    title: 'Toggle light / dark',
    onclick: (event) => {
      const next = applyTheme(store.get('theme') === 'dark' ? 'light' : 'dark');
      mount(event.currentTarget, icon(next === 'dark' ? 'moon' : 'sun', { size: 17 }));
    },
  }, icon(store.get('theme') === 'dark' ? 'moon' : 'sun', { size: 17 }));

  mount(bar,
    menuButton,
    backButton,
    h('div.crumb', h('h1.truncate', title), subtitle ? h('small.truncate', subtitle) : null),
    h('span.spacer'),
    ...actions,
    search,
    theme
  );
}

export function setStatus(children) {
  const foot = $('#sidebar-foot');
  if (foot) mount(foot, children);
}
