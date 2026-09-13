import { h, mount, debounce, relativeTime } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { api } from '../core/api.js';
import { setTopbar, setCount } from '../core/shell.js';
import { store } from '../core/store.js';
import { toast, confirmDialog, segmented, copyText } from '../core/ui.js';

const COLORS = ['amber', 'rose', 'violet', 'sky', 'lime', 'teal', 'pink', 'slate'];

export default async function render(root, ctx) {
  let notes = [];
  let view = store.get('notesView') === 'list' ? 'list' : 'board';
  let filter = '';

  const board = h('div.board');
  const list = h('div.notes-list');
  const stage = h('div');

  const search = h('input.input', {
    type: 'search',
    placeholder: 'Search notes…',
    'aria-label': 'Search notes',
  });

  /* -------------------------------------------------------- server */

  // Edits are merged per note so a quick title-then-body change keeps both.
  const pending = new Map();

  const flushSaves = debounce(async () => {
    const batch = [...pending.entries()];
    pending.clear();
    for (const [id, patch] of batch) {
      try {
        await api(`/api/notes/${id}`, { method: 'PATCH', body: patch });
      } catch (err) {
        toast(`Could not save: ${err.message}`, 'error');
      }
    }
  }, 450);

  function saveNote(id, patch) {
    pending.set(id, { ...(pending.get(id) || {}), ...patch });
    flushSaves();
  }

  saveNote.flush = (id, patch) => {
    if (patch) pending.set(id, { ...(pending.get(id) || {}), ...patch });
    flushSaves.flush();
  };

  const savePosition = async (id, patch) => {
    try {
      await api(`/api/notes/${id}`, { method: 'PATCH', body: patch });
    } catch (err) {
      toast(`Could not save position: ${err.message}`, 'error');
    }
  };

  async function addNote(seed = {}) {
    // Tile new notes into the first free cell so nothing lands on top of anything.
    const columns = Math.max(1, Math.floor((board.clientWidth || 1000) / 300));
    const occupied = new Set(notes.map((note) => `${Math.round(note.x / 300)}:${Math.round(note.y / 270)}`));
    let x = 24;
    let y = 24;
    for (let slot = 0; slot < 400; slot += 1) {
      const column = slot % columns;
      const row = Math.floor(slot / columns);
      if (occupied.has(`${column}:${row}`)) continue;
      x = 24 + column * 300;
      y = 24 + row * 270;
      break;
    }
    const { note } = await api('/api/notes', {
      method: 'POST',
      body: { color: COLORS[notes.length % COLORS.length], x, y, w: 280, h: 250, ...seed },
    });
    notes.unshift(note);
    setCount('notes', notes.length);
    draw();
    const fresh = document.querySelector(`[data-note="${note.id}"] .note-head input`);
    if (fresh) fresh.focus();
  }

  async function removeNote(note) {
    const ok = await confirmDialog({
      title: 'Delete this note?',
      message: note.title || note.body ? `“${(note.title || note.body).slice(0, 60)}” will be gone for good.` : 'This note will be gone for good.',
    });
    if (!ok) return;
    await api(`/api/notes/${note.id}`, { method: 'DELETE' });
    notes = notes.filter((item) => item.id !== note.id);
    setCount('notes', notes.length);
    draw();
    toast('Note deleted');
  }

  /* ---------------------------------------------------------- note */

  function noteEl(note) {
    const title = h('input', {
      dir: 'auto',
      value: note.title,
      placeholder: 'Title',
      'aria-label': 'Note title',
      oninput: (event) => {
        note.title = event.target.value;
        saveNote(note.id, { title: note.title });
      },
    });

    const body = h('textarea.note-body', {
      dir: 'auto',
      placeholder: 'Write something…',
      'aria-label': 'Note text',
      spellcheck: 'true',
      oninput: (event) => {
        note.body = event.target.value;
        saveNote(note.id, { body: note.body });
      },
    });
    body.value = note.body;

    const pin = h('button', {
      class: note.pinned ? 'on' : '',
      title: note.pinned ? 'Unpin' : 'Pin to the top',
      'aria-label': 'Pin note',
      onclick: (event) => {
        note.pinned = note.pinned ? 0 : 1;
        event.currentTarget.classList.toggle('on', Boolean(note.pinned));
        saveNote.flush(note.id, { pinned: note.pinned });
        if (view === 'list') draw();
      },
    }, icon('pin', { size: 14 }));

    const colorButton = h('button', { title: 'Colour', 'aria-label': 'Note colour' }, icon('palette', { size: 14 }));
    colorButton.addEventListener('click', (event) => {
      const existing = element.querySelector('.palette-dots');
      if (existing) return existing.remove();
      const dots = h('div.palette-dots', {
        style: { position: 'absolute', right: '8px', top: '34px', zIndex: '5', borderRadius: '12px' },
        class: 'glass',
      },
        ...COLORS.map((color) =>
          h('button', {
            class: `tone-${color}`,
            title: color,
            onclick: () => {
              note.color = color;
              element.className = `note tone-${color}${note.pinned ? ' pinned' : ''}`;
              saveNote.flush(note.id, { color });
              dots.remove();
            },
          }))
      );
      element.append(dots);
      setTimeout(() => {
        document.addEventListener('click', function away(e) {
          if (!dots.contains(e.target) && e.target !== event.currentTarget) {
            dots.remove();
            document.removeEventListener('click', away);
          }
        });
      }, 0);
    });

    const element = h('div.note', {
      class: `tone-${note.color}${note.pinned ? ' pinned' : ''}`,
      'data-note': note.id,
      style: view === 'board'
        ? { left: `${note.x}px`, top: `${note.y}px`, width: `${note.w}px`, height: `${note.h}px`, zIndex: String(note.z) }
        : null,
    },
      h('div.note-head',
        title,
        h('div.note-tools',
          pin,
          colorButton,
          h('button', {
            title: 'Copy text',
            'aria-label': 'Copy note text',
            onclick: () => copyText(`${note.title ? `${note.title}\n\n` : ''}${note.body}`, 'Note copied'),
          }, icon('copy', { size: 14 })),
          h('button', {
            title: 'Delete',
            'aria-label': 'Delete note',
            onclick: () => removeNote(note),
          }, icon('trash', { size: 14 })))
      ),
      body,
      h('div.note-foot', h('span', relativeTime(note.updated_at))),
      view === 'board' ? h('div.note-resize', { title: 'Resize' }) : null
    );

    if (view === 'board') {
      makeDraggable(element, note);
      makeResizable(element, note);
    }
    return element;
  }

  /* ------------------------------------------------------ dragging */

  function makeDraggable(element, note) {
    const head = element.querySelector('.note-head');

    // Clicking anywhere in a note brings it forward.
    element.addEventListener('pointerdown', () => {
      if (note.z >= topZ()) return;
      note.z = topZ() + 1;
      element.style.zIndex = String(note.z);
      savePosition(note.id, { z: note.z });
    }, true);

    head.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || event.target.closest('button')) return;

      const startX = event.clientX;
      const startY = event.clientY;
      const originX = note.x;
      const originY = note.y;
      let dragging = false;

      // The title input fills the header, so a press only becomes a drag once
      // the pointer actually moves — a plain click still puts the caret in.
      const move = (moveEvent) => {
        if (!dragging) {
          if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 4) return;
          dragging = true;
          element.classList.add('dragging');
          if (document.activeElement && head.contains(document.activeElement)) document.activeElement.blur();
          note.z = topZ() + 1;
          element.style.zIndex = String(note.z);
        }
        moveEvent.preventDefault();
        const bounds = board.getBoundingClientRect();
        note.x = Math.max(0, Math.min(originX + moveEvent.clientX - startX, bounds.width - 60));
        note.y = Math.max(0, originY + moveEvent.clientY - startY);
        element.style.left = `${note.x}px`;
        element.style.top = `${note.y}px`;
      };

      const up = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        if (!dragging) return;
        element.classList.remove('dragging');
        savePosition(note.id, { x: Math.round(note.x), y: Math.round(note.y), z: note.z });
        growBoard();
      };

      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }

  function makeResizable(element, note) {
    const handle = element.querySelector('.note-resize');
    if (!handle) return;
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      handle.setPointerCapture(event.pointerId);
      const startX = event.clientX;
      const startY = event.clientY;
      const startW = note.w;
      const startH = note.h;

      const move = (moveEvent) => {
        note.w = Math.max(190, startW + moveEvent.clientX - startX);
        note.h = Math.max(140, startH + moveEvent.clientY - startY);
        element.style.width = `${note.w}px`;
        element.style.height = `${note.h}px`;
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        savePosition(note.id, { w: Math.round(note.w), h: Math.round(note.h) });
        growBoard();
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  const topZ = () => notes.reduce((max, note) => Math.max(max, note.z || 1), 1);

  function growBoard() {
    const lowest = notes.reduce((max, note) => Math.max(max, note.y + note.h), 0);
    board.style.minHeight = `${Math.max(lowest + 60, window.innerHeight * 0.62)}px`;
  }

  /* ---------------------------------------------------------- draw */

  function visible() {
    const needle = filter.trim().toLowerCase();
    if (!needle) return notes;
    return notes.filter((note) => `${note.title} ${note.body}`.toLowerCase().includes(needle));
  }

  function draw() {
    const items = visible();
    if (!items.length) {
      mount(stage, h('div.empty',
        icon('note', { size: 34 }),
        h('h3', filter ? 'No note matches' : 'The board is empty'),
        h('p.small', filter ? 'Try another word.' : 'Notes stay exactly where you put them, on this server.'),
        filter ? null : h('button.btn.btn-primary', { onclick: () => addNote() }, icon('plus', { size: 15 }), 'Add your first note')
      ));
      return;
    }

    if (view === 'board') {
      mount(board, ...items.map(noteEl));
      mount(stage, board);
      growBoard();
    } else {
      const sorted = [...items].sort((a, b) =>
        (b.pinned - a.pinned) || new Date(b.updated_at) - new Date(a.updated_at));
      mount(list, ...sorted.map(noteEl));
      mount(stage, list);
    }
  }

  /* ---------------------------------------------------------- boot */

  setTopbar({
    title: 'Sticky notes',
    subtitle: 'Drag them anywhere — they stay put',
    actions: [h('button.btn.btn-sm.btn-primary', { onclick: () => addNote() }, icon('plus', { size: 15 }), h('span.btn-label', 'New note'))],
  });

  const toolbar = h('div.notes-toolbar',
    h('div.searchfield', { style: { flex: '1 1 200px', maxWidth: '320px' } }, search),
    h('span.spacer'),
    segmented([{ value: 'board', label: 'Board' }, { value: 'list', label: 'List' }], view, (value) => {
      view = store.set('notesView', value);
      draw();
    })
  );

  search.addEventListener('input', debounce(() => {
    filter = search.value;
    draw();
  }, 120));

  mount(root, h('div.page', toolbar, stage));

  try {
    const data = await api('/api/notes');
    notes = data.notes;
    setCount('notes', notes.length);
    draw();
    if (ctx?.query?.new === '1') {
      history.replaceState(null, '', '#/notes');
      addNote();
    }
  } catch (err) {
    mount(stage, h('div.empty', icon('info', { size: 32 }), h('h3', 'Could not load notes'), h('p.small', err.message)));
  }

  const onResize = () => {
    if (view === 'board') growBoard();
  };
  window.addEventListener('resize', onResize);
  // Pending debounced saves are allowed to finish after the view unmounts.
  return () => window.removeEventListener('resize', onResize);
}
