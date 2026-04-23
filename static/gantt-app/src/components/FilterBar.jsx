import React, { useState, useRef, useEffect, useMemo } from 'react';

// Helpers duplicated here to avoid an App -> FilterBar -> App circular import.
// Pulls displayable values out of a Jira issue field. Arrays produce multiple
// entries (labels, components, fix versions, etc.).
function getFieldValuesForFilter(fields, key) {
  const v = fields?.[key];
  if (v == null) return [];
  if (typeof v === 'string') return v ? [v] : [];
  if (typeof v === 'number' || typeof v === 'boolean') return [String(v)];
  if (Array.isArray(v)) {
    return v.map(x => (typeof x === 'string' ? x : (x?.name || x?.value || x?.displayName || null))).filter(Boolean);
  }
  return [v.displayName || v.name || v.value || v.key].filter(Boolean);
}

export default function FilterBar({
  filterFields,           // fieldIds that are active as chips
  filterValues,           // { fieldId: [selectedValue, ...] }
  onFilterValuesChange,   // (nextValues) => void
  issues,                 // current loaded issues (unfiltered) for value aggregation
  availableFields,
}) {
  if (!filterFields || filterFields.length === 0) return null;

  return (
    <div style={styles.bar}>
      <span style={styles.label}>Filters</span>
      {filterFields.map(fid => (
        <FilterChip
          key={fid}
          fieldId={fid}
          fieldName={(availableFields || []).find(f => f.id === fid)?.name || fid}
          selected={filterValues?.[fid] || []}
          issues={issues}
          onChange={(nextSelected) => {
            const next = { ...(filterValues || {}) };
            if (nextSelected.length === 0) delete next[fid];
            else next[fid] = nextSelected;
            onFilterValuesChange(next);
          }}
        />
      ))}
    </div>
  );
}

function FilterChip({ fieldId, fieldName, selected, issues, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const btnRef = useRef(null);
  const popRef = useRef(null);

  // Aggregate all distinct values for this field across the loaded issues.
  // This is the value picker — no extra API call, just what's in memory.
  const options = useMemo(() => {
    const counts = new Map();
    for (const iss of issues || []) {
      for (const v of getFieldValuesForFilter(iss.fields, fieldId)) {
        counts.set(v, (counts.get(v) || 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, count]) => ({ value, count }));
  }, [issues, fieldId]);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function onDown(e) {
      if (popRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hasValue = selected.length > 0;
  const filtered = search
    ? options.filter(o => o.value.toLowerCase().includes(search.toLowerCase()))
    : options;

  function toggleValue(v) {
    const next = selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v];
    onChange(next);
  }

  function clearAll(e) {
    e.stopPropagation();
    onChange([]);
  }

  const chipStyle = hasValue ? { ...styles.chip, ...styles.chipActive } : styles.chip;

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={btnRef}
        style={chipStyle}
        onClick={() => setOpen(v => !v)}
      >
        <span style={styles.chipKey}>{fieldName}{hasValue ? ':' : ''}</span>
        {hasValue && (
          <span style={styles.chipVals}>
            {selected.length <= 2 ? selected.join(', ') : `${selected.length} selected`}
          </span>
        )}
        {hasValue ? (
          <span style={styles.chipX} onClick={clearAll} title="Clear filter">×</span>
        ) : (
          <span style={styles.chipX}>▾</span>
        )}
      </button>

      {open && (
        <div ref={popRef} style={styles.pop}>
          <div style={styles.popH}>
            <span style={styles.popT}>{fieldName}</span>
            {hasValue && (
              <button style={styles.clearBtn} onClick={clearAll}>Clear</button>
            )}
          </div>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={`Search ${fieldName.toLowerCase()}…`}
            style={styles.search}
          />
          <div style={styles.list}>
            {filtered.length === 0 ? (
              <div style={styles.empty}>No values</div>
            ) : (
              filtered.map(({ value, count }) => (
                <label key={value} style={styles.row}>
                  <input
                    type="checkbox"
                    checked={selected.includes(value)}
                    onChange={() => toggleValue(value)}
                    style={{ accentColor: '#0052CC', cursor: 'pointer' }}
                  />
                  <span style={styles.rowText}>{value}</span>
                  <span style={styles.rowCount}>{count}</span>
                </label>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  bar: {
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    padding: '8px 16px', background: '#FAFBFC',
    borderBottom: '1px solid #EBECF0',
  },
  label: {
    fontSize: 11, fontWeight: 700, color: '#6B778C',
    textTransform: 'uppercase', letterSpacing: '0.4px', marginRight: 2,
  },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '4px 10px', border: '1px solid #DFE1E6', background: '#fff',
    borderRadius: 14, fontSize: 12, cursor: 'pointer', color: '#253858',
    fontFamily: 'inherit',
  },
  chipActive: {
    background: '#DEEBFF', borderColor: '#B3D4FF', color: '#0052CC', fontWeight: 500,
  },
  chipKey: { fontWeight: 500 },
  chipVals: { fontWeight: 600 },
  chipX: { color: '#97A0AF', fontSize: 14, lineHeight: 1, padding: '0 1px' },

  pop: {
    position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 500,
    width: 280, background: '#fff',
    border: '1px solid #DFE1E6', borderRadius: 8,
    boxShadow: '0 8px 24px rgba(9,30,66,0.16)',
    overflow: 'hidden',
  },
  popH: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 12px 6px', borderBottom: '1px solid #EBECF0',
  },
  popT: { fontSize: 12, fontWeight: 700, color: '#172B4D' },
  clearBtn: {
    background: 'none', border: 'none', color: '#0052CC', fontSize: 11,
    fontWeight: 600, cursor: 'pointer', padding: 0,
  },
  search: {
    width: 'calc(100% - 20px)', margin: '8px 10px 6px',
    border: '1px solid #DFE1E6', borderRadius: 5,
    padding: '6px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  list: { maxHeight: 280, overflowY: 'auto' },
  row: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 12px', cursor: 'pointer', fontSize: 12,
  },
  rowText: { flex: 1, color: '#172B4D', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowCount: { color: '#97A0AF', fontSize: 11 },
  empty: { padding: '12px', color: '#97A0AF', fontSize: 12, textAlign: 'center' },
};
