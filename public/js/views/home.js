import { h, mount, formatBytes, formatMoney, relativeTime } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { setTopbar, setCount } from '../core/shell.js';
import { store } from '../core/store.js';
import { TOOLS, toolsById } from '../tools/registry.js';
import { openPalette } from '../core/palette.js';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 5) return 'Still up';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

function toolCard(tool) {
  return h('a.card.tool-card', { href: `#/tools/${tool.id}` },
    h('span.t-icon', icon(tool.icon, { size: 18 })),
    h('strong', tool.name),
    h('p', tool.desc)
  );
}

function statCard(label, value, sub) {
  return h('div.card.stat-card', h('span.k', label), h('span.v', value), sub ? h('span.s', sub) : null);
}

export default async function render(root) {
  setTopbar({
    title: 'Overview',
    subtitle: new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date()),
    actions: [
      h('a.btn.btn-sm', { href: '#/notes' }, icon('plus', { size: 15 }), h('span.btn-label', 'Note')),
      h('a.btn.btn-sm.btn-primary', { href: '#/docs?upload=1' }, icon('upload', { size: 15 }), h('span.btn-label', 'Upload')),
    ],
  });

  const page = h('div.page');
  mount(root, page);

  const favorites = (store.get('favorites') || []).map((id) => toolsById.get(id)).filter(Boolean);
  const recents = (store.get('recentTools') || []).map((id) => toolsById.get(id)).filter(Boolean);
  const highlighted = [...favorites, ...recents.filter((tool) => !favorites.includes(tool))].slice(0, 8);
  const picks = highlighted.length
    ? highlighted
    : ['json', 'regex', 'color', 'time', 'base64', 'qr', 'diff', 'password'].map((id) => toolsById.get(id));

  page.append(
    h('section.hero.glass',
      h('div.hero-text',
        h('h1', `${greeting()}.`),
        h('p', 'Your private workbench: a drawer of small tools, a board of sticky notes, and a searchable pile of scanned receipts and documents.'),
        h('div.hero-actions',
          h('button.btn.btn-primary', { onclick: () => openPalette() }, icon('search', { size: 15 }), 'Find a tool'),
          h('a.btn', { href: '#/notes' }, icon('note', { size: 15 }), 'Sticky notes'),
          h('a.btn', { href: '#/docs' }, icon('scan', { size: 15 }), 'Documents')
        )
      )
    )
  );

  const statsRow = h('div.stat-cards',
    statCard('Tools', TOOLS.length, 'all offline, no accounts'),
    statCard('Notes', '—', 'loading'),
    statCard('Documents', '—', 'loading'),
    statCard('This month', '—', 'receipts total')
  );
  page.append(statsRow);

  page.append(
    h('section.stack',
      h('div.section-title', highlighted.length ? 'Your tools' : 'Popular tools'),
      h('div.tool-grid', ...picks.filter(Boolean).map(toolCard))
    )
  );

  const recentNotes = h('div.stack-sm');
  const recentDocs = h('div.stack-sm');
  page.append(
    h('div.tool-split',
      h('section.stack',
        h('div.section-title', 'Latest notes'),
        recentNotes),
      h('section.stack',
        h('div.section-title', 'Latest documents'),
        recentDocs)
    )
  );

  /* ---------------------------------------------------------- data */

  try {
    const [{ notes }, { documents }, stats] = await Promise.all([
      api('/api/notes'),
      api('/api/docs', { query: { limit: 5 } }),
      api('/api/docs/stats'),
    ]);

    setCount('notes', notes.length);
    setCount('docs', stats.totals.count);

    const month = new Date().toISOString().slice(0, 7);
    const thisMonth = stats.spendByMonth.find((row) => row.month === month);

    mount(statsRow,
      statCard('Tools', TOOLS.length, 'all offline, no accounts'),
      statCard('Notes', notes.length, notes.length ? `updated ${relativeTime(notes[0].updated_at)}` : 'nothing pinned yet'),
      statCard('Documents', stats.totals.count, formatBytes(stats.totals.bytes)),
      statCard('This month', thisMonth ? formatMoney(thisMonth.total, '') : '0', `${thisMonth?.count || 0} receipts logged`)
    );

    mount(recentNotes,
      notes.length
        ? notes.slice(0, 5).map((note) =>
            h('a.card.hoverable', {
              href: '#/notes',
              class: `tone-${note.color}`,
              style: { padding: '11px 14px', display: 'grid', gap: '2px', borderLeft: '3px solid var(--tone)' },
            },
              h('strong', { style: { fontSize: '13.4px' } }, note.title || 'Untitled note'),
              h('span.small.muted.truncate', note.body.split('\n')[0] || 'Empty'),
              h('span.tiny.dim', relativeTime(note.updated_at))
            ))
        : h('div.card', { style: { padding: '18px', textAlign: 'center' } },
            h('p.small.muted', 'No notes yet.'),
            h('a.btn.btn-sm', { href: '#/notes', style: { marginTop: '10px' } }, 'Write one'))
    );

    mount(recentDocs,
      documents.length
        ? documents.map((doc) =>
            h('a.doc-row', { href: `#/docs/${doc.id}` },
              h('span.mini', doc.thumb || doc.mime.startsWith('image/')
                ? h('img', { src: `/api/docs/${doc.id}/thumb`, alt: '', loading: 'lazy' })
                : icon('file', { size: 17 })),
              h('span.rmeta',
                h('strong.truncate', doc.title || doc.filename),
                h('span.line2',
                  doc.doc_date ? h('span', doc.doc_date) : h('span', relativeTime(doc.created_at)),
                  ...doc.tags.slice(0, 2).map((tag) => h('span.chip', { class: `tone-${tag.color}` }, tag.name)))),
              doc.amount ? h('span.ramount', formatMoney(doc.amount, doc.currency)) : null
            ))
        : h('div.card', { style: { padding: '18px', textAlign: 'center' } },
            h('p.small.muted', 'Nothing filed yet.'),
            h('a.btn.btn-sm', { href: '#/docs?upload=1', style: { marginTop: '10px' } }, 'Upload a receipt'))
    );
  } catch (err) {
    page.append(h('p.small.dim', `Could not load your data: ${err.message}`));
  }
}
