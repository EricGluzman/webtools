import { h, mount, panel, split, textarea, output, button, controls, field, select } from '../kit.js';

const NAMED = { '&': 'amp', '<': 'lt', '>': 'gt', '"': 'quot', "'": '#39' };

const escapeBasic = (text) => text.replace(/[&<>"']/g, (char) => `&${NAMED[char]};`);

const escapeAll = (text) =>
  [...text].map((char) => {
    if (NAMED[char]) return `&${NAMED[char]};`;
    const code = char.codePointAt(0);
    return code > 126 ? `&#${code};` : char;
  }).join('');

function unescapeHtml(text) {
  const area = document.createElement('textarea');
  area.innerHTML = text;
  return area.value;
}

function stripTags(text) {
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

export default function (root, ctx) {
  const state = { text: ctx.state.text || '', mode: ctx.state.mode || 'escape' };
  const result = output({ filename: 'output.html', wrap: true });

  const source = textarea({
    value: state.text,
    placeholder: '<p>Paste markup or text…</p>',
    oninput: (value) => {
      state.text = value;
      ctx.save({ text: value });
      run();
    },
  });

  function run() {
    const transforms = {
      escape: escapeBasic,
      escapeAll,
      unescape: unescapeHtml,
      strip: stripTags,
    };
    result.set(state.text ? transforms[state.mode](state.text) : '');
  }

  mount(root,
    controls(
      field('Action', select([
        { value: 'escape', label: 'Escape < > & " \'' },
        { value: 'escapeAll', label: 'Escape everything non-ASCII' },
        { value: 'unescape', label: 'Unescape entities' },
        { value: 'strip', label: 'Strip tags, keep text' },
      ], state.mode, (value) => {
        state.mode = value;
        ctx.save({ mode: value });
        run();
      })),
      h('div', { style: { alignSelf: 'flex-end' } },
        button('Use the result as input', { iconName: 'swap', onclick: () => {
          state.text = result.value;
          source.value = state.text;
          ctx.save({ text: state.text });
          run();
        } }))
    ),
    split(panel('Input', {}, source), panel('Result', { actions: result.actions() }, result.node))
  );

  run();
}
