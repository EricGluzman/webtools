import { h, mount, panel, output, button, controls, field, input, checkbox, select, stats } from '../kit.js';

const BASE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function uuidV4() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Sortable ID: 48-bit timestamp then randomness, Crockford base32. */
function ulid() {
  let time = Date.now();
  let stamp = '';
  for (let i = 0; i < 10; i += 1) {
    stamp = BASE32[time % 32] + stamp;
    time = Math.floor(time / 32);
  }
  const random = crypto.getRandomValues(new Uint8Array(16));
  return stamp + [...random].map((byte) => BASE32[byte % 32]).join('');
}

function shortId(length = 12) {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join('');
}

export default function (root, ctx) {
  const state = {
    kind: ctx.state.kind || 'uuid',
    count: ctx.state.count || 8,
    uppercase: ctx.state.uppercase ?? false,
    dashes: ctx.state.dashes ?? true,
  };

  const result = output({ filename: 'ids.txt', wrap: true });
  const info = h('div');

  function generate() {
    const makers = { uuid: uuidV4, ulid, short: () => shortId(12), long: () => shortId(24) };
    const ids = Array.from({ length: Math.min(Math.max(state.count, 1), 1000) }, makers[state.kind]);
    const shaped = ids.map((id) => {
      let value = state.dashes ? id : id.replace(/-/g, '');
      return state.uppercase ? value.toUpperCase() : value;
    });
    result.set(shaped.join('\n'));
    mount(info, stats([
      { label: 'Generated', value: shaped.length },
      { label: 'Length each', value: shaped[0]?.length || 0 },
      { label: 'Source', value: 'crypto.getRandomValues' },
    ]));
  }

  mount(root,
    controls(
      field('Kind', select([
        { value: 'uuid', label: 'UUID v4' },
        { value: 'ulid', label: 'ULID (sortable)' },
        { value: 'short', label: 'Short ID (12)' },
        { value: 'long', label: 'Long ID (24)' },
      ], state.kind, (value) => {
        state.kind = value;
        ctx.save({ kind: value });
        generate();
      })),
      field('How many', input({
        type: 'number',
        value: String(state.count),
        min: '1',
        max: '1000',
        oninput: (value) => {
          state.count = Number(value) || 1;
          ctx.save({ count: state.count });
          generate();
        },
      })),
      checkbox('Uppercase', state.uppercase, (value) => {
        state.uppercase = value;
        ctx.save({ uppercase: value });
        generate();
      }),
      checkbox('Keep dashes', state.dashes, (value) => {
        state.dashes = value;
        ctx.save({ dashes: value });
        generate();
      }),
      h('div', { style: { alignSelf: 'flex-end' } },
        button('Generate', { iconName: 'refresh', variant: 'btn-primary', onclick: generate }))
    ),
    panel('IDs', { actions: result.actions() }, result.node),
    info
  );

  generate();
}
