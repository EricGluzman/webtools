import { h, mount, panel, split, textarea, controls, checkbox, stats, button } from '../kit.js';

/** Classic LCS table — fine for the text sizes a browser tool sees. */
function lcsDiff(a, b) {
  const rows = a.length;
  const cols = b.length;
  const table = Array.from({ length: rows + 1 }, () => new Uint32Array(cols + 1));

  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      table[i][j] = a[i] === b[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }

  const result = [];
  let i = 0;
  let j = 0;
  while (i < rows && j < cols) {
    if (a[i] === b[j]) {
      result.push({ type: 'same', text: a[i], left: i + 1, right: j + 1 });
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      result.push({ type: 'del', text: a[i], left: i + 1 });
      i += 1;
    } else {
      result.push({ type: 'add', text: b[j], right: j + 1 });
      j += 1;
    }
  }
  while (i < rows) result.push({ type: 'del', text: a[i], left: ++i });
  while (j < cols) result.push({ type: 'add', text: b[j], right: ++j });
  return result;
}

export default function (root, ctx) {
  const state = {
    left: ctx.state.left ?? '',
    right: ctx.state.right ?? '',
    trim: ctx.state.trim ?? true,
    ignoreCase: ctx.state.ignoreCase ?? false,
    onlyChanges: ctx.state.onlyChanges ?? false,
  };

  const result = h('div.diff-out');
  const summary = h('div');

  const leftArea = textarea({
    value: state.left,
    placeholder: 'Original text…',
    oninput: (value) => {
      state.left = value;
      ctx.save({ left: value });
      run();
    },
  });
  const rightArea = textarea({
    value: state.right,
    placeholder: 'Changed text…',
    oninput: (value) => {
      state.right = value;
      ctx.save({ right: value });
      run();
    },
  });

  function prepare(text) {
    return text.split('\n').map((line) => {
      let out = state.trim ? line.trimEnd() : line;
      return state.ignoreCase ? out.toLowerCase() : out;
    });
  }

  function run() {
    if (!state.left && !state.right) {
      mount(result, h('p.small.dim', 'Paste two versions of a text to compare them.'));
      mount(summary);
      return;
    }

    const leftLines = prepare(state.left);
    const rightLines = prepare(state.right);
    const originalLeft = state.left.split('\n');
    const originalRight = state.right.split('\n');
    const diff = lcsDiff(leftLines, rightLines);

    const added = diff.filter((row) => row.type === 'add').length;
    const removed = diff.filter((row) => row.type === 'del').length;

    mount(summary, stats([
      { label: 'Added', value: `+${added}` },
      { label: 'Removed', value: `−${removed}` },
      { label: 'Unchanged', value: diff.length - added - removed },
    ]));

    const rows = [];
    diff.forEach((row, index) => {
      if (state.onlyChanges && row.type === 'same') {
        const near = diff.slice(Math.max(0, index - 2), index + 3).some((item) => item.type !== 'same');
        if (!near) return;
      }
      const text = row.type === 'add'
        ? originalRight[row.right - 1]
        : originalLeft[row.left - 1] ?? row.text;
      rows.push(h('div.diff-line', { class: row.type === 'add' ? 'diff-add' : row.type === 'del' ? 'diff-del' : '' },
        h('span.ln', row.type === 'add' ? `+${row.right}` : row.type === 'del' ? `−${row.left}` : String(row.left)),
        h('span', text === '' ? ' ' : text)));
    });

    mount(result, rows.length ? rows : h('p.small.dim', 'The two texts are identical.'));
  }

  mount(root,
    controls(
      checkbox('Ignore trailing spaces', state.trim, (value) => {
        state.trim = value;
        ctx.save({ trim: value });
        run();
      }),
      checkbox('Ignore case', state.ignoreCase, (value) => {
        state.ignoreCase = value;
        ctx.save({ ignoreCase: value });
        run();
      }),
      checkbox('Only changed lines', state.onlyChanges, (value) => {
        state.onlyChanges = value;
        ctx.save({ onlyChanges: value });
        run();
      }),
      button('Swap sides', {
        iconName: 'swap',
        onclick: () => {
          [state.left, state.right] = [state.right, state.left];
          leftArea.value = state.left;
          rightArea.value = state.right;
          ctx.save({ left: state.left, right: state.right });
          run();
        },
      })
    ),
    split(panel('Original', {}, leftArea), panel('Changed', {}, rightArea)),
    summary,
    panel('Differences', { subtitle: 'Line by line' }, result)
  );

  run();
}
