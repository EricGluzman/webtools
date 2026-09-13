import { h, mount, panel, split, textarea, output, button, controls, field, checkbox, errorBox, pickFile, download, toast } from '../kit.js';

const encodeText = (text, urlSafe) => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const base = btoa(binary);
  return urlSafe ? base.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : base;
};

const decodeText = (value) => {
  const normalised = value.trim().replace(/-/g, '+').replace(/_/g, '/').replace(/\s/g, '');
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

export default function (root, ctx) {
  const state = {
    text: ctx.state.text || '',
    mode: ctx.state.mode || 'encode',
    urlSafe: ctx.state.urlSafe ?? false,
  };

  const result = output({ filename: 'base64.txt', wrap: true });
  const problem = h('div');
  const fileInfo = h('div');

  const source = textarea({
    value: state.text,
    placeholder: 'Text to encode, or Base64 to decode…',
    oninput: (value) => {
      state.text = value;
      ctx.save({ text: value });
      run();
    },
  });

  function run() {
    mount(problem);
    if (!state.text.trim()) return result.set('');
    try {
      result.set(state.mode === 'encode' ? encodeText(state.text, state.urlSafe) : decodeText(state.text));
    } catch (err) {
      mount(problem, errorBox(`That is not valid Base64 — ${err.message}`));
      result.set('');
    }
  }

  async function encodeFile() {
    const [file] = await pickFile();
    if (!file) return;
    const buffer = await file.arrayBuffer();
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    const base = btoa(binary);
    result.set(`data:${file.type || 'application/octet-stream'};base64,${base}`);
    mount(fileInfo, h('p.small.dim', `${file.name} · ${(file.size / 1024).toFixed(1)} KB → data URL of ${(base.length / 1024).toFixed(1)} KB`));
  }

  function decodeToFile() {
    const value = state.text.trim();
    const match = value.match(/^data:([^;]+);base64,(.*)$/s);
    const payload = match ? match[2] : value;
    const type = match ? match[1] : 'application/octet-stream';
    try {
      const binary = atob(payload.replace(/\s/g, ''));
      const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
      download(`decoded.${(type.split('/')[1] || 'bin').split('+')[0]}`, new Blob([bytes], { type }));
    } catch {
      toast('Could not decode that as a file', 'error');
    }
  }

  const modeButtons = ['encode', 'decode'].map((mode) =>
    h('button', {
      'aria-selected': String(state.mode === mode),
      onclick: () => setMode(mode),
    }, mode === 'encode' ? 'Encode' : 'Decode'));

  function setMode(mode) {
    state.mode = mode;
    ctx.save({ mode });
    modeButtons.forEach((button_, index) =>
      button_.setAttribute('aria-selected', String(['encode', 'decode'][index] === mode)));
    run();
  }

  mount(root,
    controls(
      field('Mode', h('div.segmented', { role: 'tablist' }, ...modeButtons)),
      checkbox('URL-safe alphabet', state.urlSafe, (value) => {
        state.urlSafe = value;
        ctx.save({ urlSafe: value });
        run();
      }),
      h('div.row.row-wrap', { style: { gap: '8px', alignSelf: 'flex-end' } },
        button('Encode a file', { iconName: 'upload', onclick: encodeFile }),
        button('Decode to file', { iconName: 'download', onclick: decodeToFile }),
        button('Swap', {
          iconName: 'swap',
          title: 'Move the result into the input and flip the mode',
          onclick: () => {
            const next = result.value;
            state.text = next;
            source.value = next;
            ctx.save({ text: next });
            setMode(state.mode === 'encode' ? 'decode' : 'encode');
          },
        }))
    ),
    problem,
    split(panel('Input', {}, source), panel('Result', { actions: result.actions() }, result.node)),
    fileInfo
  );

  run();
}
