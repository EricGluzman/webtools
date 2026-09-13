import { h, mount, panel, split, textarea, output, button, controls, field, select, table, errorBox, codeLine } from '../kit.js';

export default function (root, ctx) {
  const state = {
    text: ctx.state.text || 'https://example.com/search?q=glass ui&page=2#results',
    mode: ctx.state.mode || 'encode',
    scope: ctx.state.scope || 'component',
  };

  const result = output({ filename: 'url.txt', wrap: true });
  const parts = h('div');
  const params = h('div');
  const problem = h('div');

  const source = textarea({
    value: state.text,
    placeholder: 'A URL or any text…',
    oninput: (value) => {
      state.text = value;
      ctx.save({ text: value });
      run();
    },
  });

  function convert(text) {
    if (state.mode === 'encode') {
      return state.scope === 'component' ? encodeURIComponent(text) : encodeURI(text);
    }
    return state.scope === 'component' ? decodeURIComponent(text) : decodeURI(text);
  }

  function inspect(text) {
    mount(parts);
    mount(params);
    let url;
    try {
      url = new URL(text.trim());
    } catch {
      return;
    }

    mount(parts, h('div.stack-sm',
      codeLine(url.protocol.replace(':', ''), { label: 'Scheme' }),
      url.username ? codeLine(`${url.username}${url.password ? ':•••' : ''}`, { label: 'Auth' }) : null,
      codeLine(url.hostname, { label: 'Host' }),
      url.port ? codeLine(url.port, { label: 'Port' }) : null,
      codeLine(url.pathname, { label: 'Path' }),
      url.hash ? codeLine(url.hash, { label: 'Fragment' }) : null
    ));

    const entries = [...url.searchParams.entries()];
    if (entries.length) {
      mount(params, table(['Key', 'Value'], entries.map(([key, value]) => [h('code', key), h('code', value)])));
    } else {
      mount(params, h('p.small.dim', 'No query parameters.'));
    }
  }

  function run() {
    mount(problem);
    if (!state.text) {
      result.set('');
      mount(parts);
      mount(params);
      return;
    }
    try {
      result.set(convert(state.text));
    } catch (err) {
      mount(problem, errorBox(err.message));
      result.set('');
    }
    inspect(state.text);
  }

  mount(root,
    controls(
      field('Action', select([
        { value: 'encode', label: 'Encode' },
        { value: 'decode', label: 'Decode' },
      ], state.mode, (value) => {
        state.mode = value;
        ctx.save({ mode: value });
        run();
      })),
      field('Scope', select([
        { value: 'component', label: 'Component (?=&)' },
        { value: 'full', label: 'Whole URL' },
      ], state.scope, (value) => {
        state.scope = value;
        ctx.save({ scope: value });
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
    problem,
    split(panel('Input', {}, source), panel('Result', { actions: result.actions() }, result.node)),
    split(
      panel('URL parts', { subtitle: 'When the input parses as a URL' }, parts),
      panel('Query parameters', {}, params)
    )
  );

  run();
}
