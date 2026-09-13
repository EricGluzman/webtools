import { h, mount, panel, split, textarea, button, copyButton, download } from '../kit.js';
import { escapeHtml } from '../../core/dom.js';

const SAMPLE = `# Workbench

A **private** toolkit that runs on _your_ server.

## What it does
- Formats and inspects data
- Keeps sticky notes that stay put
- Reads receipts with OCR

> Nothing leaves the machine.

\`\`\`bash
sudo systemctl restart workbench
\`\`\`

| Tool | Offline |
| ---- | ------- |
| JSON | yes |
| OCR  | yes |

[Read the docs](https://example.com) · ~~no cloud~~
`;

/** A small CommonMark subset — enough for notes, readmes and pasted snippets. */
export function renderMarkdown(source) {
  const blocks = [];
  const lines = escapeHtml(source).split('\n');
  let i = 0;

  const inline = (text) =>
    text
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img src="$2" alt="$1">')
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" rel="noopener noreferrer" target="_blank">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|\W)_([^_]+)_(?=\W|$)/g, '$1<em>$2</em>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/~~([^~]+)~~/g, '<del>$1</del>')
      .replace(/ {2}$/, '<br>');

  while (i < lines.length) {
    const line = lines[i];

    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const body = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i])) body.push(lines[i++]);
      i += 1;
      blocks.push(`<pre class="md-code"${language ? ` data-lang="${language}"` : ''}><code>${body.join('\n')}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`);
      i += 1;
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\S]*$/.test(line) && line.replace(/[\s*_-]/g, '') === '') {
      blocks.push('<hr>');
      i += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push(`<blockquote>${renderMarkdown(body.join('\n'))}</blockquote>`);
      continue;
    }

    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const cells = (row) => row.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim());
      const head = cells(line);
      i += 2;
      const body = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) body.push(cells(lines[i++]));
      blocks.push(
        `<table class="table"><thead><tr>${head.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead>` +
        `<tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      );
      continue;
    }

    if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items = [];
      while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
        items.push(inline(lines[i++].replace(/^\s*([-*+]|\d+\.)\s+/, '')));
      }
      const tag = ordered ? 'ol' : 'ul';
      blocks.push(`<${tag}>${items.map((item) => `<li>${item}</li>`).join('')}</${tag}>`);
      continue;
    }

    if (!line.trim()) {
      i += 1;
      continue;
    }

    const paragraph = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|```|\s*>|\s*([-*+]|\d+\.)\s)/.test(lines[i])) {
      paragraph.push(lines[i++]);
    }
    blocks.push(`<p>${inline(paragraph.join('\n'))}</p>`);
  }

  return blocks.join('\n');
}

export default function (root, ctx) {
  const state = { text: ctx.state.text ?? SAMPLE };
  const preview = h('div.md-preview');

  const source = textarea({
    value: state.text,
    placeholder: 'Write Markdown…',
    oninput: (value) => {
      state.text = value;
      ctx.save({ text: value });
      run();
    },
  });

  function run() {
    preview.innerHTML = renderMarkdown(state.text) || '<p class="dim">Nothing to preview.</p>';
  }

  mount(root,
    split(
      panel('Markdown', {
        actions: [button('Sample', { onclick: () => {
          source.value = SAMPLE;
          state.text = SAMPLE;
          ctx.save({ text: SAMPLE });
          run();
        } })],
      }, source),
      panel('Preview', {
        actions: [
          copyButton(() => renderMarkdown(state.text), { label: 'Copy HTML' }),
          button('Save .md', { iconName: 'download', onclick: () => download('notes.md', state.text, 'text/markdown') }),
        ],
      }, preview)
    )
  );

  run();
}
