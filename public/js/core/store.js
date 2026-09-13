const KEY = 'workbench:prefs';

const defaults = {
  theme: 'dark',
  favorites: [],
  recentTools: [],
  notesView: 'board',
  docsView: 'grid',
  toolState: {},
};

function read() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...defaults };
  }
}

let prefs = read();

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* private mode: preferences just do not stick */
  }
}

export const store = {
  get(key) {
    return prefs[key];
  },
  set(key, value) {
    prefs[key] = value;
    persist();
    return value;
  },
  toggleFavorite(id) {
    const favorites = new Set(prefs.favorites);
    favorites.has(id) ? favorites.delete(id) : favorites.add(id);
    return this.set('favorites', [...favorites]);
  },
  isFavorite(id) {
    return prefs.favorites.includes(id);
  },
  pushRecent(id) {
    const recent = [id, ...prefs.recentTools.filter((item) => item !== id)].slice(0, 8);
    return this.set('recentTools', recent);
  },
  /** Per-tool scratch state so inputs survive navigation. */
  toolState(id, patch) {
    const all = { ...prefs.toolState };
    if (patch === undefined) return all[id] || {};
    all[id] = { ...(all[id] || {}), ...patch };
    return this.set('toolState', all)[id];
  },
};

export function applyTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'light' ? '#eceff6' : '#07080c');
  store.set('theme', next);
  return next;
}
