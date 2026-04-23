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

// Default scope: filter applies to every issue type, ancestors of matches
// stay visible (so filtering by a Story-level field keeps Epics in view).
function defaultScope() {
  return { types: null, ancestorMode: 'keep' };
}

// Is the scope non-default? (shown as a dot on the chip)
function isScopeCustomized(scope) {
  if (!scope) return false;
  if (Array.isArray(scope.types) && scope.types.length > 0) return true;
  if (scope.ancestorMode && scope.ancestorMode !== 'keep') return true;
  return false;
}

export default function FilterBar({
  filterFields,           // fieldIds that are active as chips
  filterValues,           // { fieldId: [selectedValue, ...] }
  onFilterValuesChange,
  filterScopes,           // { fieldId: { types, ancestorMode } }
  onFilterScopesChange,
  issues,                 // current loaded issues (unfiltered) for value aggregation
  availableFields,
  availableIssueTypes,    // issue types present in the loaded set
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
          scope={(filterScopes || {})[fid] || defaultScope()}
          issues={issues}
          availableIssueTypes={availableIssueTypes || []}
          onValuesChange={(nextSelected) => {
            const next = { ...(filterValues || {}) };
            if (nextSelected.length === 0) delete next[fid];
            else next[fid] = nextSelected;
            onFilterValuesChange(next);
          }}
          onScopeChange={(nextScope) => {
            const next = { ...(filterScopes || {}) };
            // Store scope only when it differs from default, keeps saved views small
            if (isScopeCustomized(nextScope)) next[fid] = nextScope;
            else delete next[fid];
            onFilterScopesChange(next);
          }}
        />
      ))}
    </div>
  );
}

function FilterChip({ fieldId, fieldName, selected, scope, issues, availableIssueTypes, onValuesChange, onScopeChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const btnRef = useRef(null);
  const popRef = useRef(null);

  // Aggregate distinct values from loaded issues (no extra API call).
  // Sort numerically when every value parses as a number (story points,
  // estimates, etc.), otherwise alphabetically.
  const options = useMemo(() => {
    const counts = new Map();
    for (const iss of issues || []) {
      for (const v of getFieldValuesForFilter(iss.fields, fieldId)) {
        counts.set(v, (counts.get(v) || 0) + 1);
      }
    }
    const entries = Array.from(counts.entries());
    const allNumeric = entries.length > 0 && entries.every(([v]) => v !== '' && !Number.isNaN(Number(v)));
    entries.sort(allNumeric
      ? (a, b) => Number(a[0]) - Number(b[0])
      : (a, b) => a[0].localeCompare(b[0])
    );
    return entries.map(([value, count]) => ({ value, count }));
  }, [issues, fieldId]);

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
    onValuesChange(next);
  }

  function clearAll(e) {
    if (e) e.stopPropagation();
    onValuesChange([]);
  }

  function toggleType(t) {
    const cur = Array.isArray(scope.types) ? scope.types : [];
    const next = cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t];
    // If user clears all checkboxes, treat as null = all types
    onScopeChange({ ...scope, types: next.length === 0 ? null : next });
  }

  function setAncestorMode(mode) {
    onScopeChange({ ...scope, ancestorMode: mode });
  }

  const scopeCustom = isScopeCustomized(scope);
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
        {scopeCustom && (
          <span style={styles.scopeDot} title="Scope is customized" />
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
            {hasValue && <button style={styles.clearBtn} onClick={clearAll}>Clear</button>}
          </div>

          {/* Values */}
          <div style={styles.sectionTitle}>Values</div>
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

          {/* Apply to — issue types in scope */}
          {availableIssueTypes.length > 0 && (
            <>
              <div style={styles.divider} />
              <div style={styles.sectionTitle}>
                Apply to <span style={styles.hint}>— issue types</span>
              </div>
              <div style={styles.scopeBlock}>
                {availableIssueTypes.map(t => {
                  const all = !Array.isArray(scope.types) || scope.types.length === 0;
                  const checked = all || scope.types.includes(t);
                  return (
                    <label key={t} style={styles.scopeRow}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          // If "all" was implicit, switching means we materialize the list
                          if (all) {
                            const without = availableIssueTypes.filter(x => x !== t);
                            onScopeChange({ ...scope, types: without });
                          } else {
                            toggleType(t);
                          }
                        }}
                        style={{ accentColor: '#0052CC', cursor: 'pointer' }}
                      />
                      <span style={styles.typeTag}>{t}</span>
                    </label>
                  );
                })}
                <div style={styles.scopeHint}>
                  {!Array.isArray(scope.types) || scope.types.length === 0
                    ? 'Filter applies to every issue type.'
                    : `Filter applies only to: ${scope.types.join(', ')}. Other types pass through.`}
                </div>
              </div>
            </>
          )}

          {/* Ancestors behavior */}
          <div style={styles.divider} />
          <div style={styles.sectionTitle}>Ancestors</div>
          <div style={styles.radioBlock}>
            <label style={{ ...styles.radioRow, ...(scope.ancestorMode !== 'hide' ? styles.radioRowActive : {}) }}>
              <input
                type="radio"
                name={`anc-${fieldId}`}
                checked={scope.ancestorMode !== 'hide'}
                onChange={() => setAncestorMode('keep')}
                style={{ accentColor: '#0052CC', marginTop: 2, cursor: 'pointer' }}
              />
              <span>
                <span style={styles.radioT}>Keep visible</span>
                <div style={styles.radioD}>Parents of matched rows stay visible even if they don't match.</div>
              </span>
            </label>
            <label style={{ ...styles.radioRow, ...(scope.ancestorMode === 'hide' ? styles.radioRowActive : {}) }}>
              <input
                type="radio"
                name={`anc-${fieldId}`}
                checked={scope.ancestorMode === 'hide'}
                onChange={() => setAncestorMode('hide')}
                style={{ accentColor: '#0052CC', marginTop: 2, cursor: 'pointer' }}
              />
              <span>
                <span style={styles.radioT}>Hide if unmatched</span>
                <div style={styles.radioD}>Only show rows that directly match the filter.</div>
              </span>
            </label>
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
  scopeDot: {
    display: 'inline-block', width: 6, height: 6, borderRadius: '50%',
    background: '#00875A', marginLeft: 2,
  },

  pop: {
    position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 500,
    width: 320, background: '#fff',
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

  sectionTitle: {
    fontSize: 10, fontWeight: 700, color: '#6B778C',
    textTransform: 'uppercase', letterSpacing: '0.4px',
    padding: '10px 12px 4px',
  },
  hint: {
    fontWeight: 400, color: '#97A0AF', textTransform: 'none', letterSpacing: 0,
  },

  search: {
    width: 'calc(100% - 20px)', margin: '0 10px 6px',
    border: '1px solid #DFE1E6', borderRadius: 5,
    padding: '6px 10px', fontSize: 12, outline: 'none', boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  list: { maxHeight: 220, overflowY: 'auto' },
  row: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 12px', cursor: 'pointer', fontSize: 12,
  },
  rowText: { flex: 1, color: '#172B4D', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  rowCount: { color: '#97A0AF', fontSize: 11 },
  empty: { padding: '12px', color: '#97A0AF', fontSize: 12, textAlign: 'center' },

  divider: { height: 1, background: '#EBECF0', margin: '6px 0 0' },

  scopeBlock: { padding: '0 12px 8px' },
  scopeRow: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', cursor: 'pointer', fontSize: 12,
  },
  scopeHint: {
    fontSize: 11, color: '#97A0AF', fontStyle: 'italic',
    marginTop: 4, lineHeight: 1.4,
  },
  typeTag: {
    display: 'inline-block', fontSize: 11, fontWeight: 600, padding: '1px 6px',
    borderRadius: 3, background: '#EAE6FF', color: '#5243AA', textTransform: 'uppercase',
    letterSpacing: 0.3,
  },

  radioBlock: { padding: '4px 8px 10px', display: 'flex', flexDirection: 'column', gap: 4 },
  radioRow: {
    display: 'flex', alignItems: 'flex-start', gap: 8,
    padding: '6px 8px', fontSize: 12, cursor: 'pointer',
    border: '1px solid transparent', borderRadius: 5,
  },
  radioRowActive: {
    background: '#DEEBFF', borderColor: '#B3D4FF',
  },
  radioT: { fontWeight: 600, color: '#172B4D' },
  radioD: { color: '#6B778C', fontSize: 11, marginTop: 2, lineHeight: 1.4 },
};
