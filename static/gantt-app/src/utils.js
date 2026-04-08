export function getFieldValue(fields, key) {
  const v = fields?.[key];
  if (v == null) return null;
  if (typeof v === 'string') return v || null;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    if (!v.length) return null;
    const f = v[0];
    return typeof f === 'string' ? f : (f?.displayName || f?.name || f?.value || null);
  }
  return v.displayName || v.name || v.value || v.key || null;
}
