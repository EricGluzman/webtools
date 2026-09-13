import { h, mount, panel, split, textarea, controls, input, field, button, errorBox, noticeBox, table, copyButton } from '../kit.js';

const SAMPLE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkFkYSBMb3ZlbGFjZSIsImFkbWluIjp0cnVlLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjAwMDAwMDAwMH0.7vJcEo3SUZzvZxjAVKcHCmiJXHc5-rAnCEXAmPLeOnQ';

const CLAIMS = {
  iss: 'Issuer', sub: 'Subject', aud: 'Audience', exp: 'Expires at', nbf: 'Not before',
  iat: 'Issued at', jti: 'JWT ID', scope: 'Scope', azp: 'Authorized party', typ: 'Type',
};

function decodeSegment(segment) {
  const normalised = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalised + '='.repeat((4 - (normalised.length % 4)) % 4);
  return new TextDecoder().decode(Uint8Array.from(atob(padded), (char) => char.charCodeAt(0)));
}

const asDate = (value) => new Date(value * 1000);

export default function (root, ctx) {
  const state = { token: ctx.state.token ?? SAMPLE, secret: ctx.state.secret || '' };

  const headerOut = h('pre.output-body.wrap');
  const payloadOut = h('pre.output-body.wrap');
  const claims = h('div');
  const problem = h('div');
  const verifyOut = h('div');

  const tokenArea = textarea({
    value: state.token,
    placeholder: 'Paste a JWT…',
    oninput: (value) => {
      state.token = value.trim();
      ctx.save({ token: state.token });
      run();
    },
  });

  function run() {
    mount(problem);
    mount(claims);
    headerOut.textContent = '';
    payloadOut.textContent = '';
    if (!state.token) return;

    const segments = state.token.split('.');
    if (segments.length < 2) {
      return mount(problem, errorBox('A JWT has three dot-separated parts: header.payload.signature'));
    }

    let header;
    let payload;
    try {
      header = JSON.parse(decodeSegment(segments[0]));
      payload = JSON.parse(decodeSegment(segments[1]));
    } catch (err) {
      return mount(problem, errorBox(`Could not decode the token — ${err.message}`));
    }

    headerOut.textContent = JSON.stringify(header, null, 2);
    payloadOut.textContent = JSON.stringify(payload, null, 2);

    const rows = Object.entries(payload).map(([key, value]) => {
      const known = CLAIMS[key];
      let rendered;
      if (['exp', 'iat', 'nbf', 'auth_time'].includes(key) && typeof value === 'number') {
        const date = asDate(value);
        const expired = key === 'exp' && date < new Date();
        rendered = h('span', { style: expired ? { color: 'var(--bad)' } : null },
          `${date.toLocaleString()}${expired ? ' · expired' : ''}`);
      } else rendered = h('code', typeof value === 'object' ? JSON.stringify(value) : String(value));
      return [h('code', key), known ? h('span.small.dim', known) : h('span.dim', '—'), rendered];
    });
    mount(claims, rows.length ? table(['Claim', 'Meaning', 'Value'], rows) : h('p.small.dim', 'No claims.'));

    const expiry = payload.exp ? asDate(payload.exp) : null;
    if (expiry) {
      const expired = expiry < new Date();
      mount(verifyOut, noticeBox(
        expired ? `This token expired on ${expiry.toLocaleString()}.` : `Valid until ${expiry.toLocaleString()}.`,
        expired ? 'bad' : 'good'
      ));
    } else mount(verifyOut);
  }

  /** HS256 verification runs locally through SubtleCrypto — the secret never leaves the page. */
  async function verify() {
    const [headerSegment, payloadSegment, signature] = state.token.split('.');
    if (!signature) return mount(verifyOut, errorBox('This token has no signature to check.'));

    let algorithm;
    try {
      algorithm = JSON.parse(decodeSegment(headerSegment)).alg;
    } catch {
      algorithm = '';
    }
    const hash = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' }[algorithm];
    if (!hash) {
      return mount(verifyOut, noticeBox(`${algorithm || 'This'} tokens are signed with a key pair — only HS256/384/512 can be checked here.`, 'warn'));
    }

    const key = await crypto.subtle.importKey(
      'raw', new TextEncoder().encode(state.secret), { name: 'HMAC', hash }, false, ['sign']
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${headerSegment}.${payloadSegment}`));
    const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    mount(verifyOut, expected === signature
      ? noticeBox('Signature matches this secret.', 'good')
      : errorBox('Signature does not match that secret.'));
  }

  mount(root,
    panel('Token', {
      actions: [button('Sample', { onclick: () => {
        state.token = SAMPLE;
        tokenArea.value = SAMPLE;
        ctx.save({ token: SAMPLE });
        run();
      } })],
    }, tokenArea, problem),
    split(
      panel('Header', { actions: [copyButton(() => headerOut.textContent)] }, headerOut),
      panel('Payload', { actions: [copyButton(() => payloadOut.textContent)] }, payloadOut)
    ),
    panel('Claims', {}, claims),
    panel('Check an HS256 signature', { subtitle: 'Everything stays in your browser' },
      controls(
        h('div.field.grow', h('span.label', 'Shared secret'),
          input({
            value: state.secret,
            placeholder: 'your-256-bit-secret',
            mono: true,
            oninput: (value) => {
              state.secret = value;
              ctx.save({ secret: value });
            },
          })),
        h('div', { style: { alignSelf: 'flex-end' } }, button('Verify', { variant: 'btn-primary', onclick: verify }))),
      verifyOut)
  );

  run();
}
