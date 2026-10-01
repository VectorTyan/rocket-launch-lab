/** Inline SVGs contain no shared IDs, so repeated controls stay valid HTML. */
export const ICONS = Object.freeze({
  rocket: '<path d="m12 3 5 11-5-2-5 2 5-11Z"/><path d="m8 15-2 4m6-4v6m4-6 2 4"/>',
  launch: '<path d="m12 19 0-14m-6 6 6-6 6 6"/>',
  layers: '<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  orbit:
    '<ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-35 12 12)"/><circle cx="12" cy="12" r="3"/>',
  camera:
    '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="m8 6 2-3h4l2 3"/><circle cx="12" cy="13" r="4"/>',
  target: '<circle cx="12" cy="12" r="7"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  engine: '<path d="M9 3h6l1 8 4 8H4l4-8 1-8Zm0 19v-3m6 3v-3"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18M5 6h14M5 18h14"/>',
  reset: '<path d="M3 9a9 9 0 1 1 1 9M3 3v6h6"/>',
  play: '<path d="m8 4 12 8-12 8V4Z"/>',
  pause: '<path d="M8 4v16M16 4v16"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-11v2"/>',
  volume: '<path d="m11 4-5 5H3v6h3l5 5V4Zm4 4a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4 10-10"/>',
  build: '<path d="m4 8 8-5 8 5-8 5-8-5Zm0 0v9l8 5 8-5V8M12 13v9"/>',
  star: '<path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z"/>',
});

export function icon(name) {
  const content = Object.hasOwn(ICONS, name) ? ICONS[name] : ICONS.target;
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${content}</svg>`;
}
