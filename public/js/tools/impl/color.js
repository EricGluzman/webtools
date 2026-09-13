import { h, mount, panel, split, controls, field, input, button, codeLine, copyText, table, noticeBox } from '../kit.js';

/* ---------------------------------------------------------- conversion */

const clamp = (value, min = 0, max = 255) => Math.min(max, Math.max(min, value));

function parseColor(text) {
  const value = text.trim().toLowerCase();

  const hex = value.match(/^#?([0-9a-f]{3,8})$/);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) digits = [...digits].map((char) => char + char).join('');
    if (digits.length !== 6 && digits.length !== 8) return null;
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1,
    };
  }

  const rgb = value.match(/^rgba?\(([^)]+)\)$/);
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    return { r: clamp(parts[0]), g: clamp(parts[1]), b: clamp(parts[2]), a: parts[3] ?? 1 };
  }

  const hsl = value.match(/^hsla?\(([^)]+)\)$/);
  if (hsl) {
    const parts = hsl[1].split(/[,\s/%]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.some(Number.isNaN)) return null;
    return { ...hslToRgb(parts[0], parts[1], parts[2]), a: parts[3] ?? 1 };
  }

  // Let the browser resolve named colours like "rebeccapurple".
  const probe = document.createElement('span');
  probe.style.color = value;
  if (!probe.style.color) return null;
  document.body.append(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  const match = resolved.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1].split(/[,\s/]+/).map(Number);
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === rn) hue = ((gn - bn) / delta) % 6;
    else if (max === gn) hue = (bn - rn) / delta + 2;
    else hue = (rn - gn) / delta + 4;
  }
  hue = Math.round(hue * 60);
  if (hue < 0) hue += 360;
  const lightness = (max + min) / 2;
  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  return { h: hue, s: Math.round(saturation * 100), l: Math.round(lightness * 100) };
}

function hslToRgb(h, s, l) {
  const saturation = s / 100;
  const lightness = l / 100;
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

const toHex = ({ r, g, b }) => `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;

function relativeLuminance({ r, g, b }) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

const contrastRatio = (a, b) => {
  const light = Math.max(relativeLuminance(a), relativeLuminance(b));
  const dark = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (light + 0.05) / (dark + 0.05);
};

function rgbToCmyk({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const k = 1 - Math.max(rn, gn, bn);
  if (k === 1) return { c: 0, m: 0, y: 0, k: 100 };
  return {
    c: Math.round(((1 - rn - k) / (1 - k)) * 100),
    m: Math.round(((1 - gn - k) / (1 - k)) * 100),
    y: Math.round(((1 - bn - k) / (1 - k)) * 100),
    k: Math.round(k * 100),
  };
}

/* --------------------------------------------------------------- view */

export default function (root, ctx) {
  const state = { value: ctx.state.value || '#7fa5ff' };

  const swatchBig = h('div.color-hero');
  const formats = h('div.stack-sm');
  const scale = h('div.swatch-grid');
  const harmonies = h('div.stack');
  const contrast = h('div');
  const problem = h('div');

  const textInput = input({
    value: state.value,
    mono: true,
    placeholder: '#7fa5ff, rgb(127 165 255), hsl(220 100% 75%), tomato',
    oninput: (value) => {
      state.value = value;
      ctx.save({ value });
      run();
    },
  });

  const picker = input({
    type: 'color',
    value: '#7fa5ff',
    style: { padding: '3px', height: '38px', width: '64px' },
    oninput: (value) => {
      state.value = value;
      textInput.value = value;
      ctx.save({ value });
      run();
    },
  });

  function swatch(color, label) {
    const hex = toHex(color);
    return h('div.swatch', {
      title: 'Click to copy',
      onclick: () => copyText(hex, `${hex} copied`),
    },
      h('div.sw-color', { style: { background: hex } }),
      h('div.sw-label', label || hex)
    );
  }

  function run() {
    mount(problem);
    const color = parseColor(state.value);
    if (!color) {
      mount(formats);
      mount(scale);
      mount(harmonies);
      mount(contrast);
      swatchBig.style.background = 'transparent';
      return mount(problem, noticeBox(`“${state.value}” is not a colour I can read.`, 'warn'));
    }

    const hex = toHex(color);
    const hsl = rgbToHsl(color.r, color.g, color.b);
    const cmyk = rgbToCmyk(color);
    picker.value = hex;
    swatchBig.style.background = hex;
    swatchBig.style.color = contrastRatio(color, { r: 255, g: 255, b: 255 }) > 3 ? '#fff' : '#111';
    swatchBig.textContent = hex.toUpperCase();

    mount(formats,
      codeLine(hex, { label: 'HEX' }),
      codeLine(`rgb(${color.r} ${color.g} ${color.b})`, { label: 'RGB' }),
      codeLine(`hsl(${hsl.h} ${hsl.s}% ${hsl.l}%)`, { label: 'HSL' }),
      codeLine(`cmyk(${cmyk.c}% ${cmyk.m}% ${cmyk.y}% ${cmyk.k}%)`, { label: 'CMYK' }),
      codeLine(`${color.r}, ${color.g}, ${color.b}`, { label: 'Channels' })
    );

    // Tints and shades, walking lightness.
    mount(scale, ...[95, 85, 75, 65, 55, 45, 35, 25, 15, 8].map((lightness) =>
      swatch(hslToRgb(hsl.h, hsl.s, lightness), `${lightness}%`)));

    const harmonySets = [
      { name: 'Complementary', offsets: [0, 180] },
      { name: 'Analogous', offsets: [-30, 0, 30] },
      { name: 'Triadic', offsets: [0, 120, 240] },
      { name: 'Split complement', offsets: [0, 150, 210] },
      { name: 'Tetradic', offsets: [0, 90, 180, 270] },
    ];
    mount(harmonies, ...harmonySets.map((set) =>
      h('div.stack-sm',
        h('span.label', set.name),
        h('div.swatch-grid', ...set.offsets.map((offset) =>
          swatch(hslToRgb((hsl.h + offset + 360) % 360, hsl.s, hsl.l)))))));

    const pairs = [
      ['White text', { r: 255, g: 255, b: 255 }],
      ['Black text', { r: 0, g: 0, b: 0 }],
    ];
    mount(contrast, table(['Pairing', 'Ratio', 'Normal text', 'Large text'],
      pairs.map(([label, other]) => {
        const ratio = contrastRatio(color, other);
        const badge = (pass) => h('span.chip', { class: pass ? 'tone-emerald' : 'tone-rose' }, pass ? 'pass' : 'fail');
        return [
          h('span', { style: { color: toHex(other), background: hex, padding: '3px 8px', borderRadius: '6px' } }, label),
          `${ratio.toFixed(2)}:1`,
          badge(ratio >= 4.5),
          badge(ratio >= 3),
        ];
      })));
  }

  mount(root,
    panel('Colour', {},
      controls(
        h('div.field.grow', h('span.label', 'Any notation'), textInput),
        field('Pick', picker),
        h('div', { style: { alignSelf: 'flex-end' } },
          button('Random', { iconName: 'dice', onclick: () => {
            const random = `#${Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')}`;
            state.value = random;
            textInput.value = random;
            ctx.save({ value: random });
            run();
          } }))),
      problem,
      swatchBig),
    split(
      panel('Formats', {}, formats),
      panel('Contrast', { subtitle: 'WCAG 2.1 thresholds' }, contrast)
    ),
    panel('Tints and shades', { subtitle: 'Click any swatch to copy it' }, scale),
    panel('Harmonies', {}, harmonies)
  );

  run();
}
