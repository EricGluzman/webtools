import { h, mount, panel, split, textarea, controls, field, input, checkbox, stats, errorBox, table, debounce } from '../kit.js';
import { escapeHtml } from '../../core/dom.js';

const FLAGS = [
  { flag: 'g', label: 'global' },
  { flag: 'i', label: 'ignore case' },
  { flag: 'm', label: 'multiline' },
  { flag: 's', label: 'dot matches newline' },
  { flag: 'u', label: 'unicode' },
];

const CHEATS = [
  ['\\d', 'digit'], ['\\w', 'word character'], ['\\s', 'whitespace'],
  ['[abc]', 'one of a, b, c'], ['[^abc]', 'anything but a, b, c'], ['a|b', 'a or b'],
  ['?', '0 or 1'], ['*', '0 or more'], ['+', '1 or more'], ['{2,4}', 'between 2 and 4'],
  ['(…)', 'capture group'], ['(?<name>…)', 'named group'], ['(?:…)', 'non-capturing'],
  ['^ $', 'start / end'], ['\\b', 'word boundary'], ['(?=…)', 'lookahead'],
];

export default function (root, ctx) {
  const state = {
    pattern: ctx.state.pattern ?? '(\\w+)@(\\w+)\\.(\\w{2,})',
    flags: ctx.state.flags ?? 'gi',
    text: ctx.state.text ?? 'Mail ada@example.com or grace@navy.mil — old address: someone@nowhere',
    replacement: ctx.state.replacement ?? '$1 at $2',
  };

  const highlight = h('div.regex-preview');
  const matchHost = h('div');
  const replaceOut = h('pre.output-body.wrap');
  const problem = h('div');
  const summary = h('div');

  const patternInput = input({
    value: state.pattern,
    placeholder: 'Pattern, without slashes',
    mono: true,
    oninput: (value) => {
      state.pattern = value;
      ctx.save({ pattern: value });
      run();
    },
  });

  const subject = textarea({
    value: state.text,
    placeholder: 'Text to test against…',
    oninput: (value) => {
      state.text = value;
      ctx.save({ text: value });
      run();
    },
  });

  const replacement = input({
    value: state.replacement,
    placeholder: '$1, $<name> and $& are supported',
    mono: true,
    oninput: (value) => {
      state.replacement = value;
      ctx.save({ replacement: value });
      run();
    },
  });

  const run = debounce(() => {
    mount(problem);
    if (!state.pattern) {
      highlight.innerHTML = escapeHtml(state.text);
      mount(matchHost);
      mount(summary);
      replaceOut.textContent = '';
      return;
    }

    let regex;
    try {
      regex = new RegExp(state.pattern, state.flags.includes('g') ? state.flags : `${state.flags}g`);
    } catch (err) {
      mount(problem, errorBox(err.message));
      return;
    }

    const matches = [...state.text.matchAll(regex)];

    // Rebuild the subject with <mark> around every hit.
    let html = '';
    let cursor = 0;
    for (const match of matches) {
      if (match.index === undefined) continue;
      html += escapeHtml(state.text.slice(cursor, match.index));
      html += `<mark class="hit">${escapeHtml(match[0]) || '&nbsp;'}</mark>`;
      cursor = match.index + (match[0].length || 1);
    }
    html += escapeHtml(state.text.slice(cursor));
    highlight.innerHTML = html || '<span class="dim">No text</span>';

    mount(summary, stats([
      { label: 'Matches', value: matches.length },
      { label: 'Groups', value: matches[0] ? Math.max(matches[0].length - 1, 0) : 0 },
      { label: 'Flags', value: state.flags || '—' },
    ]));

    if (matches.length) {
      const rows = matches.slice(0, 80).map((match, index) => [
        String(index + 1),
        String(match.index),
        h('code', match[0]),
        match.length > 1
          ? h('div.stack-sm', ...match.slice(1).map((group, groupIndex) =>
              h('code.small', `$${groupIndex + 1} = ${group === undefined ? '—' : group}`)))
          : h('span.dim', '—'),
        match.groups
          ? h('div.stack-sm', ...Object.entries(match.groups).map(([name, value]) => h('code.small', `${name} = ${value ?? '—'}`)))
          : h('span.dim', '—'),
      ]);
      mount(matchHost, table(['#', 'At', 'Match', 'Groups', 'Named'], rows));
    } else {
      mount(matchHost, h('p.small.dim', 'No matches.'));
    }

    try {
      replaceOut.textContent = state.text.replace(regex, state.replacement);
    } catch (err) {
      replaceOut.textContent = err.message;
    }
  }, 130);

  const flagBoxes = FLAGS.map(({ flag, label }) =>
    checkbox(`${flag} · ${label}`, state.flags.includes(flag), (checked) => {
      state.flags = checked ? state.flags + flag : state.flags.replace(flag, '');
      ctx.save({ flags: state.flags });
      run();
    })
  );

  mount(root,
    panel('Pattern', { subtitle: 'JavaScript flavour' },
      controls(
        h('div.field.grow', h('span.label', 'Expression'), patternInput)),
      h('div.row.row-wrap', { style: { gap: '14px' } }, ...flagBoxes),
      problem
    ),
    split(
      panel('Test text', {}, subject),
      panel('Matches highlighted', {}, highlight, summary),
      { ratio: '1fr 1fr' }
    ),
    panel('Matches', {}, matchHost),
    panel('Replace', { subtitle: 'Preview of .replace()' },
      controls(h('div.field.grow', h('span.label', 'Replacement'), replacement)),
      replaceOut),
    panel('Quick reference', {},
      h('div.cheat-grid', ...CHEATS.map(([token, meaning]) =>
        h('div.cheat', h('code', token), h('span.small.dim', meaning))))
    )
  );

  run();
}
