import { h, mount, panel, split, textarea, output, button, stats } from '../kit.js';

const words = (text) => text.match(/[A-Za-z0-9]+/g) || [];

const TRANSFORMS = [
  { group: 'Case', items: [
    { label: 'UPPER', fn: (t) => t.toUpperCase() },
    { label: 'lower', fn: (t) => t.toLowerCase() },
    { label: 'Title Case', fn: (t) => t.replace(/\w\S*/g, (word) => word[0].toUpperCase() + word.slice(1).toLowerCase()) },
    { label: 'Sentence case', fn: (t) => t.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, (match) => match.toUpperCase()) },
    { label: 'camelCase', fn: (t) => words(t).map((word, i) => (i ? word[0].toUpperCase() + word.slice(1).toLowerCase() : word.toLowerCase())).join('') },
    { label: 'PascalCase', fn: (t) => words(t).map((word) => word[0].toUpperCase() + word.slice(1).toLowerCase()).join('') },
    { label: 'snake_case', fn: (t) => words(t).map((word) => word.toLowerCase()).join('_') },
    { label: 'kebab-case', fn: (t) => words(t).map((word) => word.toLowerCase()).join('-') },
    { label: 'CONSTANT', fn: (t) => words(t).map((word) => word.toUpperCase()).join('_') },
    { label: 'slug', fn: (t) => t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') },
  ] },
  { group: 'Lines', items: [
    { label: 'Sort A→Z', fn: (t) => t.split('\n').sort((a, b) => a.localeCompare(b)).join('\n') },
    { label: 'Sort Z→A', fn: (t) => t.split('\n').sort((a, b) => b.localeCompare(a)).join('\n') },
    { label: 'Sort by length', fn: (t) => t.split('\n').sort((a, b) => a.length - b.length).join('\n') },
    { label: 'Reverse order', fn: (t) => t.split('\n').reverse().join('\n') },
    { label: 'Shuffle', fn: (t) => t.split('\n').map((line) => [Math.random(), line]).sort((a, b) => a[0] - b[0]).map((pair) => pair[1]).join('\n') },
    { label: 'Remove duplicates', fn: (t) => [...new Set(t.split('\n'))].join('\n') },
    { label: 'Remove empty', fn: (t) => t.split('\n').filter((line) => line.trim()).join('\n') },
    { label: 'Trim each line', fn: (t) => t.split('\n').map((line) => line.trim()).join('\n') },
    { label: 'Number lines', fn: (t) => t.split('\n').map((line, i) => `${String(i + 1).padStart(3, ' ')}  ${line}`).join('\n') },
    { label: 'Join with commas', fn: (t) => t.split('\n').filter(Boolean).join(', ') },
  ] },
  { group: 'Characters', items: [
    { label: 'Reverse text', fn: (t) => [...t].reverse().join('') },
    { label: 'Collapse spaces', fn: (t) => t.replace(/[ \t]+/g, ' ') },
    { label: 'Strip accents', fn: (t) => t.normalize('NFKD').replace(/[\u0300-\u036f]/g, '') },
    { label: 'Strip punctuation', fn: (t) => t.replace(/[^\p{L}\p{N}\s]/gu, '') },
    { label: 'Escape quotes', fn: (t) => t.replace(/["'\\]/g, (char) => `\\${char}`) },
    { label: 'Smart → straight', fn: (t) => t.replace(/[\u2018\u2019]/g, "'").replace(/[\u201c\u201d]/g, '"').replace(/[\u2013\u2014]/g, '-') },
  ] },
];

export default function (root, ctx) {
  const state = { text: ctx.state.text || '' };
  const result = output({ filename: 'text.txt', wrap: true });
  const info = h('div');

  const source = textarea({
    value: state.text,
    placeholder: 'Paste text here…',
    oninput: (value) => {
      state.text = value;
      ctx.save({ text: value });
      result.set(value);
      count(value);
    },
  });

  function count(text) {
    mount(info, stats([
      { label: 'Characters', value: text.length.toLocaleString() },
      { label: 'Words', value: (text.trim() ? text.trim().split(/\s+/).length : 0).toLocaleString() },
      { label: 'Lines', value: text ? text.split('\n').length : 0 },
    ]));
  }

  const applyTransform = (fn) => {
    const next = fn(result.value || state.text);
    result.set(next);
    count(next);
  };

  const groups = TRANSFORMS.map((group) =>
    h('div.stack-sm',
      h('span.label', group.group),
      h('div.row.row-wrap', { style: { gap: '7px' } },
        ...group.items.map((item) => button(item.label, { onclick: () => applyTransform(item.fn) })))
    )
  );

  mount(root,
    split(
      panel('Input', { actions: [button('Clear', { onclick: () => {
        source.value = '';
        state.text = '';
        ctx.save({ text: '' });
        result.set('');
        count('');
      } })] }, source),
      panel('Result', {
        subtitle: 'Transforms stack — apply several in a row',
        actions: [...result.actions(), button('Reset', { onclick: () => {
          result.set(state.text);
          count(state.text);
        } })],
      }, result.node)
    ),
    info,
    panel('Transforms', {}, h('div.stack', ...groups))
  );

  result.set(state.text);
  count(state.text);
}
