export const CATEGORIES = [
  { id: 'data', name: 'Data & Text', icon: 'braces' },
  { id: 'encode', name: 'Encoding & Security', icon: 'shield' },
  { id: 'web', name: 'Time & Web', icon: 'globe' },
  { id: 'design', name: 'Design & Media', icon: 'palette' },
];

export const TOOLS = [
  // --- Data & Text -------------------------------------------------
  { id: 'json', name: 'JSON Studio', cat: 'data', icon: 'braces',
    desc: 'Format, validate, minify and browse JSON as a tree.',
    keywords: ['json', 'pretty print', 'validate', 'minify', 'tree', 'escape'] },
  { id: 'regex', name: 'Regex Tester', cat: 'data', icon: 'regex',
    desc: 'Live matches, capture groups and replace preview.',
    keywords: ['regex', 'regexp', 'pattern', 'match', 'replace'] },
  { id: 'diff', name: 'Text Diff', cat: 'data', icon: 'diff',
    desc: 'Compare two blocks of text line by line.',
    keywords: ['diff', 'compare', 'changes', 'merge'] },
  { id: 'text', name: 'Text Transformer', cat: 'data', icon: 'type',
    desc: 'Case conversion, sorting, dedupe, slugs and cleanup.',
    keywords: ['case', 'camel', 'snake', 'kebab', 'slug', 'sort', 'dedupe', 'trim'] },
  { id: 'csv', name: 'CSV ⇄ JSON', cat: 'data', icon: 'grid',
    desc: 'Convert between CSV and JSON with a table preview.',
    keywords: ['csv', 'tsv', 'json', 'table', 'convert', 'spreadsheet'] },
  { id: 'markdown', name: 'Markdown Preview', cat: 'data', icon: 'book',
    desc: 'Write Markdown, see it rendered, copy the HTML.',
    keywords: ['markdown', 'md', 'preview', 'html', 'readme'] },
  { id: 'stats', name: 'Text Inspector', cat: 'data', icon: 'text',
    desc: 'Counts, reading time and word frequency.',
    keywords: ['word count', 'characters', 'lines', 'reading time', 'frequency'] },
  { id: 'lorem', name: 'Sample Data', cat: 'data', icon: 'dice',
    desc: 'Lorem ipsum plus names, emails, dates and numbers.',
    keywords: ['lorem', 'ipsum', 'placeholder', 'mock', 'fake', 'sample'] },

  // --- Encoding & Security ----------------------------------------
  { id: 'base64', name: 'Base64', cat: 'encode', icon: 'code',
    desc: 'Encode and decode text or files, including data URLs.',
    keywords: ['base64', 'encode', 'decode', 'data url', 'binary'] },
  { id: 'url', name: 'URL Toolkit', cat: 'encode', icon: 'link',
    desc: 'Encode, decode and pick apart query strings.',
    keywords: ['url', 'uri', 'encode', 'decode', 'query', 'params'] },
  { id: 'jwt', name: 'JWT Decoder', cat: 'encode', icon: 'key',
    desc: 'Inspect header, payload and expiry of a token.',
    keywords: ['jwt', 'token', 'auth', 'bearer', 'claims'] },
  { id: 'hash', name: 'Hash & HMAC', cat: 'encode', icon: 'hash',
    desc: 'SHA-1/256/384/512 for text and files, plus HMAC.',
    keywords: ['hash', 'sha', 'checksum', 'hmac', 'digest', 'sha256'] },
  { id: 'uuid', name: 'ID Generator', cat: 'encode', icon: 'sparkles',
    desc: 'UUID v4, short IDs and sortable timestamp IDs.',
    keywords: ['uuid', 'guid', 'nanoid', 'ulid', 'random id'] },
  { id: 'password', name: 'Password Maker', cat: 'encode', icon: 'shield',
    desc: 'Strong passwords and passphrases with a strength read.',
    keywords: ['password', 'passphrase', 'random', 'secure', 'entropy'] },
  { id: 'html', name: 'HTML Entities', cat: 'encode', icon: 'code',
    desc: 'Escape and unescape HTML, strip tags.',
    keywords: ['html', 'entities', 'escape', 'unescape', 'strip tags'] },
  { id: 'numbase', name: 'Number Base', cat: 'encode', icon: 'hash',
    desc: 'Binary, octal, decimal, hex and any base to 36.',
    keywords: ['binary', 'hex', 'octal', 'decimal', 'base', 'convert'] },

  // --- Time & Web --------------------------------------------------
  { id: 'time', name: 'Time Converter', cat: 'web', icon: 'clock',
    desc: 'Unix timestamps, ISO dates and time zones.',
    keywords: ['timestamp', 'unix', 'epoch', 'iso', 'timezone', 'date'] },
  { id: 'cron', name: 'Cron Explainer', cat: 'web', icon: 'calendar',
    desc: 'Read a cron expression in plain English with next runs.',
    keywords: ['cron', 'crontab', 'schedule', 'job'] },
  { id: 'qr', name: 'QR Generator', cat: 'web', icon: 'qr',
    desc: 'Make a QR code for a link, Wi-Fi network or text.',
    keywords: ['qr', 'code', 'barcode', 'wifi', 'link'] },
  { id: 'subnet', name: 'Subnet Calculator', cat: 'web', icon: 'server',
    desc: 'CIDR ranges, masks, host counts and splits.',
    keywords: ['ip', 'cidr', 'subnet', 'netmask', 'network'] },
  { id: 'http', name: 'HTTP Reference', cat: 'web', icon: 'globe',
    desc: 'Status codes, methods and common headers.',
    keywords: ['http', 'status', 'code', '404', 'headers', 'rest'] },

  // --- Design & Media ----------------------------------------------
  { id: 'color', name: 'Color Studio', cat: 'design', icon: 'palette',
    desc: 'Convert, build palettes and check contrast.',
    keywords: ['color', 'hex', 'rgb', 'hsl', 'palette', 'contrast', 'wcag'] },
  { id: 'gradient', name: 'Gradient Maker', cat: 'design', icon: 'sliders',
    desc: 'Build CSS gradients with live preview.',
    keywords: ['gradient', 'css', 'linear', 'radial', 'background'] },
  { id: 'glass', name: 'Glass CSS', cat: 'design', icon: 'bolt',
    desc: 'Dial in frosted-glass panels and copy the CSS.',
    keywords: ['glass', 'glassmorphism', 'blur', 'backdrop', 'css'] },
  { id: 'image', name: 'Image Workshop', cat: 'design', icon: 'image',
    desc: 'Resize, convert and compress images in the browser.',
    keywords: ['image', 'resize', 'convert', 'webp', 'jpeg', 'compress'] },
  { id: 'units', name: 'Unit Converter', cat: 'design', icon: 'ruler',
    desc: 'Length, weight, temperature, data, speed and more.',
    keywords: ['unit', 'convert', 'metric', 'imperial', 'temperature', 'bytes'] },
];

export const toolsById = new Map(TOOLS.map((tool) => [tool.id, tool]));

export function categoryOf(id) {
  return CATEGORIES.find((category) => category.id === id);
}

const cache = new Map();

/** Tools are loaded on demand: the first paint stays small. */
export async function loadTool(id) {
  if (!toolsById.has(id)) throw new Error(`Unknown tool: ${id}`);
  if (!cache.has(id)) cache.set(id, import(`./impl/${id}.js`));
  return cache.get(id);
}

export function searchTools(query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return TOOLS;
  const terms = needle.split(/\s+/);
  return TOOLS.map((tool) => {
    const haystack = `${tool.name} ${tool.desc} ${tool.keywords.join(' ')}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (tool.name.toLowerCase().startsWith(term)) score += 6;
      else if (tool.name.toLowerCase().includes(term)) score += 4;
      else if (tool.keywords.some((word) => word.startsWith(term))) score += 3;
      else if (haystack.includes(term)) score += 1;
      else return { tool, score: -1 };
    }
    return { tool, score };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.tool);
}
