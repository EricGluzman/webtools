import { h, mount, panel, split, controls, field, input, copyButton, checkbox } from '../kit.js';

export default function (root, ctx) {
  const state = {
    blur: ctx.state.blur ?? 24,
    saturation: ctx.state.saturation ?? 170,
    tint: ctx.state.tint || '#ffffff',
    opacity: ctx.state.opacity ?? 10,
    borderOpacity: ctx.state.borderOpacity ?? 18,
    radius: ctx.state.radius ?? 22,
    shadow: ctx.state.shadow ?? 28,
    highlight: ctx.state.highlight ?? true,
    dark: ctx.state.dark ?? true,
  };

  const card = h('div.glass-demo-card', h('strong', 'Frosted panel'), h('p.small', 'Drag the sliders and watch the material change.'));
  const stage = h('div.glass-stage', { class: state.dark ? 'dark' : 'light' }, card);
  const cssOut = h('pre.output-body.wrap');

  const hexToRgb = (hex) => {
    const value = hex.replace('#', '');
    const full = value.length === 3 ? [...value].map((char) => char + char).join('') : value;
    return [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16));
  };

  function css() {
    const [r, g, b] = hexToRgb(state.tint);
    const lines = [
      `background: rgba(${r}, ${g}, ${b}, ${(state.opacity / 100).toFixed(2)});`,
      `backdrop-filter: blur(${state.blur}px) saturate(${state.saturation}%);`,
      `-webkit-backdrop-filter: blur(${state.blur}px) saturate(${state.saturation}%);`,
      `border: 1px solid rgba(255, 255, 255, ${(state.borderOpacity / 100).toFixed(2)});`,
      `border-radius: ${state.radius}px;`,
      `box-shadow: 0 ${Math.round(state.shadow / 2)}px ${state.shadow}px rgba(0, 0, 0, ${(state.shadow / 140).toFixed(2)})${
        state.highlight ? `,\n            inset 0 1px 0 rgba(255, 255, 255, 0.25)` : ''};`,
    ];
    return lines.join('\n');
  }

  function run() {
    const [r, g, b] = hexToRgb(state.tint);
    Object.assign(card.style, {
      background: `rgba(${r}, ${g}, ${b}, ${state.opacity / 100})`,
      backdropFilter: `blur(${state.blur}px) saturate(${state.saturation}%)`,
      webkitBackdropFilter: `blur(${state.blur}px) saturate(${state.saturation}%)`,
      border: `1px solid rgba(255,255,255,${state.borderOpacity / 100})`,
      borderRadius: `${state.radius}px`,
      boxShadow: `0 ${Math.round(state.shadow / 2)}px ${state.shadow}px rgba(0,0,0,${state.shadow / 140})${
        state.highlight ? ', inset 0 1px 0 rgba(255,255,255,.25)' : ''}`,
    });
    stage.className = `glass-stage ${state.dark ? 'dark' : 'light'}`;
    cssOut.textContent = css();
    ctx.save({ ...state });
  }

  const slider = (label, key, min, max, suffix = '') =>
    h('div.field.grow',
      h('span.label', label),
      input({
        type: 'range',
        min: String(min),
        max: String(max),
        value: String(state[key]),
        oninput: (value, node) => {
          state[key] = Number(value);
          node.nextElementSibling.textContent = `${state[key]}${suffix}`;
          run();
        },
      }),
      h('small.dim', `${state[key]}${suffix}`));

  mount(root,
    split(
      panel('Preview', {}, stage),
      panel('Material', {},
        slider('Blur', 'blur', 0, 60, 'px'),
        slider('Saturation', 'saturation', 100, 260, '%'),
        slider('Tint opacity', 'opacity', 0, 60, '%'),
        slider('Border', 'borderOpacity', 0, 60, '%'),
        slider('Corner radius', 'radius', 0, 48, 'px'),
        slider('Shadow', 'shadow', 0, 70, 'px'),
        controls(
          field('Tint', input({
            type: 'color',
            value: state.tint,
            style: { width: '62px', height: '38px', padding: '3px' },
            oninput: (value) => {
              state.tint = value;
              run();
            },
          })),
          checkbox('Inner highlight', state.highlight, (value) => {
            state.highlight = value;
            run();
          }),
          checkbox('Dark backdrop', state.dark, (value) => {
            state.dark = value;
            run();
          })
        )),
      { ratio: '1fr 1fr' }
    ),
    panel('CSS', { actions: [copyButton(() => cssOut.textContent)] }, cssOut)
  );

  run();
}
