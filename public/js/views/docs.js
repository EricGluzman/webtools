import { h, mount, debounce, formatBytes, formatMoney, formatDate, relativeTime } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api, upload } from '../core/api.js';
import { setTopbar, setCount } from '../core/shell.js';
import { store } from '../core/store.js';
import { toast, confirmDialog, segmented, copyText, emptyState, spinner } from '../core/ui.js';
import { navigate } from '../core/router.js';

const KINDS = [
  { value: '', label: 'Everything' },
  { value: 'receipt', label: 'Receipts' },
  { value: 'invoice', label: 'Invoices' },
  { value: 'document', label: 'Documents' },
];

export default async function render(root, ctx) {
  const state = {
    q: ctx?.query?.q || '',
    tag: ctx?.query?.tag || '',
    kind: '',
    from: '',
    to: '',
    starred: false,
    sort: 'newest',
  };
  let documents = [];
  let tags = [];
  let stats = null;
  let view = store.get('docsView') === 'list' ? 'list' : 'grid';
  let pollTimer = null;

  /* --------------------------------------------------------- pieces */

  const resultsHost = h('div');
  const tagCloud = h('div.tag-cloud');
  const statsHost = h('div.stat-cards');
  const uploadHost = h('div.upload-list');

  const search = h('input.input', {
    type: 'search',
    placeholder: 'Search inside every document…',
    value: state.q,
    'aria-label': 'Search documents',
  });

  const dropzone = h('div.dropzone', {
    onclick: () => pick(),
    ondragover: (event) => {
      event.preventDefault();
      dropzone.classList.add('drag-over');
    },
    ondragleave: () => dropzone.classList.remove('drag-over'),
    ondrop: (event) => {
      event.preventDefault();
      dropzone.classList.remove('drag-over');
      sendFiles([...(event.dataTransfer?.files || [])]);
    },
  },
    icon('upload', { size: 30 }),
    h('strong', 'Drop receipts, photos or PDFs here'),
    h('p', 'They are read with OCR on your server, tagged automatically, and become searchable by their contents.')
  );

  /* -------------------------------------------------------- uploads */

  function pick() {
    const picker = h('input', {
      type: 'file',
      multiple: true,
      accept: 'image/*,application/pdf',
      style: { display: 'none' },
    });
    picker.addEventListener('change', () => {
      sendFiles([...picker.files]);
      picker.remove();
    });
    document.body.append(picker);
    picker.click();
  }

  async function sendFiles(files) {
    const accepted = files.filter((file) => file.type.startsWith('image/') || file.type === 'application/pdf');
    if (!accepted.length) {
      if (files.length) toast('Only images and PDFs can be filed', 'error');
      return;
    }

    const bar = h('i', { style: { width: '0%' } });
    const row = h('div.upload-item',
      h('span.spinner'),
      h('span', accepted.length === 1 ? accepted[0].name : `${accepted.length} files`),
      h('span.upload-bar', bar));
    uploadHost.append(row);

    const form = new FormData();
    for (const file of accepted) form.append('files', file);

    try {
      const result = await upload('/api/docs', form, (ratio) => {
        bar.style.width = `${Math.round(ratio * 100)}%`;
      });
      row.remove();
      toast(`${result.documents.length} file${result.documents.length === 1 ? '' : 's'} filed — reading them now`);
      await refresh();
      startPolling();
    } catch (err) {
      row.remove();
      toast(err.message || 'Upload failed', 'error');
    }
  }

  const onGlobalFiles = () => {
    const files = window.__pendingUploads || [];
    window.__pendingUploads = null;
    if (files.length) sendFiles(files);
  };
  window.addEventListener('workbench:files', onGlobalFiles);

  /* ----------------------------------------------------------- data */

  async function refresh() {
    const query = {
      q: state.q,
      tag: state.tag,
      kind: state.kind,
      from: state.from,
      to: state.to,
      starred: state.starred ? '1' : '',
      sort: state.sort,
      limit: 120,
    };
    const [docsResult, tagsResult, statsResult] = await Promise.all([
      api('/api/docs', { query }),
      api('/api/docs/tags'),
      api('/api/docs/stats'),
    ]);
    documents = docsResult.documents;
    tags = tagsResult.tags.filter((tag) => tag.count > 0);
    stats = statsResult;
    setCount('docs', stats.totals.count);
    // Once there is something to look at, the dropzone steps out of the way.
    dropzone.classList.toggle('compact', stats.totals.count > 0);
    drawStats();
    drawTags();
    drawResults();
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      const pending = documents.some((doc) => doc.ocr_status === 'pending' || doc.ocr_status === 'working');
      if (!pending && stats && !stats.totals.processing) return stopPolling();
      try {
        await refresh();
      } catch {
        stopPolling();
      }
    }, 2500);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  /* ---------------------------------------------------------- draws */

  function drawStats() {
    if (!stats) return;
    const month = new Date().toISOString().slice(0, 7);
    const current = stats.spendByMonth.find((row) => row.month === month);
    const total = stats.spendByMonth.reduce((sum, row) => sum + (row.total || 0), 0);

    mount(statsHost,
      h('div.card.stat-card', h('span.k', 'Filed'), h('span.v', stats.totals.count),
        h('span.s', formatBytes(stats.totals.bytes))),
      h('div.card.stat-card', h('span.k', 'Receipts'), h('span.v', stats.totals.receipts),
        h('span.s', 'with amounts read off them')),
      h('div.card.stat-card', h('span.k', 'This month'), h('span.v', current ? formatMoney(current.total, '') : '0'),
        h('span.s', `${current?.count || 0} logged`)),
      h('div.card.stat-card', h('span.k', 'Tracked total'), h('span.v', formatMoney(total, '')),
        h('span.s', 'across the last 12 months'))
    );
  }

  function drawTags() {
    mount(tagCloud,
      h('button.chip', {
        'aria-pressed': String(!state.tag),
        onclick: () => {
          state.tag = '';
          refresh();
        },
      }, 'All'),
      ...tags.map((tag) =>
        h('button.chip', {
          class: `tone-${tag.color}`,
          'aria-pressed': String(state.tag === tag.name),
          onclick: () => {
            state.tag = state.tag === tag.name ? '' : tag.name;
            refresh();
          },
        }, tag.name, h('span.dim', { style: { fontSize: '10.5px' } }, String(tag.count))))
    );
    if (!tags.length) mount(tagCloud, h('span.small.dim', 'Tags appear once documents are read.'));
  }

  function statusLine(doc) {
    if (doc.ocr_status === 'pending' || doc.ocr_status === 'working') {
      return h('span.doc-status', h('span.pulse'), 'reading…');
    }

    if (doc.ocr_status === 'failed') return h('span.doc-status', { style: { color: 'var(--bad)' } }, 'OCR failed');
    if (doc.ocr_status === 'unavailable') return h('span.doc-status', { style: { color: 'var(--warn)' } }, 'OCR unavailable');
    return null;
  }

  function thumbFor(doc, fallbackSize = 20) {
    if (doc.thumb || doc.mime.startsWith('image/')) {
      return h('img', { src: `/api/docs/${doc.id}/thumb`, alt: '', loading: 'lazy' });
    }
    return h('span.ph', icon(doc.mime === 'application/pdf' ? 'file' : 'image', { size: fallbackSize }));
  }

  function docCard(doc) {
    return h('button.card.doc-card', { onclick: () => navigate(`/docs/${doc.id}`) },
      h('div.doc-thumb',
        thumbFor(doc, 26),
        doc.kind !== 'document' ? h('span.badge', doc.kind) : null,
        doc.amount ? h('span.amount', formatMoney(doc.amount, doc.currency)) : null),
      h('div.doc-body',
        h('strong.truncate', doc.title || doc.filename),
        h('div.meta',
          h('span', doc.doc_date ? formatDate(doc.doc_date) : relativeTime(doc.created_at)),
          statusLine(doc)),
        doc.tags.length
          ? h('div.tags', ...doc.tags.slice(0, 3).map((tag) => h('span.chip', { class: `tone-${tag.color}` }, tag.name)))
          : null)
    );
  }

  function docRow(doc) {
    return h('div.doc-row', { onclick: () => navigate(`/docs/${doc.id}`) },
      h('span.mini', thumbFor(doc, 16)),
      h('span.rmeta',
        h('strong.truncate', doc.title || doc.filename),
        h('span.line2',
          h('span', doc.doc_date ? formatDate(doc.doc_date) : relativeTime(doc.created_at)),
          doc.vendor ? h('span.truncate', doc.vendor) : null,
          ...doc.tags.slice(0, 3).map((tag) => h('span.chip', { class: `tone-${tag.color}` }, tag.name)),
          statusLine(doc))),
      doc.amount ? h('span.ramount', formatMoney(doc.amount, doc.currency)) : null
    );
  }

  let lastSignature = '';

  function drawResults() {
    // Polling brings the same rows back most of the time; re-mounting them
    // would repaint every glass card (and anything blurring them) for nothing.
    const signature = documents
      .map((doc) => `${doc.id}:${doc.ocr_status}:${doc.updated_at}:${doc.amount}`)
      .join('|') + `#${view}`;
    if (signature === lastSignature && resultsHost.firstChild) return;
    lastSignature = signature;

    if (!documents.length) {
      mount(resultsHost, stats && stats.totals.count
        ? emptyState('search', 'Nothing matches those filters', 'Clear the search or pick a different tag.',
            h('button.btn', {
              onclick: () => {
                Object.assign(state, { q: '', tag: '', kind: '', from: '', to: '', starred: false });
                search.value = '';
                refresh();
              },
            }, 'Clear filters'))
        : emptyState('folder', 'No documents yet', 'Drop a receipt or a PDF above to get started.'));
      return;
    }
    mount(resultsHost, view === 'grid'
      ? h('div.doc-grid', ...documents.map(docCard))
      : h('div.doc-rows', ...documents.map(docRow)));
  }

  /* --------------------------------------------------------- drawer */

  let drawerScrim = null;
  let drawerPoll = null;

  function closeDrawer({ back = true } = {}) {
    if (drawerPoll) {
      clearInterval(drawerPoll);
      drawerPoll = null;
    }
    if (!drawerScrim) return;
    drawerScrim.remove();
    drawerScrim = null;
    document.removeEventListener('keydown', drawerKey);
    if (back) history.replaceState(null, '', '#/docs');
  }

  const drawerKey = (event) => {
    if (event.key === 'Escape') closeDrawer();
  };

  async function openDrawer(id) {
    let doc;
    try {
      ({ document: doc } = await api(`/api/docs/${id}`));
    } catch (err) {
      return toast(err.message, 'error');
    }

    const preview = doc.mime === 'application/pdf'
      ? h('iframe', { src: `/api/docs/${doc.id}/file`, title: doc.filename })
      : h('img', { src: `/api/docs/${doc.id}/file`, alt: doc.title || doc.filename });

    const patch = debounce(async (body) => {
      try {
        const result = await api(`/api/docs/${doc.id}`, { method: 'PATCH', body });
        doc = { ...doc, ...result.document };
        await refresh();
      } catch (err) {
        toast(err.message, 'error');
      }
    }, 420);

    const fieldRow = (label, control) => h('label.field', h('span.label', label), control);

    const titleInput = h('input.input', {
      value: doc.title,
      oninput: (event) => patch({ title: event.target.value }),
    });
    const vendorInput = h('input.input', {
      value: doc.vendor,
      placeholder: 'Shop or issuer',
      oninput: (event) => patch({ vendor: event.target.value }),
    });
    const dateInput = h('input.input', {
      type: 'date',
      value: doc.doc_date || '',
      oninput: (event) => patch({ doc_date: event.target.value }),
    });
    const amountInput = h('input.input', {
      type: 'number',
      step: '0.01',
      value: doc.amount ?? '',
      placeholder: '0.00',
      oninput: (event) => patch({ amount: event.target.value }),
    });
    const currencyInput = h('input.input', {
      value: doc.currency,
      placeholder: 'EUR',
      maxlength: '6',
      oninput: (event) => patch({ currency: event.target.value.toUpperCase() }),
    });
    const noteInput = h('textarea.textarea', {
      placeholder: 'Your own note about this document…',
      style: { minHeight: '70px', fontFamily: 'var(--font)', fontSize: '13.4px' },
      oninput: (event) => patch({ note: event.target.value }),
    });
    noteInput.value = doc.note;

    const tagsHost = h('div.tag-cloud');
    const drawTagEditor = () => {
      mount(tagsHost,
        ...doc.tags.map((tag) =>
          h('span.chip', { class: `tone-${tag.color}` }, tag.name,
            h('span.chip-x', {
              title: 'Remove tag',
              onclick: async () => {
                const result = await api(`/api/docs/${doc.id}/tags/${tag.id}`, { method: 'DELETE' });
                doc.tags = result.tags;
                drawTagEditor();
                refresh();
              },
            }, icon('x', { size: 12 })))),
        h('button.chip', {
          onclick: () => {
            const input = h('input.input', {
              placeholder: 'Tag name',
              style: { height: '26px', width: '130px', padding: '0 9px', fontSize: '12px' },
            });
            input.addEventListener('keydown', async (event) => {
              if (event.key !== 'Enter') return;
              const name = input.value.trim();
              if (!name) return drawTagEditor();
              const result = await api(`/api/docs/${doc.id}/tags`, { method: 'POST', body: { name } });
              doc.tags = result.tags;
              drawTagEditor();
              refresh();
            });
            input.addEventListener('blur', () => drawTagEditor());
            tagsHost.append(input);
            input.focus();
          },
        }, icon('plus', { size: 12 }), 'Tag')
      );
    };
    drawTagEditor();

    const starButton = h('button.btn.btn-sm.btn-icon', {
      title: 'Star',
      style: doc.starred ? { color: 'var(--warn)' } : null,
      onclick: async (event) => {
        doc.starred = doc.starred ? 0 : 1;
        event.currentTarget.style.color = doc.starred ? 'var(--warn)' : '';
        await api(`/api/docs/${doc.id}`, { method: 'PATCH', body: { starred: doc.starred } });
        refresh();
      },
    }, icon('star', { size: 15 }));

    const drawer = h('div.drawer.glass',
      h('div.drawer-head',
        h('div.crumb', { style: { flex: '1', minWidth: '0' } },
          h('h1.truncate', { style: { fontSize: '17px' } }, doc.title || doc.filename),
          h('small.dim.truncate', `${doc.filename} · ${formatBytes(doc.size)}${doc.pages > 1 ? ` · ${doc.pages} pages` : ''}`)),
        starButton,
        h('a.btn.btn-sm.btn-icon', { href: `/api/docs/${doc.id}/download`, title: 'Download' }, icon('download', { size: 15 })),
        h('a.btn.btn-sm.btn-icon', { href: `/api/docs/${doc.id}/file`, target: '_blank', rel: 'noopener', title: 'Open in a new tab' },
          icon('external', { size: 15 })),
        h('button.btn.btn-sm.btn-icon', {
          title: 'Read it again',
          onclick: async () => {
            await api(`/api/docs/${doc.id}/reprocess`, { method: 'POST' });
            toast('Re-reading this document');
            closeDrawer();
            await refresh();
            startPolling();
          },
        }, icon('refresh', { size: 15 })),
        h('button.btn.btn-sm.btn-icon.btn-danger', {
          title: 'Delete',
          onclick: async () => {
            const ok = await confirmDialog({
              title: 'Delete this document?',
              message: 'The file and everything read from it will be removed from the server.',
            });
            if (!ok) return;
            await api(`/api/docs/${doc.id}`, { method: 'DELETE' });
            closeDrawer();
            toast('Deleted');
            refresh();
          },
        }, icon('trash', { size: 15 })),
        h('button.btn.btn-sm.btn-icon', { title: 'Close', onclick: () => closeDrawer() }, icon('x', { size: 15 }))
      ),
      h('div.drawer-body',
        h('div.detail-preview', preview),
        h('div.detail-side',
          fieldRow('Title', titleInput),
          h('div.tool-controls',
            h('div.field.grow', h('span.label', 'Vendor'), vendorInput),
            h('div.field', h('span.label', 'Date'), dateInput)),
          h('div.tool-controls',
            h('div.field.grow', h('span.label', 'Amount'), amountInput),
            h('div.field', { style: { maxWidth: '96px' } }, h('span.label', 'Currency'), currencyInput)),
          h('div.field', h('span.label', 'Tags'), tagsHost),
          fieldRow('Note', noteInput),
          h('div.field',
            h('span.label', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
              'Text read from the file',
              doc.text ? h('button.btn.btn-sm.btn-ghost', {
                style: { height: '20px', padding: '0 6px' },
                onclick: () => copyText(doc.text, 'Text copied'),
              }, 'copy') : null),
            doc.text
              ? h('div.ocr-text', doc.text)
              : h('div.notice', { class: doc.ocr_status === 'failed' ? 'notice-bad' : 'notice-warn' },
                  icon('info', { size: 15 }),
                  h('span', doc.ocr_error || (doc.ocr_status === 'pending' || doc.ocr_status === 'working'
                    ? 'Still reading this file…'
                    : 'No text could be read from this file.'))))
        )
      )
    );

    drawerScrim = h('div.drawer-scrim', {
      onmousedown: (event) => {
        if (event.target === drawerScrim) closeDrawer();
      },
    }, drawer);
    document.getElementById('overlays').append(drawerScrim);
    document.addEventListener('keydown', drawerKey);

    // A file opened mid-OCR should fill itself in once the text lands.
    if (doc.ocr_status === 'pending' || doc.ocr_status === 'working') {
      drawerPoll = setInterval(async () => {
        try {
          const { document: fresh } = await api(`/api/docs/${doc.id}`);
          if (fresh.ocr_status === 'pending' || fresh.ocr_status === 'working') return;
          clearInterval(drawerPoll);
          drawerPoll = null;
          if (drawerScrim) {
            closeDrawer({ back: false });
            openDrawer(fresh.id);
          }
          refresh();
        } catch {
          clearInterval(drawerPoll);
          drawerPoll = null;
        }
      }, 2000);
    }
  }

  /* ----------------------------------------------------------- boot */

  setTopbar({
    title: 'Documents',
    subtitle: 'Receipts and paperwork, read and tagged automatically',
    actions: [
      h('a.btn.btn-sm', { href: '/api/docs/export.csv', title: 'Export a spreadsheet of everything' },
        icon('download', { size: 15 }), h('span.btn-label', 'CSV')),
      h('button.btn.btn-sm.btn-primary', { onclick: () => pick() }, icon('upload', { size: 15 }), h('span.btn-label', 'Upload')),
    ],
  });

  const filterRail = h('aside.filter-rail.card',
    h('div.filter-group', h('span.label', 'Tags'), tagCloud),
    h('div.filter-group', h('span.label', 'Type'),
      h('select.select', {
        onchange: (event) => {
          state.kind = event.target.value;
          refresh();
        },
      }, ...KINDS.map((kind) => h('option', { value: kind.value }, kind.label)))),
    h('div.filter-group.dates', h('span.label', 'Date range'),
      h('input.input', {
        type: 'date',
        'aria-label': 'From date',
        onchange: (event) => {
          state.from = event.target.value;
          refresh();
        },
      }),
      h('input.input', {
        type: 'date',
        'aria-label': 'To date',
        onchange: (event) => {
          state.to = event.target.value;
          refresh();
        },
      })),
    h('div.filter-group', h('span.label', 'Sort'),
      h('select.select', {
        onchange: (event) => {
          state.sort = event.target.value;
          refresh();
        },
      },
        h('option', { value: 'newest' }, 'Newest first'),
        h('option', { value: 'oldest' }, 'Oldest first'),
        h('option', { value: 'amount' }, 'Largest amount'),
        h('option', { value: 'title' }, 'Title A→Z'))),
    h('label.check',
      h('input', {
        type: 'checkbox',
        onchange: (event) => {
          state.starred = event.target.checked;
          refresh();
        },
      }), 'Starred only')
  );

  search.addEventListener('input', debounce(() => {
    state.q = search.value;
    refresh();
  }, 220));

  const toolbar = h('div.notes-toolbar',
    h('div', { style: { flex: '1 1 240px', maxWidth: '460px' } }, search),
    h('span.spacer'),
    segmented([{ value: 'grid', label: 'Cards' }, { value: 'list', label: 'List' }], view, (value) => {
      view = store.set('docsView', value);
      drawResults();
    })
  );

  mount(root, h('div.page',
    statsHost,
    dropzone,
    uploadHost,
    toolbar,
    h('div.docs-layout', filterRail, resultsHost)
  ));

  mount(resultsHost, h('div', { style: { padding: '24px' } }, spinner('Loading documents…')));

  try {
    await refresh();
    if (stats?.totals.processing) startPolling();
  } catch (err) {
    mount(resultsHost, emptyState('info', 'Could not load documents', err.message));
  }

  if (ctx?.params?.id) openDrawer(ctx.params.id);
  if (ctx?.query?.upload === '1') {
    history.replaceState(null, '', '#/docs');
    if (window.__pendingUploads?.length) onGlobalFiles();
    else pick();
  }

  return () => {
    stopPolling();
    closeDrawer({ back: false });
    window.removeEventListener('workbench:files', onGlobalFiles);
  };
}
