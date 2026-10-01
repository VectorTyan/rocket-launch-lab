/** Existing mission display format; fractional seconds are deliberately omitted. */
export function formatTime(time) {
  const seconds = Math.floor(Math.abs(time));
  const minutes = String(Math.floor(seconds / 60)).padStart(2, '0');
  const remainder = String(seconds % 60).padStart(2, '0');
  return `T${time < 0 ? '−' : '+'}${minutes}:${remainder}`;
}

export function coordinate(value, positive, negative) {
  return `${Math.abs(value).toFixed(2)}°${value >= 0 ? positive : negative}`;
}

/** Escape both text nodes and quoted attributes in data-driven templates. */
export function escapeHtml(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value ?? '').replace(/[&<>"']/g, (character) => entities[character]);
}
