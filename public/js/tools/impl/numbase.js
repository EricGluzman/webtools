import { h, mount, panel, controls, field, input, select, codeLine, errorBox, stats } from '../kit.js';

const BASES = [
  { value: '2', label: 'Binary (2)' },
  { value: '8', label: 'Octal (8)' },
  { value: '10', label: 'Decimal (10)' },
  { value: '16', label: 'Hexadecimal (16)' },
  { value: '36', label: 'Base 36' },
];

export default function (root, ctx) {
  const state = { value: ctx.state.value || '255', base: ctx.state.base || '10', custom: ctx.state.custom || '12' };

  const results = h('div.stack-sm');
  const problem = h('div');
  const bits = h('div');

  function run() {
    mount(problem);
    const clean = state.value.trim().replace(/[\s_]/g, '').replace(/^0[bxo]/i, '');
    if (!clean) {
      mount(results);
      mount(bits);
      return;
    }

    let number;
    try {
      number = BigInt(state.base === '10' ? clean : `0${{ 2: 'b', 8: 'o', 16: 'x' }[state.base] || ''}${clean}`);
      if (state.base !== '10' && !['2', '8', '16'].includes(state.base)) {
        number = [...clean.toLowerCase()].reduce((total, char) => {
          const digit = parseInt(char, Number(state.base));
          if (Number.isNaN(digit)) throw new Error(`“${char}” is not a digit in base ${state.base}`);
          return total * BigInt(state.base) + BigInt(digit);
        }, 0n);
      }
    } catch (err) {
      mount(results);
      mount(bits);
      return mount(problem, errorBox(err.message.includes('Cannot convert')
        ? `“${state.value}” is not a valid base-${state.base} number`
        : err.message));
    }

    const customBase = Math.min(Math.max(Number(state.custom) || 12, 2), 36);
    mount(results,
      codeLine(number.toString(2), { label: 'Binary' }),
      codeLine(number.toString(8), { label: 'Octal' }),
      codeLine(number.toString(10), { label: 'Decimal' }),
      codeLine(number.toString(16).toUpperCase(), { label: 'Hex' }),
      codeLine(number.toString(36), { label: 'Base 36' }),
      codeLine(number.toString(customBase), { label: `Base ${customBase}` })
    );

    const binary = number.toString(2);
    const grouped = binary.padStart(Math.ceil(binary.length / 8) * 8, '0').match(/.{1,8}/g) || [];
    mount(bits,
      stats([
        { label: 'Bits', value: binary.length },
        { label: 'Bytes', value: Math.ceil(binary.length / 8) },
        { label: 'Set bits', value: [...binary].filter((bit) => bit === '1').length },
      ]),
      h('div.byte-grid', ...grouped.map((byte) =>
        h('span.byte', ...[...byte].map((bit) => h('i', { class: bit === '1' ? 'on' : '' }, bit)))))
    );
  }

  mount(root,
    panel('Number', {},
      controls(
        h('div.field.grow', h('span.label', 'Value'),
          input({
            value: state.value,
            mono: true,
            placeholder: 'ff, 1010, 255…',
            oninput: (value) => {
              state.value = value;
              ctx.save({ value });
              run();
            },
          })),
        field('Input base', select(BASES, state.base, (value) => {
          state.base = value;
          ctx.save({ base: value });
          run();
        })),
        field('Extra base', input({
          type: 'number',
          min: '2',
          max: '36',
          value: state.custom,
          style: { width: '90px' },
          oninput: (value) => {
            state.custom = value;
            ctx.save({ custom: value });
            run();
          },
        }))
      ),
      problem),
    panel('Converted', {}, results),
    panel('Bits', {}, bits)
  );

  run();
}
