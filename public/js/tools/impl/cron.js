import { h, mount, panel, split, controls, field, input, button, errorBox, table, noticeBox } from '../kit.js';

const PRESETS = [
  { expression: '*/5 * * * *', label: 'Every 5 minutes' },
  { expression: '0 * * * *', label: 'Hourly' },
  { expression: '0 3 * * *', label: 'Daily at 03:00' },
  { expression: '0 9 * * 1-5', label: 'Weekday mornings' },
  { expression: '0 0 1 * *', label: 'Start of each month' },
  { expression: '30 2 * * 0', label: 'Sunday 02:30' },
];

const NAMES = {
  month: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  day: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
};

const RANGES = {
  minute: [0, 59], hour: [0, 23], date: [1, 31], month: [1, 12], day: [0, 6],
};

const ALIASES = {
  month: { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 },
  day: { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 },
};

function parseField(raw, unit) {
  const [min, max] = RANGES[unit];
  const values = new Set();

  for (const part of raw.split(',')) {
    const [body, stepText] = part.split('/');
    const step = stepText ? Number(stepText) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`Bad step “/${stepText}” in the ${unit} field`);

    const resolve = (token) => {
      const alias = ALIASES[unit]?.[token.toLowerCase()];
      if (alias !== undefined) return alias;
      const number = Number(token);
      if (!Number.isInteger(number)) throw new Error(`“${token}” is not valid in the ${unit} field`);
      return number;
    };

    let start = min;
    let end = max;
    if (body !== '*' && body !== '?') {
      if (body.includes('-')) {
        const [from, to] = body.split('-');
        start = resolve(from);
        end = resolve(to);
      } else {
        start = resolve(body);
        end = stepText ? max : start;
      }
    }
    if (start < min || end > max || start > end) {
      throw new Error(`${unit} values must be between ${min} and ${max}`);
    }
    for (let value = start; value <= end; value += step) values.add(unit === 'day' && value === 7 ? 0 : value);
  }
  return [...values].sort((a, b) => a - b);
}

function listText(values, unit, total) {
  if (values.length === total) return null;
  if (unit === 'day') return values.map((value) => NAMES.day[value]).join(', ');
  if (unit === 'month') return values.map((value) => NAMES.month[value - 1]).join(', ');
  return values.join(', ');
}

function describe(fields) {
  const [minutes, hours, dates, months, days] = fields;
  const every = (list, unit) => list.length === RANGES[unit][1] - RANGES[unit][0] + 1;

  let when;
  if (every(minutes, 'minute') && every(hours, 'hour')) when = 'Every minute';
  else if (minutes.length === 1 && every(hours, 'hour')) when = `Every hour at minute ${minutes[0]}`;
  else if (every(minutes, 'minute')) when = `Every minute during hour ${hours.join(', ')}`;
  else {
    const times = [];
    for (const hour of hours.slice(0, 6)) {
      for (const minute of minutes.slice(0, 6)) {
        times.push(`${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`);
      }
    }
    when = `At ${times.slice(0, 8).join(', ')}${times.length > 8 ? ' …' : ''}`;
  }

  const parts = [when];
  const dateText = listText(dates, 'date', 31);
  const monthText = listText(months, 'month', 12);
  const dayText = listText(days, 'day', 7);
  if (dayText) parts.push(`on ${dayText}`);
  if (dateText) parts.push(`on day ${dateText} of the month`);
  if (monthText) parts.push(`in ${monthText}`);
  return `${parts.join(' ')}.`;
}

function nextRuns(fields, count = 8) {
  const [minutes, hours, dates, months, days] = fields;
  const runs = [];
  const cursor = new Date();
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  // Walking minute by minute for a year is plenty for a five-field expression.
  for (let step = 0; step < 527_040 && runs.length < count; step += 1) {
    if (
      minutes.includes(cursor.getMinutes()) &&
      hours.includes(cursor.getHours()) &&
      months.includes(cursor.getMonth() + 1) &&
      (dates.includes(cursor.getDate()) || days.includes(cursor.getDay()))
    ) {
      runs.push(new Date(cursor));
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return runs;
}

export default function (root, ctx) {
  const state = { expression: ctx.state.expression || '0 9 * * 1-5' };

  const explanation = h('div');
  const runs = h('div');
  const problem = h('div');

  const expressionInput = input({
    value: state.expression,
    mono: true,
    placeholder: 'minute hour day-of-month month day-of-week',
    oninput: (value) => {
      state.expression = value;
      ctx.save({ expression: value });
      run();
    },
  });

  function run() {
    mount(problem);
    const tokens = state.expression.trim().split(/\s+/);
    if (tokens.length !== 5) {
      mount(explanation);
      mount(runs);
      return mount(problem, errorBox('A cron expression has five fields: minute, hour, day of month, month, day of week.'));
    }

    let fields;
    try {
      fields = [
        parseField(tokens[0], 'minute'),
        parseField(tokens[1], 'hour'),
        parseField(tokens[2], 'date'),
        parseField(tokens[3], 'month'),
        parseField(tokens[4], 'day'),
      ];
    } catch (err) {
      mount(explanation);
      mount(runs);
      return mount(problem, errorBox(err.message));
    }

    mount(explanation,
      h('p', { style: { fontSize: '15.5px', fontWeight: '560' } }, describe(fields)),
      h('div.field-grid',
        ...[['Minute', tokens[0]], ['Hour', tokens[1]], ['Day of month', tokens[2]], ['Month', tokens[3]], ['Day of week', tokens[4]]]
          .map(([label, value]) => h('div.field-cell', h('small.dim', label), h('code', value))))
    );

    const upcoming = nextRuns(fields);
    mount(runs, upcoming.length
      ? table(['Next runs', 'In'], upcoming.map((date) => [
          date.toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
          h('span.dim', humanGap(date)),
        ]))
      : h('p.small.dim', 'No run in the next year — check the day-of-month and month fields.'));
  }

  function humanGap(date) {
    const minutes = Math.round((date - Date.now()) / 60000);
    if (minutes < 60) return `${minutes} min`;
    if (minutes < 1440) return `${Math.round(minutes / 60)} h`;
    return `${Math.round(minutes / 1440)} days`;
  }

  mount(root,
    panel('Expression', {},
      controls(h('div.field.grow', h('span.label', 'Cron'), expressionInput)),
      h('div.row.row-wrap', { style: { gap: '7px' } },
        ...PRESETS.map((preset) =>
          h('button.chip', {
            onclick: () => {
              state.expression = preset.expression;
              expressionInput.value = preset.expression;
              ctx.save({ expression: preset.expression });
              run();
            },
          }, preset.label))),
      problem),
    split(panel('In plain English', {}, explanation), panel('Schedule', {}, runs)),
    noticeBox('Day-of-month and day-of-week are combined with OR, the way cron itself does it.')
  );

  run();
}
