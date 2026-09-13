import { h, mount, panel, split, controls, field, input, button, codeLine, table, errorBox, stats } from '../kit.js';

const ZONES = ['UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Kyiv', 'America/New_York', 'America/Los_Angeles', 'Asia/Jerusalem', 'Asia/Tokyo'];

function weekNumber(date) {
  const copy = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() + 4 - day);
  const start = new Date(Date.UTC(copy.getUTCFullYear(), 0, 1));
  return Math.ceil(((copy - start) / 86_400_000 + 1) / 7);
}

function parseInput(raw) {
  const text = raw.trim();
  if (!text) return new Date();
  if (/^\d{1,10}$/.test(text)) return new Date(Number(text) * 1000);
  if (/^\d{11,14}$/.test(text)) return new Date(Number(text));
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Could not read “${raw}” as a date`);
  return parsed;
}

export default function (root, ctx) {
  const state = { value: ctx.state.value || String(Math.floor(Date.now() / 1000)), zone: ctx.state.zone || 'UTC' };

  const results = h('div.stack-sm');
  const zoneTable = h('div');
  const problem = h('div');
  const summary = h('div');

  const valueInput = input({
    value: state.value,
    mono: true,
    placeholder: '1700000000, 2024-03-14T09:30:00Z, “next friday”…',
    oninput: (value) => {
      state.value = value;
      ctx.save({ value });
      run();
    },
  });

  function run() {
    mount(problem);
    let date;
    try {
      date = parseInput(state.value);
      if (Number.isNaN(date.getTime())) throw new Error('That is not a valid date');
    } catch (err) {
      mount(results);
      mount(zoneTable);
      mount(summary);
      return mount(problem, errorBox(err.message));
    }

    const seconds = Math.floor(date.getTime() / 1000);
    const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    const diff = (date.getTime() - Date.now()) / 1000;
    const relText = Math.abs(diff) < 60
      ? relative.format(Math.round(diff), 'second')
      : Math.abs(diff) < 3600
        ? relative.format(Math.round(diff / 60), 'minute')
        : Math.abs(diff) < 86400
          ? relative.format(Math.round(diff / 3600), 'hour')
          : relative.format(Math.round(diff / 86400), 'day');

    mount(results,
      codeLine(String(seconds), { label: 'Unix s' }),
      codeLine(String(date.getTime()), { label: 'Unix ms' }),
      codeLine(date.toISOString(), { label: 'ISO 8601' }),
      codeLine(date.toUTCString(), { label: 'UTC' }),
      codeLine(date.toString(), { label: 'Local' }),
      codeLine(date.toLocaleString(undefined, { dateStyle: 'full', timeStyle: 'medium' }), { label: 'Readable' })
    );

    const startOfYear = new Date(date.getFullYear(), 0, 0);
    mount(summary, stats([
      { label: 'Relative', value: relText },
      { label: 'Day of year', value: Math.floor((date - startOfYear) / 86_400_000) },
      { label: 'ISO week', value: weekNumber(date) },
      { label: 'Weekday', value: date.toLocaleDateString(undefined, { weekday: 'long' }) },
    ]));

    mount(zoneTable, table(['Zone', 'Local time', 'Offset'],
      ZONES.map((zone) => {
        const formatter = new Intl.DateTimeFormat(undefined, {
          timeZone: zone, dateStyle: 'medium', timeStyle: 'short',
        });
        const offsetFormatter = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'shortOffset' });
        const offset = offsetFormatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value || '';
        return [zone.replace('_', ' '), formatter.format(date), offset];
      })));
  }

  mount(root,
    panel('Input', { subtitle: 'Unix seconds, milliseconds, ISO or plain text' },
      controls(
        h('div.field.grow', h('span.label', 'Value'), valueInput),
        h('div.row', { style: { gap: '8px', alignSelf: 'flex-end' } },
          button('Now', { iconName: 'clock', variant: 'btn-primary', onclick: () => {
            state.value = String(Math.floor(Date.now() / 1000));
            valueInput.value = state.value;
            ctx.save({ value: state.value });
            run();
          } }),
          button('Start of today', { onclick: () => {
            const midnight = new Date();
            midnight.setHours(0, 0, 0, 0);
            state.value = String(Math.floor(midnight.getTime() / 1000));
            valueInput.value = state.value;
            ctx.save({ value: state.value });
            run();
          } }))),
      problem),
    summary,
    split(panel('Formats', {}, results), panel('Around the world', {}, zoneTable))
  );

  run();
}
