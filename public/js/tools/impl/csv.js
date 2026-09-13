import { h, mount, panel, split, textarea, output, button, controls, field, select, errorBox, table } from '../kit.js';

/** Handles quoted fields, escaped quotes and CRLF. */
function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let value = '';
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i += 1;
        } else quoted = false;
      } else value += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(value);
      value = '';
    } else if (char === '\n') {
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else if (char !== '\r') value += char;
  }
  if (value !== '' || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows.filter((line) => line.length > 1 || line[0] !== '');
}

function toCsv(records, delimiter) {
  const headers = [...new Set(records.flatMap((record) => Object.keys(record)))];
  const cell = (value) => {
    const text = value === null || value === undefined ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /["\n\r]|^\s|\s$/.test(text) || text.includes(delimiter) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [headers.join(delimiter), ...records.map((record) => headers.map((key) => cell(record[key])).join(delimiter))].join('\n');
}

const SAMPLE = `name,role,city,joined
Ada Lovelace,Engineer,London,1843-12-10
Grace Hopper,Rear Admiral,New York,1944-07-02
Katherine Johnson,Mathematician,Hampton,1953-06-01`;

export default function (root, ctx) {
  const state = {
    text: ctx.state.text || '',
    delimiter: ctx.state.delimiter || ',',
    direction: ctx.state.direction || 'csv2json',
    header: ctx.state.header ?? true,
  };

  const result = output({ filename: 'converted.txt', wrap: true });
  const preview = h('div');
  const problem = h('div');

  const source = textarea({
    value: state.text,
    placeholder: 'Paste CSV (or JSON, when converting the other way)…',
    oninput: (value) => {
      state.text = value;
      ctx.save({ text: value });
      run();
    },
  });

  const delimiterOf = () => ({ tab: '\t', ',': ',', ';': ';', '|': '|' }[state.delimiter] || ',');

  function detect(text) {
    const firstLine = text.split('\n')[0] || '';
    const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
    for (const char of firstLine) if (char in counts) counts[char] += 1;
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best && best[1] > 0 ? best[0] : ',';
  }

  function run() {
    mount(problem);
    mount(preview);
    if (!state.text.trim()) return result.set('');

    try {
      if (state.direction === 'csv2json') {
        const delimiter = state.delimiter === 'auto' ? detect(state.text) : delimiterOf();
        const rows = parseCsv(state.text, delimiter);
        if (!rows.length) return result.set('[]');

        const headers = state.header ? rows[0].map((head) => head.trim()) : rows[0].map((_, i) => `column_${i + 1}`);
        const body = state.header ? rows.slice(1) : rows;
        const records = body.map((row) =>
          Object.fromEntries(headers.map((key, index) => {
            const raw = (row[index] ?? '').trim();
            const number = raw !== '' && !Number.isNaN(Number(raw)) ? Number(raw) : null;
            return [key, number !== null && String(number) === raw ? number : raw];
          })));

        result.set(JSON.stringify(records, null, 2));
        mount(preview, table(headers, body.slice(0, 25).map((row) => headers.map((_, index) => row[index] ?? ''))));
        if (body.length > 25) preview.append(h('p.small.dim', { style: { marginTop: '8px' } }, `Showing 25 of ${body.length} rows.`));
      } else {
        const parsed = JSON.parse(state.text);
        const records = Array.isArray(parsed) ? parsed : [parsed];
        if (!records.every((record) => record && typeof record === 'object')) {
          throw new Error('Expected an array of objects');
        }
        const csv = toCsv(records, delimiterOf());
        result.set(csv);
        const rows = parseCsv(csv, delimiterOf());
        mount(preview, table(rows[0], rows.slice(1, 26)));
      }
    } catch (err) {
      mount(problem, errorBox(err.message));
      result.set('');
    }
  }

  mount(root,
    controls(
      field('Direction', select([
        { value: 'csv2json', label: 'CSV → JSON' },
        { value: 'json2csv', label: 'JSON → CSV' },
      ], state.direction, (value) => {
        state.direction = value;
        ctx.save({ direction: value });
        run();
      })),
      field('Delimiter', select([
        { value: 'auto', label: 'Detect' },
        { value: ',', label: 'Comma' },
        { value: ';', label: 'Semicolon' },
        { value: 'tab', label: 'Tab' },
        { value: '|', label: 'Pipe' },
      ], state.delimiter, (value) => {
        state.delimiter = value;
        ctx.save({ delimiter: value });
        run();
      })),
      h('div.row.row-wrap', { style: { gap: '8px', alignSelf: 'flex-end' } },
        button('Sample', { onclick: () => {
          source.value = SAMPLE;
          state.text = SAMPLE;
          state.direction = 'csv2json';
          ctx.save({ text: SAMPLE, direction: 'csv2json' });
          run();
        } }),
        button('Swap', { iconName: 'swap', onclick: () => {
          const next = result.value;
          state.direction = state.direction === 'csv2json' ? 'json2csv' : 'csv2json';
          state.text = next;
          source.value = next;
          ctx.save({ text: next, direction: state.direction });
          run();
        } }))
    ),
    problem,
    split(panel('Input', {}, source), panel('Result', { actions: result.actions() }, result.node)),
    panel('Preview', { subtitle: 'First rows as a table' }, preview)
  );

  run();
}
