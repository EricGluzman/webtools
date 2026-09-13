import { h, mount } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { setTopbar } from '../core/shell.js';
import { store } from '../core/store.js';
import { toolsById, loadTool, categoryOf } from '../tools/registry.js';
import { spinner } from '../core/ui.js';
import { navigate } from '../core/router.js';

export default async function render(root, ctx) {
  const tool = toolsById.get(ctx.params.id);

  if (!tool) {
    setTopbar({ title: 'Unknown tool', back: '/tools' });
    mount(root, h('div.empty', icon('info', { size: 32 }), h('h3', 'That tool does not exist'),
      h('a.btn', { href: '#/tools' }, 'Browse tools')));
    return;
  }

  store.pushRecent(tool.id);

  const favoriteButton = h('button.btn.btn-sm.btn-icon', {
    title: 'Favourite',
    'aria-label': 'Favourite',
    onclick: (event) => {
      store.toggleFavorite(tool.id);
      const on = store.isFavorite(tool.id);
      event.currentTarget.classList.toggle('on', on);
      event.currentTarget.style.color = on ? 'var(--warn)' : '';
    },
    style: store.isFavorite(tool.id) ? { color: 'var(--warn)' } : null,
  }, icon('star', { size: 15 }));

  setTopbar({
    title: tool.name,
    subtitle: `${categoryOf(tool.cat)?.name || 'Tools'} · ${tool.desc}`,
    back: '/tools',
    actions: [favoriteButton],
  });

  const host = h('div.tool-page');
  mount(root, host);
  mount(host, h('div', { style: { padding: '28px' } }, spinner('Loading tool…')));

  const module = await loadTool(tool.id);
  mount(host);

  const context = {
    tool,
    state: store.toolState(tool.id),
    save: (patch) => store.toolState(tool.id, patch),
    navigate,
  };
  const cleanup = await module.default(host, context);
  return typeof cleanup === 'function' ? cleanup : undefined;
}
