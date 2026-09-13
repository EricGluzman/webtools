import { $, h, mount } from './core/dom.js';
import { icon } from './core/icons.js';
import { api, onUnauthorized } from './core/api.js';
import { store, applyTheme } from './core/store.js';
import { route, setNotFound, start, navigate, currentPath } from './core/router.js';
import { openPalette, registerActions, isPaletteOpen } from './core/palette.js';
import { renderNav, markActive, setTopbar, setStatus, closeMobileNav } from './core/shell.js';
import { toast } from './core/ui.js';

const view = () => $('#view');

/* --------------------------------------------------------------- login */

function renderLogin(message = '') {
  document.body.innerHTML = '';
  const backdrop = h('div.backdrop', { 'aria-hidden': 'true' },
    h('span.blob.blob-a'), h('span.blob.blob-b'), h('span.blob.blob-c'), h('span.grain'));

  const password = h('input.input', { type: 'password', placeholder: 'Password', autofocus: true });
  const error = h('p.small', { style: { color: 'var(--bad)', minHeight: '18px' } }, message);

  const submit = async () => {
    error.textContent = '';
    try {
      await api('/api/auth/login', { method: 'POST', body: { password: password.value } });
      location.reload();
    } catch (err) {
      error.textContent = err.message || 'Wrong password';
      password.select();
    }
  };

  password.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit();
  });

  document.body.append(backdrop,
    h('div.login-wrap',
      h('form.login-card.glass', { onsubmit: (event) => { event.preventDefault(); submit(); } },
        h('span.brand-mark'),
        h('h1', 'Workbench'),
        h('p', 'This instance is private. Enter the password to continue.'),
        password,
        error,
        h('button.btn.btn-primary', { type: 'submit', style: { width: '100%', height: '40px' } }, 'Unlock')
      )
    )
  );
  setTimeout(() => password.focus(), 60);
}

/* ---------------------------------------------------------- view loader */

let disposeView = null;

async function show(loader, ctx) {
  if (typeof disposeView === 'function') {
    try {
      disposeView();
    } catch {
      /* a view that fails to clean up must not block the next one */
    }
  }
  disposeView = null;
  markActive();
  closeMobileNav();

  const container = view();
  container.scrollTop = 0;
  try {
    const module = await loader();
    const result = await module.default(container, ctx);
    if (typeof result === 'function') disposeView = result;
  } catch (err) {
    console.error(err);
    mount(container,
      h('div.empty',
        icon('info', { size: 34 }),
        h('h3', 'This screen failed to load'),
        h('p.small', err.message || String(err)),
        h('button.btn', { onclick: () => location.reload() }, 'Reload')
      )
    );
  }
}

/* ----------------------------------------------------------- app boot */

async function boot() {
  applyTheme(store.get('theme'));

  let state = { enabled: false, authed: true };
  try {
    state = await api('/api/auth/state');
  } catch {
    /* server unreachable: fall through and let views show the error */
  }
  if (state.enabled && !state.authed) return renderLogin();

  onUnauthorized(() => renderLogin('Session expired — sign in again.'));

  renderNav();

  registerActions([
    { id: 'new-note', title: 'New sticky note', subtitle: 'Add a note to the board', icon: 'note',
      keywords: 'note create add', run: () => navigate('/notes?new=1') },
    { id: 'upload', title: 'Upload documents', subtitle: 'Scan receipts and files with OCR', icon: 'upload',
      keywords: 'upload receipt scan ocr pdf', run: () => navigate('/docs?upload=1') },
    { id: 'theme', title: 'Toggle light / dark', icon: 'sun', keywords: 'theme dark light appearance',
      run: () => {
        applyTheme(store.get('theme') === 'dark' ? 'light' : 'dark');
        setTopbarRefresh();
      } },
    { id: 'all-tools', title: 'Browse all tools', icon: 'grid', keywords: 'tools list all',
      run: () => navigate('/tools') },
  ]);

  route('/', () => show(() => import('./views/home.js'), {}));
  route('/tools', (ctx) => show(() => import('./views/tools.js'), ctx));
  route('/tools/:id', (ctx) => show(() => import('./views/tool.js'), ctx));
  route('/notes', (ctx) => show(() => import('./views/notes.js'), ctx));
  route('/docs', (ctx) => show(() => import('./views/docs.js'), ctx));
  route('/docs/:id', (ctx) => show(() => import('./views/docs.js'), ctx));
  setNotFound(() => {
    setTopbar({ title: 'Not found' });
    mount(view(),
      h('div.empty', icon('info', { size: 34 }), h('h3', 'Nothing here'),
        h('p.small', currentPath()),
        h('a.btn', { href: '#/' }, 'Go to overview'))
    );
  });

  document.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    const inField = /^(input|textarea|select)$/i.test(event.target.tagName) || event.target.isContentEditable;

    if ((event.metaKey || event.ctrlKey) && key === 'k') {
      event.preventDefault();
      openPalette();
    } else if (key === '/' && !inField && !isPaletteOpen()) {
      event.preventDefault();
      openPalette();
    }
  });

  // Files dragged onto any screen go to the document organizer.
  let dragDepth = 0;
  let overlay = null;
  window.addEventListener('dragenter', (event) => {
    if (![...(event.dataTransfer?.types || [])].includes('Files')) return;
    dragDepth += 1;
    if (overlay) return;
    overlay = h('div.drop-overlay', h('div.inner', icon('upload', { size: 30 }), 'Drop files to file them away'));
    document.getElementById('overlays').append(overlay);
  });
  window.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0 && overlay) {
      overlay.remove();
      overlay = null;
    }
  });
  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    dragDepth = 0;
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    const files = [...(event.dataTransfer?.files || [])];
    if (!files.length) return;
    window.__pendingUploads = files;
    if (currentPath().startsWith('/docs')) window.dispatchEvent(new CustomEvent('workbench:files'));
    else navigate('/docs?upload=1');
  });

  refreshStatus();
  start();
}

function setTopbarRefresh() {
  window.dispatchEvent(new CustomEvent('workbench:theme'));
}

async function refreshStatus() {
  try {
    const health = await api('/api/health');
    const ocrReady = health.ocr.tesseract;
    setStatus([
      h('div.status-line',
        h('span.status-dot', { class: ocrReady ? '' : 'warn' }),
        h('span', ocrReady ? 'OCR ready' : 'OCR not installed')
      ),
      h('div.status-line', { style: { opacity: '.8' } },
        h('span', { style: { marginLeft: '13px' } }, `v${health.version} · local only`)
      ),
    ]);
  } catch {
    setStatus(h('div.status-line', h('span.status-dot.warn'), h('span', 'Server offline')));
  }
}

boot().catch((err) => {
  console.error(err);
  toast('Failed to start the app', 'error');
});
