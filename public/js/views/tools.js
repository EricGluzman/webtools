import { h, mount, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { setTopbar } from '../core/shell.js';
import { store } from '../core/store.js';
import { TOOLS, CATEGORIES, searchTools } from '../tools/registry.js';

function toolCard(tool, onFavorite) {
  const favorite = store.isFavorite(tool.id);
  const star = h('button.btn.btn-icon.btn-sm.btn-ghost.fav', {
    class: favorite ? 'on' : '',
    title: favorite ? 'Remove from favourites' : 'Add to favourites',
    onclick: (event) => {
      event.preventDefault();
      event.stopPropagation();
      store.toggleFavorite(tool.id);
      onFavorite();
    },
  }, icon('star', { size: 15 }));

  return h('a.card.tool-card', { href: `#/tools/${tool.id}` },
    h('span.t-icon', icon(tool.icon, { size: 18 })),
    h('strong', tool.name),
    h('p', tool.desc),
    star
  );
}

export default function render(root, ctx) {
  let query = ctx?.query?.q || '';

  const search = h('input.input', {
    type: 'search',
    placeholder: 'Filter tools…',
    value: query,
    'aria-label': 'Filter tools',
  });
  const results = h('div.stack');

  const draw = () => {
    const favorites = store.get('favorites') || [];
    const matches = searchTools(query);
    mount(results);

    if (!matches.length) {
      results.append(h('div.empty', icon('search', { size: 32 }), h('h3', 'No tool matches that'),
        h('p.small', 'Try a different word — or search by what you want to do, like “encode” or “colour”.')));
      return;
    }

    if (!query && favorites.length) {
      const starred = TOOLS.filter((tool) => favorites.includes(tool.id));
      results.append(h('section.stack',
        h('div.cat-head', icon('star', { size: 16 }), h('h2', 'Favourites'), h('span.n', starred.length)),
        h('div.tool-grid', ...starred.map((tool) => toolCard(tool, draw)))));
    }

    for (const category of CATEGORIES) {
      const inCategory = matches.filter((tool) => tool.cat === category.id);
      if (!inCategory.length) continue;
      results.append(h('section.stack',
        h('div.cat-head', icon(category.icon, { size: 16 }), h('h2', category.name), h('span.n', inCategory.length)),
        h('div.tool-grid', ...inCategory.map((tool) => toolCard(tool, draw)))));
    }
  };

  const onInput = debounce(() => {
    query = search.value;
    const hash = query ? `#/tools?q=${encodeURIComponent(query)}` : '#/tools';
    history.replaceState(null, '', hash);
    draw();
  }, 110);
  search.addEventListener('input', onInput);

  setTopbar({
    title: 'Tools',
    subtitle: `${TOOLS.length} utilities, all running locally`,
  });

  mount(root, h('div.page',
    h('div.notes-toolbar', h('div.searchfield', { style: { flex: '1 1 240px', maxWidth: '380px' } }, search)),
    results
  ));
  draw();
  setTimeout(() => search.focus(), 40);
}
