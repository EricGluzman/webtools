import { h, mount, panel, split, controls, field, input, select, button, copyButton, icon } from '../kit.js';

const PRESETS = [
  { name: 'Dusk', stops: ['#3f4fe0', '#c4409a'], angle: 135 },
  { name: 'Mint', stops: ['#12a594', '#a3d959'], angle: 120 },
  { name: 'Ember', stops: ['#fb7185', '#fbbf24'], angle: 45 },
  { name: 'Deep sea', stops: ['#0b1b3a', '#12a594'], angle: 160 },
  { name: 'Blossom', stops: ['#f0abfc', '#7fa5ff'], angle: 90 },
];

export default function (root, ctx) {
  const state = {
    type: ctx.state.type || 'linear',
    angle: ctx.state.angle ?? 135,
    shape: ctx.state.shape || 'circle at center',
    stops: ctx.state.stops || [
      { color: '#7fa5ff', at: 0 },
      { color: '#b98cff', at: 100 },
    ],
  };

  const preview = h('div.gradient-preview');
  const cssOut = h('pre.output-body.wrap');
  const stopsHost = h('div.stack-sm');

  function css() {
    const stops = [...state.stops]
      .sort((a, b) => a.at - b.at)
      .map((stop) => `${stop.color} ${stop.at}%`)
      .join(', ');
    if (state.type === 'radial') return `radial-gradient(${state.shape}, ${stops})`;
    if (state.type === 'conic') return `conic-gradient(from ${state.angle}deg, ${stops})`;
    return `linear-gradient(${state.angle}deg, ${stops})`;
  }

  function run() {
    const value = css();
    preview.style.background = value;
    cssOut.textContent = `background: ${value};`;
    ctx.save({ type: state.type, angle: state.angle, shape: state.shape, stops: state.stops });
  }

  function drawStops() {
    mount(stopsHost, ...state.stops.map((stop, index) =>
      h('div.stop-row',
        input({
          type: 'color',
          value: stop.color,
          style: { width: '52px', height: '34px', padding: '3px' },
          oninput: (value) => {
            stop.color = value;
            run();
          },
        }),
        input({
          value: stop.color,
          mono: true,
          oninput: (value) => {
            stop.color = value;
            run();
          },
        }),
        input({
          type: 'range',
          min: '0',
          max: '100',
          value: String(stop.at),
          oninput: (value, node) => {
            stop.at = Number(value);
            node.nextElementSibling.textContent = `${stop.at}%`;
            run();
          },
        }),
        h('span.small.dim', { style: { minWidth: '38px' } }, `${stop.at}%`),
        h('button.btn.btn-sm.btn-icon', {
          title: 'Remove this stop',
          disabled: state.stops.length <= 2,
          onclick: () => {
            state.stops.splice(index, 1);
            drawStops();
            run();
          },
        }, icon('x', { size: 14 })))));
  }

  const typeControls = h('div');

  function drawTypeControls() {
    mount(typeControls, controls(
      field('Type', select([
        { value: 'linear', label: 'Linear' },
        { value: 'radial', label: 'Radial' },
        { value: 'conic', label: 'Conic' },
      ], state.type, (value) => {
        state.type = value;
        drawTypeControls();
        run();
      })),
      state.type === 'radial'
        ? field('Shape', select([
            { value: 'circle at center', label: 'Circle, centred' },
            { value: 'ellipse at center', label: 'Ellipse, centred' },
            { value: 'circle at top left', label: 'Circle, top left' },
            { value: 'ellipse at bottom right', label: 'Ellipse, bottom right' },
          ], state.shape, (value) => {
            state.shape = value;
            run();
          }))
        : h('div.field.grow', h('span.label', state.type === 'conic' ? 'Start angle' : 'Angle'),
            input({
              type: 'range',
              min: '0',
              max: '360',
              value: String(state.angle),
              oninput: (value, node) => {
                state.angle = Number(value);
                node.nextElementSibling.textContent = `${state.angle}°`;
                run();
              },
            }),
            h('small.dim', `${state.angle}°`))
    ));
  }

  mount(root,
    split(
      panel('Preview', {
        actions: [button('Randomise', { iconName: 'dice', onclick: () => {
          const random = () => `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
          state.stops = [{ color: random(), at: 0 }, { color: random(), at: 100 }];
          state.angle = Math.floor(Math.random() * 360);
          drawStops();
          run();
        } })],
      }, preview),
      panel('Settings', {},
        typeControls,
        h('div.row', { style: { justifyContent: 'space-between' } },
          h('span.label', 'Colour stops'),
          button('Add stop', {
            iconName: 'plus',
            onclick: () => {
              state.stops.push({ color: '#ffffff', at: 50 });
              drawStops();
              run();
            },
          })),
        stopsHost),
      { ratio: '1fr 1fr' }
    ),
    panel('CSS', { actions: [copyButton(() => cssOut.textContent)] }, cssOut),
    panel('Presets', {},
      h('div.preset-grid', ...PRESETS.map((preset) =>
        h('button.preset', {
          style: { background: `linear-gradient(${preset.angle}deg, ${preset.stops.join(', ')})` },
          onclick: () => {
            state.stops = preset.stops.map((color, index) => ({ color, at: index * 100 }));
            state.angle = preset.angle;
            state.type = 'linear';
            drawStops();
            run();
          },
        }, h('span', preset.name)))))
  );

  drawTypeControls();
  drawStops();
  run();
}
