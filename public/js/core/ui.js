import { h, mount, clear } from './dom.js';
import { icon } from './icons.js';

const overlays = () => document.getElementById('overlays');

/* ------------------------------------------------------------- toasts */

let toastHost = null;

export function toast(message, kind = 'ok') {
  if (!toastHost) {
    toastHost = h('div.toasts');
    overlays().append(toastHost);
  }
  const node = h('div.toast.glass', { class: kind === 'error' ? 'error' : '' },
    h('span.dot'),
    h('span', message)
  );
  toastHost.append(node);
  setTimeout(() => {
    node.classList.add('out');
    setTimeout(() => node.remove(), 200);
  }, kind === 'error' ? 4200 : 2400);
}

/* ------------------------------------------------------------- modals */

export function openModal(render, { width, onDismiss } = {}) {
  const scrim = h('div.scrim');
  const panel = h('div.modal.glass', width ? { style: { width } } : null);
  scrim.append(panel);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    scrim.style.animation = 'fade 120ms reverse';
    setTimeout(() => scrim.remove(), 110);
    document.removeEventListener('keydown', onKey);
    if (onDismiss) onDismiss();
  };
  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      close();
    }
  };

  scrim.addEventListener('mousedown', (event) => {
    if (event.target === scrim) close();
  });
  document.addEventListener('keydown', onKey);
  overlays().append(scrim);

  mount(panel, render({ close, panel }));
  const focusable = panel.querySelector('input, textarea, button, select');
  if (focusable) setTimeout(() => focusable.focus(), 30);
  return { close, panel };
}

export function confirmDialog({ title, message, confirmLabel = 'Delete', danger = true }) {
  return new Promise((resolve) => {
    let answer = false;
    const { close } = openModal(({ close: dismiss }) => [
      h('h2', title),
      h('p.muted', { style: { marginTop: '6px' } }, message),
      h('div.modal-actions',
        h('button.btn', { onclick: () => dismiss() }, 'Cancel'),
        h('button.btn', {
          class: danger ? 'btn-danger' : 'btn-primary',
          onclick: () => {
            answer = true;
            dismiss();
          },
        }, confirmLabel)
      ),
    ], { width: '420px', onDismiss: () => resolve(answer) });
    void close;
  });
}

export function promptDialog({ title, label, value = '', placeholder = '', confirmLabel = 'Save' }) {
  return new Promise((resolve) => {
    let answer = null;
    openModal(({ close }) => {
      const input = h('input.input', { value, placeholder });
      const submit = () => {
        answer = input.value.trim();
        close();
      };
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') submit();
      });
      return [
        h('h2', title),
        h('div.field', { style: { marginTop: '16px' } }, label ? h('span.label', label) : null, input),
        h('div.modal-actions',
          h('button.btn', { onclick: () => close() }, 'Cancel'),
          h('button.btn.btn-primary', { onclick: submit }, confirmLabel)
        ),
      ];
    }, { width: '440px', onDismiss: () => resolve(answer) });
  });
}

/* ---------------------------------------------------------- clipboard */

export async function copyText(text, message = 'Copied') {
  try {
    await navigator.clipboard.writeText(text);
    toast(message);
    return true;
  } catch {
    // Clipboard API needs a secure context; fall back to a hidden textarea.
    const area = h('textarea', { style: { position: 'fixed', opacity: '0', top: '0' } });
    area.value = text;
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    toast(ok ? message : 'Copy blocked by the browser', ok ? 'ok' : 'error');
    return ok;
  }
}

export function download(filename, content, type = 'text/plain;charset=utf-8') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ------------------------------------------------------- small parts */

export function iconButton(name, { label, onclick, className = '', small = true } = {}) {
  return h('button.btn.btn-icon', {
    class: `${small ? 'btn-sm' : ''} ${className}`.trim(),
    title: label,
    'aria-label': label,
    onclick,
  }, icon(name, { size: small ? 15 : 17 }));
}

export function copyButton(getText, { label = 'Copy' } = {}) {
  return h('button.btn.btn-sm', {
    onclick: async (event) => {
      const button = event.currentTarget;
      const text = typeof getText === 'function' ? getText() : getText;
      if (!text) return toast('Nothing to copy', 'error');
      const ok = await copyText(text);
      if (!ok) return;
      mount(button, icon('check', { size: 15 }), 'Copied');
      setTimeout(() => mount(button, icon('copy', { size: 15 }), label), 1200);
    },
  }, icon('copy', { size: 15 }), label);
}

export function segmented(options, current, onChange) {
  const thumb = h('span.thumb');
  const buttons = options.map((option) =>
    h('button', {
      type: 'button',
      role: 'tab',
      'aria-selected': String(option.value === current),
      onclick: () => onChange(option.value),
    }, option.label)
  );
  const root = h('div.segmented', { role: 'tablist' }, thumb, ...buttons);

  const place = () => {
    const active = buttons.find((button) => button.getAttribute('aria-selected') === 'true') || buttons[0];
    if (!active) return;
    thumb.style.width = `${active.offsetWidth}px`;
    thumb.style.transform = `translateX(${active.offsetLeft - 3}px)`;
  };
  requestAnimationFrame(place);
  new ResizeObserver(place).observe(root);
  return root;
}

export function emptyState(iconName, title, detail, action) {
  return h('div.empty', icon(iconName, { size: 34, stroke: 1.4 }), h('h3', title), detail ? h('p.small', detail) : null, action);
}

export function spinner(label) {
  return h('div.row', { style: { gap: '9px', color: 'var(--ink-3)', fontSize: '13px' } }, h('span.spinner'), label || null);
}

export { clear };
