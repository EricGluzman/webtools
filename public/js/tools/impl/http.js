import { h, mount, panel, input, controls, debounce, table } from '../kit.js';

const STATUS = [
  [100, 'Continue', 'Keep sending the request body.'],
  [101, 'Switching Protocols', 'The server agrees to change protocol, e.g. to WebSocket.'],
  [200, 'OK', 'Standard success.'],
  [201, 'Created', 'A new resource exists; point at it with Location.'],
  [202, 'Accepted', 'Queued for processing, not done yet.'],
  [204, 'No Content', 'Success with nothing to send back.'],
  [206, 'Partial Content', 'A byte range, used by resumable downloads.'],
  [301, 'Moved Permanently', 'Update your links; caches keep this.'],
  [302, 'Found', 'Temporary redirect, method may change.'],
  [303, 'See Other', 'Redirect to a GET, typical after a form post.'],
  [304, 'Not Modified', 'The cached copy is still good.'],
  [307, 'Temporary Redirect', 'Like 302 but the method is preserved.'],
  [308, 'Permanent Redirect', 'Like 301 but the method is preserved.'],
  [400, 'Bad Request', 'Malformed syntax the server refuses to guess at.'],
  [401, 'Unauthorized', 'Authentication missing or wrong — really “unauthenticated”.'],
  [403, 'Forbidden', 'Authenticated, but not allowed.'],
  [404, 'Not Found', 'No resource at this URL.'],
  [405, 'Method Not Allowed', 'Wrong verb for this endpoint.'],
  [406, 'Not Acceptable', 'Nothing matches the Accept header.'],
  [409, 'Conflict', 'The request clashes with current state, e.g. an edit conflict.'],
  [410, 'Gone', 'It existed and was deliberately removed.'],
  [413, 'Payload Too Large', 'The body exceeds a server limit.'],
  [415, 'Unsupported Media Type', 'The Content-Type is not handled here.'],
  [418, "I'm a teapot", 'An April Fools joke that stuck around.'],
  [422, 'Unprocessable Content', 'Syntax fine, semantics wrong — common for validation errors.'],
  [429, 'Too Many Requests', 'Rate limited; read Retry-After.'],
  [500, 'Internal Server Error', 'Unhandled failure on the server.'],
  [501, 'Not Implemented', 'The server does not support this method at all.'],
  [502, 'Bad Gateway', 'A proxy got a broken answer upstream.'],
  [503, 'Service Unavailable', 'Down or overloaded; usually temporary.'],
  [504, 'Gateway Timeout', 'A proxy gave up waiting upstream.'],
];

const METHODS = [
  ['GET', 'Read a resource. Safe and idempotent, cacheable.'],
  ['HEAD', 'Like GET but headers only.'],
  ['POST', 'Create or perform an action. Not idempotent.'],
  ['PUT', 'Replace a resource wholesale. Idempotent.'],
  ['PATCH', 'Apply a partial change.'],
  ['DELETE', 'Remove a resource. Idempotent.'],
  ['OPTIONS', 'Ask what is allowed — the CORS preflight.'],
];

const HEADERS = [
  ['Cache-Control', 'How and how long a response may be cached: max-age, no-store, private.'],
  ['Content-Type', 'Media type of the body, e.g. application/json; charset=utf-8.'],
  ['Authorization', 'Credentials, usually Bearer <token> or Basic <base64>.'],
  ['ETag / If-None-Match', 'Version tag enabling cheap 304 responses.'],
  ['Location', 'Where a redirect points, or where a new resource lives.'],
  ['Retry-After', 'Seconds (or a date) to wait after 429 or 503.'],
  ['Content-Security-Policy', 'Restricts what the page may load and execute.'],
  ['Strict-Transport-Security', 'Forces HTTPS for the whole domain.'],
  ['X-Content-Type-Options', 'nosniff stops the browser guessing the type.'],
  ['Access-Control-Allow-Origin', 'Which origins may read a cross-site response.'],
];

const toneFor = (code) => {
  if (code < 200) return 'slate';
  if (code < 300) return 'emerald';
  if (code < 400) return 'sky';
  if (code < 500) return 'amber';
  return 'rose';
};

export default function (root, ctx) {
  const state = { q: ctx.state.q || '' };

  const statusHost = h('div');
  const methodHost = h('div');
  const headerHost = h('div');

  const search = input({
    value: state.q,
    type: 'search',
    placeholder: 'Search a code, a method or a header…',
    oninput: debounce((value) => {
      state.q = value;
      ctx.save({ q: value });
      run();
    }, 110),
  });

  function run() {
    const needle = state.q.trim().toLowerCase();
    const match = (parts) => !needle || parts.join(' ').toLowerCase().includes(needle);

    const codes = STATUS.filter(([code, name, detail]) => match([String(code), name, detail]));
    mount(statusHost, codes.length
      ? h('div.code-list', ...codes.map(([code, name, detail]) =>
          h('div.code-item',
            h('span.chip', { class: `tone-${toneFor(code)}` }, String(code)),
            h('div', h('strong', name), h('p.small.dim', detail)))))
      : h('p.small.dim', 'No status code matches.'));

    const methods = METHODS.filter((row) => match(row));
    mount(methodHost, methods.length
      ? table(['Method', 'What it means'], methods.map(([name, detail]) => [h('code', name), detail]))
      : h('p.small.dim', 'No method matches.'));

    const headers = HEADERS.filter((row) => match(row));
    mount(headerHost, headers.length
      ? table(['Header', 'What it does'], headers.map(([name, detail]) => [h('code', name), detail]))
      : h('p.small.dim', 'No header matches.'));
  }

  mount(root,
    panel('Search', {}, controls(h('div.field.grow', h('span.label', 'Filter'), search))),
    panel('Status codes', {}, statusHost),
    panel('Methods', {}, methodHost),
    panel('Headers worth knowing', {}, headerHost)
  );

  run();
}
