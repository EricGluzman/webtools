import { h, mount, panel, controls, field, input, select, table, button } from '../kit.js';

/** Everything is stored as a factor to one base unit per category. */
const CATEGORIES = {
  Length: {
    base: 'metre',
    units: {
      Millimetre: 0.001, Centimetre: 0.01, Metre: 1, Kilometre: 1000,
      Inch: 0.0254, Foot: 0.3048, Yard: 0.9144, Mile: 1609.344, 'Nautical mile': 1852,
    },
  },
  Weight: {
    base: 'kilogram',
    units: { Milligram: 1e-6, Gram: 0.001, Kilogram: 1, Tonne: 1000, Ounce: 0.0283495, Pound: 0.453592, Stone: 6.35029 },
  },
  Volume: {
    base: 'litre',
    units: {
      Millilitre: 0.001, Litre: 1, 'Cubic metre': 1000, Teaspoon: 0.00492892, Tablespoon: 0.0147868,
      'Cup (US)': 0.236588, 'Pint (US)': 0.473176, 'Gallon (US)': 3.78541, 'Gallon (UK)': 4.54609,
    },
  },
  Area: {
    base: 'square metre',
    units: {
      'Square metre': 1, 'Square kilometre': 1e6, Hectare: 10000, 'Square foot': 0.092903,
      'Square yard': 0.836127, Acre: 4046.86, 'Square mile': 2.59e6,
    },
  },
  Speed: {
    base: 'metres per second',
    units: { 'Metres per second': 1, 'Kilometres per hour': 0.277778, 'Miles per hour': 0.44704, Knot: 0.514444 },
  },
  Data: {
    base: 'byte',
    units: {
      Byte: 1, Kilobyte: 1000, Megabyte: 1e6, Gigabyte: 1e9, Terabyte: 1e12,
      Kibibyte: 1024, Mebibyte: 1048576, Gibibyte: 1073741824, Tebibyte: 1099511627776,
    },
  },
  Time: {
    base: 'second',
    units: { Millisecond: 0.001, Second: 1, Minute: 60, Hour: 3600, Day: 86400, Week: 604800, Year: 31557600 },
  },
  Pressure: {
    base: 'pascal',
    units: { Pascal: 1, Kilopascal: 1000, Bar: 100000, PSI: 6894.76, Atmosphere: 101325, 'mmHg': 133.322 },
  },
  Energy: {
    base: 'joule',
    units: { Joule: 1, Kilojoule: 1000, Calorie: 4.184, Kilocalorie: 4184, 'Watt hour': 3600, 'Kilowatt hour': 3.6e6 },
  },
};

const TEMPERATURES = {
  Celsius: { toBase: (value) => value, fromBase: (value) => value },
  Fahrenheit: { toBase: (value) => (value - 32) * (5 / 9), fromBase: (value) => value * (9 / 5) + 32 },
  Kelvin: { toBase: (value) => value - 273.15, fromBase: (value) => value + 273.15 },
};

function pretty(value) {
  if (!Number.isFinite(value)) return '—';
  const absolute = Math.abs(value);
  if (absolute !== 0 && (absolute < 1e-4 || absolute >= 1e12)) return value.toExponential(4);
  return Number(value.toFixed(6)).toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export default function (root, ctx) {
  const state = {
    category: ctx.state.category || 'Length',
    from: ctx.state.from || 'Metre',
    to: ctx.state.to || 'Foot',
    value: ctx.state.value ?? 1,
  };

  const resultBox = h('div.convert-result');
  const allUnits = h('div');
  const controlsHost = h('div');

  const unitNames = () => (state.category === 'Temperature' ? Object.keys(TEMPERATURES) : Object.keys(CATEGORIES[state.category].units));

  function convert(value, from, to) {
    if (state.category === 'Temperature') {
      return TEMPERATURES[to].fromBase(TEMPERATURES[from].toBase(value));
    }
    const units = CATEGORIES[state.category].units;
    return (value * units[from]) / units[to];
  }

  function run() {
    const value = Number(state.value) || 0;
    const converted = convert(value, state.from, state.to);
    mount(resultBox,
      h('span.convert-from', `${pretty(value)} ${state.from}`),
      h('span.convert-eq', '='),
      h('strong.convert-to', `${pretty(converted)} ${state.to}`)
    );

    mount(allUnits, table(['Unit', 'Value'],
      unitNames().map((unit) => [unit, h('code', pretty(convert(value, state.from, unit)))])));

    ctx.save({ category: state.category, from: state.from, to: state.to, value: state.value });
  }

  function drawControls() {
    const names = unitNames();
    if (!names.includes(state.from)) state.from = names[0];
    if (!names.includes(state.to)) state.to = names[1] || names[0];

    mount(controlsHost, controls(
      field('Category', select(
        [...Object.keys(CATEGORIES), 'Temperature'],
        state.category,
        (value) => {
          state.category = value;
          drawControls();
          run();
        }
      )),
      h('div.field.grow', h('span.label', 'Value'),
        input({
          type: 'number',
          value: String(state.value),
          oninput: (value) => {
            state.value = value;
            run();
          },
        })),
      field('From', select(names, state.from, (value) => {
        state.from = value;
        run();
      })),
      h('div', { style: { alignSelf: 'flex-end' } },
        button('Swap', {
          iconName: 'swap',
          onclick: () => {
            [state.from, state.to] = [state.to, state.from];
            drawControls();
            run();
          },
        })),
      field('To', select(names, state.to, (value) => {
        state.to = value;
        run();
      }))
    ));
  }

  mount(root,
    panel('Convert', {}, controlsHost, resultBox),
    panel('Every unit in this category', {}, allUnits)
  );

  drawControls();
  run();
}
