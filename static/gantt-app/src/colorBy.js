// Helpers for the "Color bars by field" feature.
// • getValueColor() returns the color for a given (field, value) pair, falling
//   back to a stable palette colour when the user hasn't picked one.
// • Status field gets known Atlassian palette by default so a user toggling
//   "Color by Status" sees something sensible immediately.

export const DEFAULT_BAR_COLOR = '#0073EA';
export const DEFAULT_BAR_BORDER = '#0052CC';

const PALETTE = [
  { bg: '#0073EA', border: '#0052CC' }, // blue
  { bg: '#00875A', border: '#006644' }, // green
  { bg: '#FF8B00', border: '#974F00' }, // orange
  { bg: '#5243AA', border: '#403294' }, // purple
  { bg: '#00B8D9', border: '#008DA6' }, // teal
  { bg: '#DE350B', border: '#BF2600' }, // red
  { bg: '#36B37E', border: '#006644' }, // emerald
  { bg: '#6554C0', border: '#5243AA' }, // violet
  { bg: '#FFAB00', border: '#974F00' }, // amber
  { bg: '#FF5630', border: '#BF2600' }, // coral
];

const STATUS_DEFAULTS = {
  'To Do':       { bg: '#97A0AF', border: '#42526E' },
  'Open':        { bg: '#97A0AF', border: '#42526E' },
  'Backlog':     { bg: '#97A0AF', border: '#42526E' },
  'In Progress': { bg: '#0073EA', border: '#0052CC' },
  'In Review':   { bg: '#5243AA', border: '#403294' },
  'Review':      { bg: '#5243AA', border: '#403294' },
  'Done':        { bg: '#36B37E', border: '#006644' },
  'Closed':      { bg: '#36B37E', border: '#006644' },
  'Resolved':    { bg: '#36B37E', border: '#006644' },
  'Canceled':    { bg: '#97A0AF', border: '#42526E' },
  'Blocked':     { bg: '#DE350B', border: '#BF2600' },
};

const PRIORITY_DEFAULTS = {
  'Highest': { bg: '#DE350B', border: '#BF2600' },
  'High':    { bg: '#FF5630', border: '#BF2600' },
  'Medium':  { bg: '#FF8B00', border: '#974F00' },
  'Low':     { bg: '#0073EA', border: '#0052CC' },
  'Lowest':  { bg: '#97A0AF', border: '#42526E' },
};

// Stable string → palette index hash so the same value always maps to the
// same palette colour without persistence.
function hashIndex(str, mod) {
  let h = 0;
  for (let i = 0; i < (str || '').length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return ((h % mod) + mod) % mod;
}

function shadeOf(hex, amount) {
  // Lighten/darken hex by `amount` (negative = darker). Returns hex.
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  let r = (n >> 16) & 0xff, g = (n >> 8) & 0xff, b = n & 0xff;
  const adj = (c) => Math.max(0, Math.min(255, c + amount));
  r = adj(r); g = adj(g); b = adj(b);
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

// Public: fetch the colour pair { bg, border } for a (fieldId, value) cell.
// `overrides` is the user-stored map keyed by fieldId then by value.
export function getValueColor(fieldId, value, overrides) {
  if (value == null || value === '') return null;
  const v = String(value);
  const userBg = overrides?.[fieldId]?.[v];
  if (userBg) return { bg: userBg, border: shadeOf(userBg, -30) };
  if (fieldId === 'status') {
    const known = STATUS_DEFAULTS[v];
    if (known) return known;
  }
  if (fieldId === 'priority') {
    const known = PRIORITY_DEFAULTS[v];
    if (known) return known;
  }
  return PALETTE[hashIndex(v, PALETTE.length)];
}

// Pull the comparable value for a Jira field on an issue (mirrors what we do
// for filter & sort — kept local to avoid pulling more cross-imports).
export function colorValueOf(fields, fieldId) {
  const v = fields?.[fieldId];
  if (v == null) return null;
  if (typeof v === 'string') return v || null;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    const f = v[0];
    if (f == null) return null;
    return typeof f === 'string' ? f : (f?.name || f?.value || f?.displayName || null);
  }
  return v.name || v.displayName || v.value || v.key || null;
}
