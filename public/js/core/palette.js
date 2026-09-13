import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { TOOLS, searchTools, categoryOf } from '../tools/registry.js';
import { store } from './store.js';
import { navigate } from './router.js';

let open = false;
let actions = [];

/** Extra, app-level commands registered by app.js. */
export function registerActions(list) {
  actions = list;
}

function baseItems() {
  return [
    ...actions.map((action) => ({ ...action, group: 'Actions' })),
    ...TOOLS.map((tool) => ({
      id: `tool:${tool.id}`,
      title: tool.name,
      subtitle: tool.desc,
      icon: tool.icon,
      group: categoryOf(tool.cat)?.name || 'Tools',
      run: () => navigate(`/tools/${tool.id}`),
    })),
  ];
}

function suggestions(query) {
  if (!query.trim()) {
    const recent = store.get('recentTools') || [];
    const favorites = store.get('favorites') || [];
    const pinned = [...new Set([...favorites, ...recent])]
      .map((id) => TOOLS.find((tool) => tool.id === id))
      .filter(Boolean)
      .slice(0, 5)
      .map((tool) => ({
        id: `tool:${tool.id}`,
        title: tool.name,
        subtitle: tool.desc,
        icon: tool.icon,
        group: 'Jump back in',
        run: () => navigate(`/tools/${tool.id}`),
      }));
    return [...actions.map((action) => ({ ...action, group: 'Actions' })), ...pinned];
  }

  const needle = query.trim().toLowerCase();
  const matchedActions = actions
    .filter((action) => `${action.title} ${action.keywords || ''}`.toLowerCase().includes(needle))
    .map((action) => ({ ...action, group: 'Actions' }));

  const matchedTools = searchTools(query).map((tool) => ({
    id: `tool:${tool.id}`,
    title: tool.name,
    subtitle: tool.desc,
    icon: tool.icon,
    group: categoryOf(tool.cat)?.name || 'Tools',
    run: () => navigate(`/tools/${tool.id}`),
  }));

  return [...matchedActions, ...matchedTools].slice(0, 40);
}

export function openPalette(initial = '') {
  if (open) return;
  open = true;

  let items = [];
  let cursor = 0;

  const list = h('div.palette-list', { role: 'listbox' });
  const field = h('input', {
    type: 'text',
    placeholder: 'Search tools and actions…',
    'aria-label': 'Search tools and actions',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  field.value = initial;

  const panel = h('div.palette.glass',
    h('div.palette-input', icon('search', { size: 18 }), field),
    list,
    h('div.palette-foot',
      h('span', h('span.kbd', '↑'), h('span.kbd', '↓'), 'navigate'),
      h('span', h('span.kbd', '↵'), 'open'),
      h('span', h('span.kbd', 'esc'), 'close'))
  );
  const scrim = h('div.scrim', { style: { alignItems: 'flex-start' } }, panel);

  const close = () => {
    open = false;
    scrim.remove();
    document.removeEventListener('keydown', onKey, true);
  };

  const render = () => {
    items = suggestions(field.value);
    cursor = Math.min(cursor, Math.max(items.length - 1, 0));
    clear(list);

    if (!items.length) {
      list.append(h('div.palette-item.dim', { style: { justifyContent: 'center' } }, 'Nothing matched'));
      return;
    }

    let group = null;
    items.forEach((item, index) => {
      if (item.group !== group) {
        group = item.group;
        list.append(h('div.palette-group', group));
      }
      const row = h('div.palette-item', {
        role: 'option',
        'aria-selected': String(index === cursor),
        onmousemove: () => {
          if (cursor === index) return;
          cursor = index;
          [...list.querySelectorAll('.palette-item')].forEach((node, i) =>
            node.setAttribute('aria-selected', String(i === cursor)));
        },
        onclick: () => {
          close();
          item.run();
        },
      },
        h('span.pi-icon', icon(item.icon || 'bolt', { size: 15 })),
        h('span.pi-text', h('strong', item.title), item.subtitle ? h('small.truncate', item.subtitle) : null)
      );
      list.append(row);
    });
  };

  const move = (delta) => {
    if (!items.length) return;
    cursor = (cursor + delta + items.length) % items.length;
    const rows = [...list.querySelectorAll('.palette-item')];
    rows.forEach((node, index) => node.setAttribute('aria-selected', String(index === cursor)));
    rows[cursor]?.scrollIntoView({ block: 'nearest' });
  };

  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = items[cursor];
      if (item) {
        close();
        item.run();
      }
    }
  };

  field.addEventListener('input', () => {
    cursor = 0;
    render();
  });
  scrim.addEventListener('mousedown', (event) => {
    if (event.target === scrim) close();
  });
  document.addEventListener('keydown', onKey, true);

  document.getElementById('overlays').append(scrim);
  render();
  field.focus();
  field.select();
}

export function isPaletteOpen() {
  return open;
}
