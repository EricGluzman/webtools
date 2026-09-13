/** Stroke icons, 24x24 grid. Keys are referenced by name across the app. */
const PATHS = {
  home: 'M3 10.6 12 3l9 7.6M5.5 9.5V20a1 1 0 0 0 1 1H9.5v-5.5h5V21h3a1 1 0 0 0 1-1V9.5',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  note: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8l6-6V5a2 2 0 0 0-2-2zM14 21v-4a2 2 0 0 1 2-2h4',
  folder: 'M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17.5z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  x: 'M18 6 6 18M6 6l12 12',
  check: 'M20 6 9 17l-5-5',
  copy: 'M9 9h10v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1',
  download: 'M12 3v12M7 11l5 5 5-5M4 20h16',
  upload: 'M12 20V8M7 12l5-5 5 5M4 4h16',
  trash: 'M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6',
  star: 'M12 3.6l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.8l5.9-.9z',
  pin: 'M15 3l6 6-3 1-3.5 3.5L14 18l-1.5 1.5L9 16l-4.5 4.5L4 21l.5-.5L9 16l-3.5-3.5L7 11l4.5-.5L15 7z',
  sun: 'M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM12 1.5v2M12 20.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1.5 12h2M20.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  chevronRight: 'M9 6l6 6-6 6',
  chevronDown: 'M6 9l6 6 6-6',
  arrowLeft: 'M19 12H5M11 18l-6-6 6-6',
  refresh: 'M20 11a8 8 0 1 0-.6 4M20 5v6h-6',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1v.3a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.8-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.5 15a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 4.5a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7 2 2 0 1 1 0 4z',
  code: 'M8 6l-5 6 5 6M16 6l5 6-5 6',
  braces: 'M8 3H7a2 2 0 0 0-2 2v4a2 2 0 0 1-2 2 2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h1M16 3h1a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2 2 2 0 0 0-2 2v4a2 2 0 0 1-2 2h-1',
  regex: 'M12 3v10M7.5 5.5l9 5M16.5 5.5l-9 5M5 19.5h3',
  link: 'M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7l-1.6 1.6M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 1 0 5.7 5.7l1.6-1.6',
  key: 'M14.5 10.5a4.5 4.5 0 1 0-4.2 4.5L9 16.3l1.5 1.5L9 19.3l1.5 1.5 2-2 1.5-1.5-1.3-1.3a4.5 4.5 0 0 0 1.8-5.5zM16.5 6.5h.01',
  hash: 'M5 9h14M5 15h14M10 4l-2 16M16 4l-2 16',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
  calendar: 'M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5zM4 10h16M9 3v4M15 3v4',
  palette: 'M12 21a9 9 0 1 1 0-18c4.9 0 9 3.4 9 7.5 0 2.5-2 4.5-4.5 4.5H15a2 2 0 0 0-1.4 3.4A1.9 1.9 0 0 1 12 21zM7.5 12h.01M9.5 8h.01M14.5 7.5h.01',
  image: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM4 16l4.5-4.5 5 5M13 14l2.5-2.5L20 16',
  type: 'M5 6V4h14v2M12 4v16M9 20h6',
  scan: 'M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16M4 12h16',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
  shield: 'M12 3l7.5 3v5.5c0 4.4-3 8.3-7.5 9.5-4.5-1.2-7.5-5.1-7.5-9.5V6z',
  server: 'M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v3A1.5 1.5 0 0 1 18.5 10h-13A1.5 1.5 0 0 1 4 8.5zM4 15.5A1.5 1.5 0 0 1 5.5 14h13a1.5 1.5 0 0 1 1.5 1.5v3a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM7.5 7h.01M7.5 17h.01',
  sliders: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4v6M7 14v6',
  ruler: 'M3.5 14.5 14.5 3.5a1.4 1.4 0 0 1 2 0l3.9 4a1.4 1.4 0 0 1 0 2L9.5 20.5a1.4 1.4 0 0 1-2 0l-4-4a1.4 1.4 0 0 1 0-2zM7 11l2 2M10.5 7.5l2 2M14 4l2 2',
  dice: 'M4 7.5 12 3l8 4.5v9L12 21l-8-4.5zM12 3v18M4 7.5l8 4.5 8-4.5',
  diff: 'M6 3v12M6 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 21V9M18 7a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM18 9a4 4 0 0 0-4-4h-3',
  text: 'M4 6h16M4 11h11M4 16h16M4 21h8',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 9h17M3.5 15h17M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z',
  bolt: 'M13 3 5 13.5h6L11 21l8-10.5h-6z',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8h.01',
  logout: 'M15 17l5-5-5-5M20 12H9M12 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h6',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  file: 'M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9zM13 3v6h6',
  receipt: 'M5 3.5 7 5l2-1.5L11 5l2-1.5L15 5l2-1.5v16L17 18l-2 1.5L13 18l-2 1.5L9 18l-2 1.5L5 18zM8.5 9h7M8.5 13h5',
  filter: 'M4 5h16l-6 7.5V20l-4-2.5v-5z',
  sparkles: 'M12 3l1.8 4.7L18.5 9.5 13.8 11.3 12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM18.5 15l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z',
  swap: 'M7 4v13M4 14l3 3 3-3M17 20V7M14 10l3-3 3 3',
  save: 'M5 5.5A1.5 1.5 0 0 1 6.5 4h9L20 8.5v10a1.5 1.5 0 0 1-1.5 1.5h-12A1.5 1.5 0 0 1 5 18.5zM9 4v5h6M8 14h8v6H8z',
  edit: 'M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17v3zM14.5 6.5l3 3',
  external: 'M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
};

export function icon(name, { size = 18, stroke = 1.7, className = '' } = {}) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', stroke);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (className) svg.setAttribute('class', className);

  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', PATHS[name] || PATHS.grid);
  svg.append(path);
  return svg;
}

export const iconNames = Object.keys(PATHS);
