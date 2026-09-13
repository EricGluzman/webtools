import { h, mount, panel, output, button, controls, field, input, checkbox, select, copyText, noticeBox } from '../kit.js';

const SETS = {
  lower: 'abcdefghijkmnopqrstuvwxyz',
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  digits: '23456789',
  symbols: '!@#$%^&*-_=+?',
  ambiguous: 'iloIO01',
};

const WORDS = ('able acorn amber anchor apple arbor arrow autumn basil beacon birch bison bloom branch breeze brick '
  + 'bridge bronze cactus canvas cedar chalk cliff cloud clover cobalt copper coral cotton crane crater crystal daisy '
  + 'dawn delta desert dune ember falcon fern flint forest fossil garnet glacier granite harbor hazel heron indigo '
  + 'ivory jasper kernel lagoon lantern laurel linen lotus lunar maple marble meadow mesa mint moss nectar nimbus '
  + 'oasis olive onyx opal orbit otter pebble petal pine pollen prairie quartz quill raven reef ridge river rust '
  + 'saffron sage sandy shale slate spruce stone summit thistle thorn tide timber topaz tulip tundra valley velvet '
  + 'willow winter zephyr').split(' ');

const randomInt = (max) => {
  const bytes = crypto.getRandomValues(new Uint32Array(1));
  return bytes[0] % max;
};

const pick = (list) => list[randomInt(list.length)];

function strengthOf(entropyBits) {
  if (entropyBits < 40) return { label: 'Weak', tone: 'bad', width: 25 };
  if (entropyBits < 60) return { label: 'Fair', tone: 'warn', width: 50 };
  if (entropyBits < 80) return { label: 'Strong', tone: 'good', width: 75 };
  return { label: 'Very strong', tone: 'good', width: 100 };
}

export default function (root, ctx) {
  const state = {
    mode: ctx.state.mode || 'password',
    length: ctx.state.length || 20,
    words: ctx.state.words || 4,
    separator: ctx.state.separator ?? '-',
    upper: ctx.state.upper ?? true,
    digits: ctx.state.digits ?? true,
    symbols: ctx.state.symbols ?? true,
    avoidAmbiguous: ctx.state.avoidAmbiguous ?? true,
    count: ctx.state.count || 5,
  };

  const result = output({ filename: 'passwords.txt', wrap: true });
  const meter = h('div');
  const hero = h('div.password-hero');

  function alphabet() {
    let pool = SETS.lower;
    if (state.upper) pool += SETS.upper;
    if (state.digits) pool += state.avoidAmbiguous ? SETS.digits : `${SETS.digits}01`;
    if (state.symbols) pool += SETS.symbols;
    if (!state.avoidAmbiguous) pool += SETS.ambiguous;
    return pool;
  }

  function makeOne() {
    if (state.mode === 'passphrase') {
      const parts = Array.from({ length: state.words }, () => pick(WORDS));
      if (state.upper) parts[randomInt(parts.length)] = parts[randomInt(parts.length)].toUpperCase();
      const phrase = parts.join(state.separator);
      return state.digits ? `${phrase}${state.separator}${randomInt(90) + 10}` : phrase;
    }
    const pool = alphabet();
    return Array.from({ length: state.length }, () => pool[randomInt(pool.length)]).join('');
  }

  function generate() {
    const list = Array.from({ length: Math.min(Math.max(state.count, 1), 50) }, makeOne);
    result.set(list.join('\n'));

    const bits = state.mode === 'passphrase'
      ? Math.log2(WORDS.length) * state.words + (state.digits ? 6.5 : 0)
      : Math.log2(alphabet().length) * state.length;
    const strength = strengthOf(bits);

    mount(hero,
      h('code.password-value', list[0]),
      h('button.btn.btn-sm', { onclick: () => copyText(list[0], 'Password copied') }, 'Copy')
    );

    mount(meter,
      h('div.meter', h('i', {
        style: {
          width: `${strength.width}%`,
          background: strength.tone === 'bad' ? 'var(--bad)' : strength.tone === 'warn' ? 'var(--warn)' : 'var(--ok)',
        },
      })),
      h('p.small.dim', `${strength.label} · about ${Math.round(bits)} bits of entropy`)
    );
  }

  const lengthInput = input({
    type: 'range',
    min: '8',
    max: '64',
    value: String(state.length),
    oninput: (value, node) => {
      state.length = Number(value);
      ctx.save({ length: state.length });
      node.nextElementSibling.textContent = `${state.length} characters`;
      generate();
    },
  });

  const wordsInput = input({
    type: 'range',
    min: '3',
    max: '8',
    value: String(state.words),
    oninput: (value, node) => {
      state.words = Number(value);
      ctx.save({ words: state.words });
      node.nextElementSibling.textContent = `${state.words} words`;
      generate();
    },
  });

  const passwordOptions = h('div.tool-controls',
    h('div.field.grow', h('span.label', 'Length'), lengthInput, h('small.dim', `${state.length} characters`)),
    checkbox('Capitals', state.upper, (value) => {
      state.upper = value;
      ctx.save({ upper: value });
      generate();
    }),
    checkbox('Digits', state.digits, (value) => {
      state.digits = value;
      ctx.save({ digits: value });
      generate();
    }),
    checkbox('Symbols', state.symbols, (value) => {
      state.symbols = value;
      ctx.save({ symbols: value });
      generate();
    }),
    checkbox('Avoid lookalikes', state.avoidAmbiguous, (value) => {
      state.avoidAmbiguous = value;
      ctx.save({ avoidAmbiguous: value });
      generate();
    })
  );

  const phraseOptions = h('div.tool-controls',
    h('div.field.grow', h('span.label', 'Words'), wordsInput, h('small.dim', `${state.words} words`)),
    field('Separator', input({
      value: state.separator,
      maxlength: '3',
      style: { width: '70px' },
      oninput: (value) => {
        state.separator = value;
        ctx.save({ separator: value });
        generate();
      },
    })),
    checkbox('One word in capitals', state.upper, (value) => {
      state.upper = value;
      ctx.save({ upper: value });
      generate();
    }),
    checkbox('Add digits', state.digits, (value) => {
      state.digits = value;
      ctx.save({ digits: value });
      generate();
    })
  );

  const optionsHost = h('div');
  const showOptions = () => mount(optionsHost, state.mode === 'passphrase' ? phraseOptions : passwordOptions);

  mount(root,
    panel('Generated', {
      actions: [button('New', { iconName: 'refresh', variant: 'btn-primary', onclick: generate })],
    }, hero, meter),
    panel('Options', {},
      controls(
        field('Style', select([
          { value: 'password', label: 'Random characters' },
          { value: 'passphrase', label: 'Memorable passphrase' },
        ], state.mode, (value) => {
          state.mode = value;
          ctx.save({ mode: value });
          showOptions();
          generate();
        })),
        field('How many', input({
          type: 'number',
          min: '1',
          max: '50',
          value: String(state.count),
          oninput: (value) => {
            state.count = Number(value) || 1;
            ctx.save({ count: state.count });
            generate();
          },
        }))
      ),
      optionsHost),
    panel('Batch', { actions: result.actions() }, result.node),
    noticeBox('Everything is generated in your browser with the system random number source. Nothing is sent to the server.')
  );

  showOptions();
  generate();
}
