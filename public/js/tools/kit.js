/**
 * Shared furniture for tool screens. Every tool module exports
 *   export default function (root, ctx) { ... }
 * and builds its UI out of these pieces so they all feel the same.
 */
import { h, mount, debounce } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { copyButton, copyText, download, toast } from '../core/ui.js';

export { h, mount, debounce, icon, copyButton, copyText, download, toast };

export function panel(title, options = {}, ...body) {
  const { actions = [], subtitle = '', className = '', flush = false } = options;
  return h('section.tool-panel', { class: className },
    title || actions.length || subtitle
      ? h('header.panel-head',
          h('div.panel-title',
            h('h3', title),
            subtitle ? h('small.dim', subtitle) : null),
          actions.length ? h('div.panel-actions', ...actions) : null)
      : null,
    h('div.panel-body', { class: flush ? 'flush' : '' }, ...body)
  );
}

export function split(left, right, options = {}) {
  const { ratio = '1fr 1fr', className = '' } = options;
  return h('div.tool-split', { class: className, style: { '--split': ratio } }, left, right);
}

export function textarea(options = {}) {
  const { value = '', placeholder = '', oninput, mono = true, rows, spellcheck = false } = options;
  const node = h('textarea.textarea', {
    placeholder,
    spellcheck: String(spellcheck),
    rows,
    style: mono ? null : { fontFamily: 'var(--font)', fontSize: '14px' },
  });
  node.value = value;
  if (oninput) node.addEventListener('input', () => oninput(node.value, node));
  return node;
}

export function input(options = {}) {
  const { value = '', placeholder = '', oninput, type = 'text', mono = false, ...rest } = options;
  const node = h('input.input', {
    type,
    placeholder,
    style: mono ? { fontFamily: 'var(--mono)', fontSize: '13px' } : null,
    ...rest,
  });
  node.value = value;
  if (oninput) node.addEventListener('input', () => oninput(node.value, node));
  return node;
}

export function field(label, control, hint) {
  return h('label.field', label ? h('span.label', label) : null, control, hint ? h('small.dim', hint) : null);
}

export function select(options, value, onchange) {
  const node = h('select.select',
    ...options.map((option) => {
      const opt = typeof option === 'string' ? { value: option, label: option } : option;
      return h('option', { value: opt.value, selected: opt.value === value }, opt.label);
    })
  );
  node.addEventListener('change', () => onchange(node.value));
  return node;
}

export function checkbox(label, checked, onchange) {
  const box = h('input', { type: 'checkbox', checked });
  box.addEventListener('change', () => onchange(box.checked));
  return h('label.check', box, label);
}

export function controls(...children) {
  return h('div.tool-controls', ...children);
}

export function actionRow(...children) {
  return h('div.row.row-wrap', { style: { gap: '8px' } }, ...children);
}

export function button(label, options = {}) {
  const { onclick, variant = '', iconName, small = true, title } = options;
  return h('button.btn', {
    class: `${small ? 'btn-sm' : ''} ${variant}`.trim(),
    onclick,
    title,
  }, iconName ? icon(iconName, { size: small ? 15 : 16 }) : null, label);
}

/** A read-only result surface with copy and download built in. */
export function output(options = {}) {
  const { placeholder = 'Output appears here', filename = 'output.txt', wrap = true } = options;
  const body = h('pre.output-body', { class: wrap ? 'wrap' : '' });
  const hint = h('div.output-placeholder.dim', placeholder);
  let value = '';

  const node = h('div.output', body, hint);
  return {
    node,
    get value() {
      return value;
    },
    set(text) {
      value = text == null ? '' : String(text);
      body.textContent = value;
      hint.classList.toggle('hidden', Boolean(value));
      body.classList.toggle('hidden', !value);
      return value;
    },
    setNode(child) {
      value = '';
      mount(body, child);
      hint.classList.add('hidden');
      body.classList.remove('hidden');
    },
    actions(extra = []) {
      return [
        copyButton(() => value),
        button('Save', { iconName: 'download', onclick: () => value && download(filename, value) }),
        ...extra,
      ];
    },
  };
}

export function errorBox(message) {
  return h('div.notice.notice-bad', icon('info', { size: 15 }), h('span', message));
}

export function noticeBox(message, kind = 'info') {
  return h('div.notice', { class: `notice-${kind}` }, icon('info', { size: 15 }), h('span', message));
}

export function stats(items) {
  return h('div.stat-row',
    ...items.map(({ label, value }) =>
      h('div.stat', h('strong', String(value)), h('small', label)))
  );
}

export function table(headers, rows) {
  return h('div.table-wrap',
    h('table.table',
      h('thead', h('tr', ...headers.map((head) => h('th', head)))),
      h('tbody', ...rows.map((row) => h('tr', ...row.map((cell) => h('td', cell)))))
    )
  );
}

export function codeLine(text, { label } = {}) {
  return h('div.code-line',
    label ? h('span.code-label', label) : null,
    h('code.truncate', { title: text }, text),
    h('button.btn.btn-sm.btn-icon', {
      title: 'Copy',
      onclick: () => copyText(text),
    }, icon('copy', { size: 14 }))
  );
}

/** Drop a file anywhere on an element. */
export function dropzone(node, onFiles, { accept } = {}) {
  const over = (event) => {
    event.preventDefault();
    node.classList.add('drag-over');
  };
  const leave = () => node.classList.remove('drag-over');
  node.addEventListener('dragover', over);
  node.addEventListener('dragleave', leave);
  node.addEventListener('drop', (event) => {
    event.preventDefault();
    leave();
    const files = [...(event.dataTransfer?.files || [])];
    if (files.length) onFiles(accept ? files.filter((file) => file.type.match(accept)) : files);
  });
  return node;
}

export function pickFile({ accept = '*/*', multiple = false } = {}) {
  return new Promise((resolve) => {
    const picker = h('input', { type: 'file', accept, multiple, style: { display: 'none' } });
    picker.addEventListener('change', () => {
      resolve([...picker.files]);
      picker.remove();
    });
    document.body.append(picker);
    picker.click();
  });
}
