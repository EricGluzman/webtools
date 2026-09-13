import { h, mount, panel, split, controls, field, input, select, codeLine, errorBox, table, stats } from '../kit.js';

const toInt = (ip) => ip.split('.').reduce((total, part) => (total << 8) + Number(part), 0) >>> 0;
const toIp = (value) => [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');

function parseCidr(text) {
  const [address, prefixText] = text.trim().split('/');
  const octets = address.split('.');
  if (octets.length !== 4 || octets.some((part) => part === '' || Number.isNaN(Number(part)) || Number(part) < 0 || Number(part) > 255)) {
    throw new Error('Enter an IPv4 address such as 192.168.1.10');
  }
  const prefix = prefixText === undefined ? 24 : Number(prefixText);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error('The prefix must be between /0 and /32');
  return { address: toInt(address), prefix };
}

function classOf(first) {
  if (first < 128) return 'A';
  if (first < 192) return 'B';
  if (first < 224) return 'C';
  if (first < 240) return 'D (multicast)';
  return 'E (reserved)';
}

function isPrivate(value) {
  return (value >>> 24) === 10          // 10.0.0.0/8
    || (value >>> 20) === 0xac1         // 172.16.0.0/12
    || (value >>> 16) === 0xc0a8        // 192.168.0.0/16
    || (value >>> 24) === 127;          // loopback
}

export default function (root, ctx) {
  const state = { cidr: ctx.state.cidr || '192.168.1.42/24', splitInto: ctx.state.splitInto || '26' };

  const results = h('div.stack-sm');
  const summary = h('div');
  const splits = h('div');
  const problem = h('div');

  const cidrInput = input({
    value: state.cidr,
    mono: true,
    placeholder: '10.0.0.1/22',
    oninput: (value) => {
      state.cidr = value;
      ctx.save({ cidr: value });
      run();
    },
  });

  function run() {
    mount(problem);
    let parsed;
    try {
      parsed = parseCidr(state.cidr);
    } catch (err) {
      mount(results);
      mount(summary);
      mount(splits);
      return mount(problem, errorBox(err.message));
    }

    const { address, prefix } = parsed;
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    const network = (address & mask) >>> 0;
    const broadcast = (network | (~mask >>> 0)) >>> 0;
    const hostCount = prefix >= 31 ? 2 ** (32 - prefix) : 2 ** (32 - prefix) - 2;
    const firstHost = prefix >= 31 ? network : network + 1;
    const lastHost = prefix >= 31 ? broadcast : broadcast - 1;

    mount(results,
      codeLine(`${toIp(network)}/${prefix}`, { label: 'Network' }),
      codeLine(toIp(mask), { label: 'Netmask' }),
      codeLine(toIp(~mask >>> 0), { label: 'Wildcard' }),
      codeLine(toIp(broadcast), { label: 'Broadcast' }),
      codeLine(`${toIp(firstHost)} – ${toIp(lastHost)}`, { label: 'Host range' }),
      codeLine(toIp(address), { label: 'Your address' })
    );

    mount(summary, stats([
      { label: 'Usable hosts', value: hostCount.toLocaleString() },
      { label: 'Addresses', value: (2 ** (32 - prefix)).toLocaleString() },
      { label: 'Class', value: classOf(network >>> 24) },
      { label: 'Scope', value: isPrivate(network) ? 'Private' : 'Public' },
    ]));

    const target = Number(state.splitInto);
    if (target > prefix && target <= 32) {
      const blocks = 2 ** (target - prefix);
      const step = 2 ** (32 - target);
      const rows = [];
      for (let i = 0; i < Math.min(blocks, 32); i += 1) {
        const start = (network + i * step) >>> 0;
        const end = (start + step - 1) >>> 0;
        rows.push([`${toIp(start)}/${target}`, toIp(start), toIp(end), (step > 2 ? step - 2 : step).toLocaleString()]);
      }
      mount(splits,
        table(['Subnet', 'First', 'Last', 'Hosts'], rows),
        blocks > 32 ? h('p.small.dim', { style: { marginTop: '8px' } }, `Showing 32 of ${blocks.toLocaleString()} blocks.`) : null);
    } else {
      mount(splits, h('p.small.dim', `Pick a prefix longer than /${prefix} to split this network.`));
    }
  }

  mount(root,
    panel('Network', {},
      controls(
        h('div.field.grow', h('span.label', 'Address / CIDR'), cidrInput),
        field('Split into', select(
          Array.from({ length: 33 }, (_, index) => ({ value: String(index), label: `/${index}` })).slice(1),
          state.splitInto,
          (value) => {
            state.splitInto = value;
            ctx.save({ splitInto: value });
            run();
          }
        ))),
      problem),
    summary,
    split(panel('Details', {}, results), panel('Subnets', {}, splits))
  );

  run();
}
