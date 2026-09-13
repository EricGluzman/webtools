import { h, mount, panel, split, textarea, output, button, controls, field, select, stats, errorBox } from '../kit.js';

const SAMPLE = `{"name":"workbench","version":"1.0.0","tags":["tools","notes","ocr"],"server":{"port":8712,"tls":false},"ready":true}`;

function describe(value, depth = 0) {
  let keys = 0;
  let maxDepth = depth;
  const walk = (node, level) => {
    maxDepth = Math.max(maxDepth, level);
    if (Array.isArray(node)) node.forEach((item) => walk(item, level + 1));
    else if (node && typeof node === 'object') {
      for (const [, child] of Object.entries(node)) {
        keys += 1;
        walk(child, level + 1);
      }
    }
  };
  walk(value, depth);
  return { keys, depth: maxDepth };
}

/** Collapsible tree so big payloads stay readable. */
function treeNode(key, value, level = 0) {
  const isObject = value && typeof value === 'object';
  if (!isObject) {
    return h('div.tree-row', { style: { paddingLeft: `${level * 14}px` } },
      key !== null ? h('span.tree-key', `${key}: `) : null,
      h('span.tree-val', { class: `t-${value === null ? 'null' : typeof value}` },
        typeof value === 'string' ? `"${value}"` : String(value))
    );
  }

  const entries = Array.isArray(value) ? value.map((item, index) => [index, item]) : Object.entries(value);
  const summary = Array.isArray(value) ? `Array(${entries.length})` : `Object{${entries.length}}`;
  const children = h('div', ...entries.map(([childKey, childValue]) => treeNode(childKey, childValue, level + 1)));

  const toggle = h('button.tree-toggle', {
    onclick: () => {
      const hidden = children.classList.toggle('hidden');
      toggle.firstChild.textContent = hidden ? '▸' : '▾';
    },
  }, h('span', '▾'));

  return h('div',
    h('div.tree-row', { style: { paddingLeft: `${level * 14}px` } },
      toggle,
      key !== null ? h('span.tree-key', `${key}: `) : null,
      h('span.dim', summary)),
    children
  );
}

export default function (root, ctx) {
  const state = { indent: ctx.state.indent || '2', text: ctx.state.text || '' };

  const result = output({ filename: 'formatted.json' });
  const problem = h('div');
  const info = h('div');
  const tree = h('div.tree');
  let parsed = null;

  const source = textarea({
    value: state.text,
    placeholder: 'Paste JSON here…',
    oninput: (value) => {
      state.text = value;
      ctx.save({ text: value });
      run();
    },
  });

  const indentFor = () => (state.indent === 'tab' ? '\t' : Number(state.indent));

  function parse() {
    mount(problem);
    if (!state.text.trim()) {
      parsed = null;
      result.set('');
      mount(info);
      mount(tree);
      return false;
    }
    try {
      parsed = JSON.parse(state.text);
      return true;
    } catch (err) {
      parsed = null;
      // Point at the offending line instead of only echoing the parser message.
      const position = Number((err.message.match(/position (\d+)/) || [])[1]);
      let where = '';
      if (Number.isFinite(position)) {
        const upTo = state.text.slice(0, position);
        where = ` (line ${upTo.split('\n').length}, column ${position - upTo.lastIndexOf('\n')})`;
      }
      mount(problem, errorBox(`${err.message}${where}`));
      result.set('');
      mount(info);
      mount(tree);
      return false;
    }
  }

  function run() {
    if (!parse()) return;
    result.set(JSON.stringify(parsed, null, indentFor()));
    const shape = describe(parsed);
    mount(info, stats([
      { label: 'Characters', value: state.text.length.toLocaleString() },
      { label: 'Keys', value: shape.keys.toLocaleString() },
      { label: 'Depth', value: shape.depth },
      { label: 'Type', value: Array.isArray(parsed) ? 'array' : typeof parsed },
    ]));
    mount(tree, treeNode(null, parsed));
  }

  const sortKeys = (value) => {
    if (Array.isArray(value)) return value.map(sortKeys);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
    }
    return value;
  };

  const apply = (fn) => () => {
    if (!parse()) return;
    result.set(fn());
  };

  mount(root,
    controls(
      field('Indent', select([
        { value: '2', label: '2 spaces' },
        { value: '4', label: '4 spaces' },
        { value: 'tab', label: 'Tab' },
      ], state.indent, (value) => {
        state.indent = value;
        ctx.save({ indent: value });
        run();
      })),
      h('div.row.row-wrap', { style: { gap: '8px', alignSelf: 'flex-end' } },
        button('Format', { iconName: 'braces', variant: 'btn-primary', onclick: () => run() }),
        button('Minify', { onclick: apply(() => JSON.stringify(parsed)) }),
        button('Sort keys', { onclick: apply(() => JSON.stringify(sortKeys(parsed), null, indentFor())) }),
        button('Escape', { onclick: apply(() => JSON.stringify(JSON.stringify(parsed))) }),
        button('Sample', { onclick: () => {
          source.value = SAMPLE;
          state.text = SAMPLE;
          ctx.save({ text: SAMPLE });
          run();
        } }),
        button('Clear', { onclick: () => {
          source.value = '';
          state.text = '';
          ctx.save({ text: '' });
          run();
        } })
      )
    ),
    problem,
    split(
      panel('Input', { subtitle: 'JSON in' }, source),
      panel('Result', { actions: result.actions() }, result.node)
    ),
    info,
    panel('Tree', { subtitle: 'Click a row to fold it away' }, tree)
  );

  run();
}
