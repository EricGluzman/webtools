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

async function renderLogin(message = '') {
  let state = { enabled: true, mode: 'password', length: 4, lockedFor: 0 };
  try {
    state = { ...state, ...(await api('/api/auth/state')) };
  } catch {
    /* offline: fall back to the password field */
  }

  document.body.innerHTML = '';
  const backdrop = h('div.backdrop', { 'aria-hidden': 'true' },
    h('span.blob.blob-a'), h('span.blob.blob-b'), h('span.blob.blob-c'), h('span.grain'));

  const error = h('p.login-error', message);
  const card = h('form.login-card.glass', { onsubmit: (event) => event.preventDefault() });
  document.body.append(backdrop, h('div.login-wrap', card));

  /* ------------------------------------------------------- lockout */

  let lockTimer = null;

  function startLockout(seconds) {
    clearInterval(lockTimer);
    let left = seconds;
    const tick = () => {
      if (left <= 0) {
        clearInterval(lockTimer);
        lockTimer = null;
        card.classList.remove('locked');
        error.textContent = '';
        return;
      }
      const minutes = Math.floor(left / 60);
      const rest = left % 60;
      error.textContent = `Locked. Try again in ${minutes ? `${minutes}m ` : ''}${rest}s`;
      left -= 1;
    };
    card.classList.add('locked');
    tick();
    lockTimer = setInterval(tick, 1000);
  }

  async function submit(value) {
    error.textContent = '';
    try {
      await api('/api/auth/login', { method: 'POST', body: { pin: value, password: value } });
      location.reload();
      return true;
    } catch (err) {
      if (err.lockedFor || /Try again in/.test(err.message || '')) {
        const seconds = err.lockedFor || 60;
        startLockout(seconds);
      } else {
        error.textContent = err.message || 'That did not work';
      }
      card.classList.remove('shake');
      void card.offsetWidth;         // restart the animation
      card.classList.add('shake');
      return false;
    }
  }

  /* ---------------------------------------------------- pin keypad */

  if (state.mode === 'pin') {
    const size = state.length || 4;
    let digits = '';

    const dots = h('div.pin-dots', ...Array.from({ length: size }, () => h('span.pin-dot')));

    const paint = () => {
      [...dots.children].forEach((dot, index) => dot.classList.toggle('on', index < digits.length));
    };

    const press = async (digit) => {
      if (card.classList.contains('locked') || digits.length >= size) return;
      digits += digit;
      paint();
      if (digits.length === size) {
        card.classList.add('checking');
        const ok = await submit(digits);
        card.classList.remove('checking');
        if (!ok) {
          digits = '';
          paint();
        }
      }
    };

    const back = () => {
      digits = digits.slice(0, -1);
      paint();
    };

    const key = (label, onclick, className = '') =>
      h('button.pin-key', { type: 'button', class: className, onclick }, label);

    const pad = h('div.pin-pad',
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => key(String(digit), () => press(String(digit)))),
      h('span'),
      key('0', () => press('0')),
      key('', back, 'pin-key-back')
    );
    pad.querySelector('.pin-key-back').append(icon('arrowLeft', { size: 19 }));

    document.addEventListener('keydown', (event) => {
      if (/^[0-9]$/.test(event.key)) press(event.key);
      else if (event.key === 'Backspace') back();
    });

    mount(card,
      h('span.brand-mark'),
      h('h1', 'Workbench'),
      h('p', 'Enter your PIN to unlock'),
      dots,
      error,
      pad
    );
    if (state.lockedFor) startLockout(state.lockedFor);
    return;
  }

  /* -------------------------------------------------- password form */

  const password = h('input.input', { type: 'password', placeholder: 'Password', autofocus: true });
  password.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') submit(password.value);
  });

  mount(card,
    h('span.brand-mark'),
    h('h1', 'Workbench'),
    h('p', 'This instance is private. Enter the password to continue.'),
    password,
    error,
    h('button.btn.btn-primary', {
      type: 'submit',
      style: { width: '100%', height: '40px' },
      onclick: () => submit(password.value),
    }, 'Unlock')
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
