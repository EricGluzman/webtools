import { h, mount, panel, split, textarea, controls, field, input, select, button, download, toast, debounce } from '../kit.js';

const TEMPLATES = [
  { id: 'text', label: 'Text or link' },
  { id: 'wifi', label: 'Wi-Fi network' },
  { id: 'email', label: 'Email' },
  { id: 'phone', label: 'Phone' },
  { id: 'contact', label: 'Contact card' },
];

export default function (root, ctx) {
  const state = {
    template: ctx.state.template || 'text',
    text: ctx.state.text || 'https://',
    size: ctx.state.size || 512,
    ecl: ctx.state.ecl || 'M',
    dark: ctx.state.dark || '#101318',
    light: ctx.state.light || '#ffffff',
    wifi: ctx.state.wifi || { ssid: '', password: '', security: 'WPA', hidden: false },
    contact: ctx.state.contact || { name: '', phone: '', email: '', org: '' },
  };

  const image = h('img.qr-image', { alt: 'QR code preview' });
  const payloadOut = h('code.qr-payload');
  const formHost = h('div');

  function payload() {
    if (state.template === 'wifi') {
      const { ssid, password, security, hidden } = state.wifi;
      if (!ssid) return '';
      const escape = (value) => String(value).replace(/([\;,:"])/g, '\\$1');
      return `WIFI:T:${security};S:${escape(ssid)};${security === 'nopass' ? '' : `P:${escape(password)};`}${hidden ? 'H:true;' : ''};`;
    }
    if (state.template === 'email') return state.text.includes('@') ? `mailto:${state.text.trim()}` : '';
    if (state.template === 'phone') return state.text.trim() ? `tel:${state.text.replace(/\s/g, '')}` : '';
    if (state.template === 'contact') {
      const { name, phone, email, org } = state.contact;
      if (!name) return '';
      return ['BEGIN:VCARD', 'VERSION:3.0', `FN:${name}`, org ? `ORG:${org}` : '', phone ? `TEL:${phone}` : '',
        email ? `EMAIL:${email}` : '', 'END:VCARD'].filter(Boolean).join('\n');
    }
    return state.text.trim();
  }

  function url(format = 'png') {
    const params = new URLSearchParams({
      text: payload(),
      size: String(state.size),
      ecl: state.ecl,
      dark: state.dark,
      light: state.light,
      format,
    });
    return `/api/tools/qr?${params}`;
  }

  const run = debounce(() => {
    const value = payload();
    payloadOut.textContent = value || 'Fill in the fields to build a code.';
    if (!value) {
      image.removeAttribute('src');
      image.classList.add('hidden');
      return;
    }
    image.classList.remove('hidden');
    image.src = url('png');
  }, 220);

  function drawForm() {
    if (state.template === 'wifi') {
      mount(formHost, controls(
        h('div.field.grow', h('span.label', 'Network name'), input({
          value: state.wifi.ssid,
          placeholder: 'Home-WiFi',
          oninput: (value) => {
            state.wifi.ssid = value;
            ctx.save({ wifi: state.wifi });
            run();
          },
        })),
        h('div.field.grow', h('span.label', 'Password'), input({
          value: state.wifi.password,
          placeholder: '••••••••',
          oninput: (value) => {
            state.wifi.password = value;
            ctx.save({ wifi: state.wifi });
            run();
          },
        })),
        field('Security', select([
          { value: 'WPA', label: 'WPA / WPA2' },
          { value: 'WEP', label: 'WEP' },
          { value: 'nopass', label: 'Open' },
        ], state.wifi.security, (value) => {
          state.wifi.security = value;
          ctx.save({ wifi: state.wifi });
          run();
        }))
      ));
      return;
    }

    if (state.template === 'contact') {
      mount(formHost, controls(
        ...[['name', 'Name'], ['org', 'Organisation'], ['phone', 'Phone'], ['email', 'Email']].map(([key, label]) =>
          h('div.field.grow', h('span.label', label), input({
            value: state.contact[key],
            oninput: (value) => {
              state.contact[key] = value;
              ctx.save({ contact: state.contact });
              run();
            },
          })))
      ));
      return;
    }

    const area = textarea({
      value: state.text,
      placeholder: state.template === 'email' ? 'name@example.com'
        : state.template === 'phone' ? '+380 44 000 0000'
        : 'https://example.com or any text',
      oninput: (value) => {
        state.text = value;
        ctx.save({ text: value });
        run();
      },
    });
    area.style.minHeight = '110px';
    mount(formHost, area);
  }

  mount(root,
    split(
      panel('Content', {}, 
        controls(field('Type', select(
          TEMPLATES.map((template) => ({ value: template.id, label: template.label })),
          state.template,
          (value) => {
            state.template = value;
            ctx.save({ template: value });
            drawForm();
            run();
          }
        ))),
        formHost,
        h('div.stack-sm', h('span.label', 'Encoded payload'), payloadOut)),
      panel('Preview', {
        actions: [
          button('PNG', { iconName: 'download', onclick: () => {
            if (!payload()) return toast('Nothing to encode yet', 'error');
            window.open(url('png'), '_blank', 'noopener');
          } }),
          button('SVG', { iconName: 'download', onclick: async () => {
            if (!payload()) return toast('Nothing to encode yet', 'error');
            const response = await fetch(url('svg'));
            download('qr.svg', await response.text(), 'image/svg+xml');
          } }),
        ],
      }, h('div.qr-stage', image)),
      { ratio: '1.1fr .9fr' }
    ),
    panel('Appearance', {},
      controls(
        field('Size', select([
          { value: '256', label: '256 px' },
          { value: '512', label: '512 px' },
          { value: '1024', label: '1024 px' },
          { value: '2000', label: '2000 px' },
        ], String(state.size), (value) => {
          state.size = Number(value);
          ctx.save({ size: state.size });
          run();
        })),
        field('Error correction', select([
          { value: 'L', label: 'L · 7%' },
          { value: 'M', label: 'M · 15%' },
          { value: 'Q', label: 'Q · 25%' },
          { value: 'H', label: 'H · 30%' },
        ], state.ecl, (value) => {
          state.ecl = value;
          ctx.save({ ecl: value });
          run();
        })),
        field('Foreground', input({
          type: 'color',
          value: state.dark,
          style: { padding: '3px', height: '38px', width: '60px' },
          oninput: (value) => {
            state.dark = value;
            ctx.save({ dark: value });
            run();
          },
        })),
        field('Background', input({
          type: 'color',
          value: state.light,
          style: { padding: '3px', height: '38px', width: '60px' },
          oninput: (value) => {
            state.light = value;
            ctx.save({ light: value });
            run();
          },
        }))
      ))
  );

  drawForm();
  run();
}
