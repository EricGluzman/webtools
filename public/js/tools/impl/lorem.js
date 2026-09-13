import { h, mount, panel, output, button, controls, field, select, input, stats } from '../kit.js';

const WORDS = ('lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et '
  + 'dolore magna aliqua enim ad minim veniam quis nostrud exercitation ullamco laboris nisi aliquip ex ea commodo '
  + 'consequat duis aute irure in reprehenderit voluptate velit esse cillum eu fugiat nulla pariatur excepteur sint '
  + 'occaecat cupidatat non proident sunt culpa qui officia deserunt mollit anim id est laborum').split(' ');

const FIRST = ['Ada', 'Grace', 'Alan', 'Katherine', 'Linus', 'Margaret', 'Dennis', 'Barbara', 'Edsger', 'Radia',
  'Ken', 'Hedy', 'Tim', 'Anita', 'Donald', 'Frances', 'Leslie', 'Shafi', 'Andrei', 'Marta'];
const LAST = ['Lovelace', 'Hopper', 'Turing', 'Johnson', 'Torvalds', 'Hamilton', 'Ritchie', 'Liskov', 'Dijkstra',
  'Perlman', 'Thompson', 'Lamarr', 'Berners-Lee', 'Borg', 'Knuth', 'Allen', 'Lamport', 'Goldwasser', 'Ershov', 'Kovacs'];
const DOMAINS = ['example.com', 'mail.test', 'workbench.local', 'inbox.dev', 'post.example'];
const STREETS = ['Market Street', 'Baker Lane', 'Kyiv Avenue', 'Harbour Road', 'Willow Close', 'Station Square'];
const CITIES = ['Lisbon', 'Kyiv', 'Tallinn', 'Porto', 'Krakow', 'Valencia', 'Gothenburg', 'Ljubljana'];

const pick = (list) => list[Math.floor(Math.random() * list.length)];
const between = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function sentence() {
  const length = between(7, 16);
  const body = Array.from({ length }, () => pick(WORDS)).join(' ');
  return `${body[0].toUpperCase()}${body.slice(1)}.`;
}

function paragraph(sentences = between(3, 6)) {
  return Array.from({ length: sentences }, sentence).join(' ');
}

const GENERATORS = {
  paragraphs: (n) => Array.from({ length: n }, () => paragraph()).join('\n\n'),
  sentences: (n) => Array.from({ length: n }, sentence).join(' '),
  words: (n) => Array.from({ length: n }, () => pick(WORDS)).join(' '),
  names: (n) => Array.from({ length: n }, () => `${pick(FIRST)} ${pick(LAST)}`).join('\n'),
  emails: (n) => Array.from({ length: n }, () => {
    const first = pick(FIRST).toLowerCase();
    const last = pick(LAST).toLowerCase().replace(/[^a-z]/g, '');
    return `${first}.${last}@${pick(DOMAINS)}`;
  }).join('\n'),
  addresses: (n) => Array.from({ length: n }, () =>
    `${between(1, 240)} ${pick(STREETS)}, ${pick(CITIES)} ${between(10000, 99999)}`).join('\n'),
  numbers: (n) => Array.from({ length: n }, () => between(1, 10_000)).join('\n'),
  dates: (n) => Array.from({ length: n }, () => {
    const date = new Date(Date.now() - between(0, 900) * 86_400_000);
    return date.toISOString().slice(0, 10);
  }).join('\n'),
  people: (n) => JSON.stringify(Array.from({ length: n }, (_, index) => {
    const first = pick(FIRST);
    const last = pick(LAST);
    return {
      id: index + 1,
      name: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase().replace(/[^a-z]/g, '')}@${pick(DOMAINS)}`,
      city: pick(CITIES),
      age: between(21, 68),
      active: Math.random() > 0.3,
    };
  }), null, 2),
};

export default function (root, ctx) {
  const state = {
    kind: ctx.state.kind || 'paragraphs',
    count: ctx.state.count || 3,
  };

  const result = output({ filename: 'sample.txt', wrap: true });
  const info = h('div');

  function run() {
    const text = GENERATORS[state.kind](Math.min(Math.max(state.count, 1), 500));
    result.set(text);
    mount(info, stats([
      { label: 'Characters', value: text.length.toLocaleString() },
      { label: 'Words', value: (text.match(/\S+/g) || []).length.toLocaleString() },
      { label: 'Lines', value: text.split('\n').length },
    ]));
  }

  const countInput = input({
    type: 'number',
    value: String(state.count),
    min: '1',
    max: '500',
    oninput: (value) => {
      state.count = Number(value) || 1;
      ctx.save({ count: state.count });
      run();
    },
  });

  mount(root,
    controls(
      field('Generate', select([
        { value: 'paragraphs', label: 'Lorem paragraphs' },
        { value: 'sentences', label: 'Lorem sentences' },
        { value: 'words', label: 'Lorem words' },
        { value: 'names', label: 'Names' },
        { value: 'emails', label: 'Email addresses' },
        { value: 'addresses', label: 'Street addresses' },
        { value: 'dates', label: 'Dates' },
        { value: 'numbers', label: 'Numbers' },
        { value: 'people', label: 'People as JSON' },
      ], state.kind, (value) => {
        state.kind = value;
        ctx.save({ kind: value });
        run();
      })),
      field('How many', countInput),
      h('div', { style: { alignSelf: 'flex-end' } },
        button('Regenerate', { iconName: 'refresh', variant: 'btn-primary', onclick: run }))
    ),
    panel('Output', { actions: result.actions() }, result.node),
    info
  );

  run();
}
