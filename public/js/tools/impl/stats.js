import { h, mount, panel, split, textarea, stats, controls, checkbox } from '../kit.js';

const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'is', 'it', 'that', 'this',
  'for', 'on', 'with', 'as', 'at', 'by', 'from', 'be', 'are', 'was', 'were', 'has', 'have', 'had', 'not', 'you',
  'your', 'we', 'they', 'he', 'she', 'i', 'my', 'our', 'their', 'its', 'if', 'so', 'do', 'does', 'can', 'will']);

export default function (root, ctx) {
  const state = { text: ctx.state.text || '', skipStopWords: ctx.state.skipStopWords ?? true };

  const summary = h('div');
  const frequency = h('div');
  const detail = h('div');

  const source = textarea({
    value: state.text,
    placeholder: 'Paste an article, an essay or a chunk of code…',
    oninput: (value) => {
      state.text = value;
      ctx.save({ text: value });
      run();
    },
  });

  function run() {
    const text = state.text;
    const wordList = text.toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
    const sentences = text.split(/[.!?]+(?:\s|$)/).filter((part) => part.trim()).length;
    const paragraphs = text.split(/\n\s*\n/).filter((part) => part.trim()).length;
    const readingMinutes = wordList.length / 220;
    const speakingMinutes = wordList.length / 130;

    mount(summary, stats([
      { label: 'Words', value: wordList.length.toLocaleString() },
      { label: 'Characters', value: text.length.toLocaleString() },
      { label: 'No spaces', value: text.replace(/\s/g, '').length.toLocaleString() },
      { label: 'Lines', value: (text ? text.split('\n').length : 0).toLocaleString() },
    ]));

    mount(detail, stats([
      { label: 'Sentences', value: sentences },
      { label: 'Paragraphs', value: paragraphs },
      { label: 'Unique words', value: new Set(wordList).size.toLocaleString() },
      { label: 'Reading time', value: readingMinutes < 1 ? '<1 min' : `${Math.round(readingMinutes)} min` },
      { label: 'Speaking time', value: speakingMinutes < 1 ? '<1 min' : `${Math.round(speakingMinutes)} min` },
      { label: 'Avg word length', value: wordList.length ? (wordList.join('').length / wordList.length).toFixed(1) : '0' },
    ]));

    const counts = new Map();
    for (const word of wordList) {
      if (state.skipStopWords && (STOP_WORDS.has(word) || word.length < 3)) continue;
      counts.set(word, (counts.get(word) || 0) + 1);
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18);
    const max = top[0]?.[1] || 1;

    mount(frequency, top.length
      ? h('div.bar-chart', ...top.map(([word, count]) =>
          h('div.bar-row',
            h('span.truncate', { title: word }, word),
            h('span.track', h('span.fill', { style: { width: `${(count / max) * 100}%` } })),
            h('span.val', String(count)))))
      : h('p.small.dim', 'Not enough text yet.'));
  }

  mount(root,
    split(
      panel('Text', {}, source),
      panel('At a glance', {},
        summary,
        detail,
        controls(checkbox('Ignore common words', state.skipStopWords, (value) => {
          state.skipStopWords = value;
          ctx.save({ skipStopWords: value });
          run();
        })),
        h('span.label', 'Most used words'),
        frequency),
      { ratio: '1fr 1fr' }
    )
  );

  run();
}
