import { h, mount, panel, textarea, controls, field, input, button, codeLine, pickFile, checkbox, toast } from '../kit.js';

const ALGOS = ['SHA-256', 'SHA-1', 'SHA-384', 'SHA-512'];

const toHex = (buffer) => [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');

export default function (root, ctx) {
  const state = {
    text: ctx.state.text || '',
    hmacKey: ctx.state.hmacKey || '',
    uppercase: ctx.state.uppercase ?? false,
  };

  const digests = h('div.stack-sm');
  const hmacOut = h('div.stack-sm');
  const fileOut = h('div.stack-sm');

  const source = textarea({
    value: state.text,
    placeholder: 'Text to hash…',
    oninput: (value) => {
      state.text = value;
      ctx.save({ text: value });
      run();
    },
  });

  mount(fileOut, h('p.small.dim', 'Pick a file to check its SHA-256 against a published checksum.'));

  const format = (hex) => (state.uppercase ? hex.toUpperCase() : hex);

  async function run() {
    if (!state.text) {
      mount(digests, h('p.small.dim', 'Type something to see its digests.'));
      mount(hmacOut);
      return;
    }
    const bytes = new TextEncoder().encode(state.text);
    const rows = [];
    for (const algorithm of ALGOS) {
      const digest = await crypto.subtle.digest(algorithm, bytes);
      rows.push(codeLine(format(toHex(digest)), { label: algorithm }));
    }
    mount(digests, ...rows);

    if (state.hmacKey) {
      const key = await crypto.subtle.importKey(
        'raw', new TextEncoder().encode(state.hmacKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
      );
      const mac = await crypto.subtle.sign('HMAC', key, bytes);
      mount(hmacOut, codeLine(format(toHex(mac)), { label: 'HMAC-256' }));
    } else {
      mount(hmacOut, h('p.small.dim', 'Add a key to compute an HMAC of the same text.'));
    }
  }

  async function hashFile() {
    const [file] = await pickFile();
    if (!file) return;
    mount(fileOut, h('p.small.dim', `Reading ${file.name}…`));
    try {
      const buffer = await file.arrayBuffer();
      const rows = [h('p.small.dim', `${file.name} · ${(file.size / 1024).toFixed(1)} KB`)];
      for (const algorithm of ['SHA-256', 'SHA-1']) {
        rows.push(codeLine(format(toHex(await crypto.subtle.digest(algorithm, buffer))), { label: algorithm }));
      }
      mount(fileOut, ...rows);
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  mount(root,
    panel('Text', {}, source,
      controls(
        checkbox('Uppercase hex', state.uppercase, (value) => {
          state.uppercase = value;
          ctx.save({ uppercase: value });
          run();
        }))),
    panel('Digests', { subtitle: 'Computed with the browser WebCrypto API' }, digests),
    panel('HMAC', { subtitle: 'SHA-256 with a shared key' },
      controls(h('div.field.grow', h('span.label', 'Key'),
        input({
          value: state.hmacKey,
          placeholder: 'secret key',
          mono: true,
          oninput: (value) => {
            state.hmacKey = value;
            ctx.save({ hmacKey: value });
            run();
          },
        }))),
      hmacOut),
    panel('File checksum', {
      actions: [button('Choose a file', { iconName: 'upload', onclick: hashFile })],
    }, fileOut)
  );

  run();
}
