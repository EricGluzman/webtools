const routes = [];
let notFound = null;
let current = null;

/** Register '#/tools/:id' style patterns. */
export function route(pattern, handler) {
  const keys = [];
  const regex = new RegExp(
    `^${pattern.replace(/:[a-z]+/gi, (match) => {
      keys.push(match.slice(1));
      return '([^/]+)';
    })}/?$`,
    'i'
  );
  routes.push({ regex, keys, handler });
}

export function setNotFound(handler) {
  notFound = handler;
}

export function navigate(path, { replace = false } = {}) {
  const hash = path.startsWith('#') ? path : `#${path}`;
  if (location.hash === hash) return resolve();
  if (replace) history.replaceState(null, '', hash);
  else location.hash = hash;
}

export function currentPath() {
  return location.hash.replace(/^#/, '') || '/';
}

export function resolve() {
  const path = currentPath();
  const [pathname, queryString = ''] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryString));

  for (const { regex, keys, handler } of routes) {
    const match = pathname.match(regex);
    if (!match) continue;
    const params = Object.fromEntries(keys.map((key, index) => [key, decodeURIComponent(match[index + 1])]));
    current = { path: pathname, params, query };
    handler({ params, query, path: pathname });
    return;
  }
  if (notFound) notFound({ path: pathname, params: {}, query });
}

export function start() {
  window.addEventListener('hashchange', resolve);
  resolve();
}

export function getCurrent() {
  return current;
}
