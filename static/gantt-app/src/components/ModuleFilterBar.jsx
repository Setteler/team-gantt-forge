import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@forge/bridge';
import { C, T } from '../tokens';

/* ── ModuleFilterBar ──────────────────────────────────────────────────────────
 * Shared filter bar for Feature Status (custom field chip) and Resources
 * (team chip). Pass `mode="feature-status"` or `mode="resources"`.
 */
export default function ModuleFilterBar({
  mode,           // 'feature-status' | 'resources'
  teams = [],
  availableFields = [],
  issues = [],
  onTeamChange,       // (teamId | null) => void
  onFieldFilterChange, // ({ fieldId, fieldName, values }) => void
}) {
  const [teamFilter, setTeamFilter] = useState(null);
  const [fieldFilter, setFieldFilter] = useState(null); // { fieldId, fieldName, values[] }
  const [showTeamPicker, setShowTeamPicker] = useState(false);
  const [showFieldPicker, setShowFieldPicker] = useState(false);
  const teamRef = useRef(null);
  const fieldRef = useRef(null);

  // Load persisted filters on mount
  useEffect(() => {
    if (mode === 'resources') {
      invoke('getAppData', { key: 'resources.teamFilter' }).then(v => {
        if (v !== undefined && v !== null) { setTeamFilter(v); onTeamChange && onTeamChange(v); }
      }).catch(() => {});
    }
    if (mode === 'feature-status') {
      invoke('getAppData', { key: 'featureStatus.customFieldFilter' }).then(v => {
        if (v && Array.isArray(v.values) && v.values.length > 0) {
          setFieldFilter(v); onFieldFilterChange && onFieldFilterChange(v);
        }
      }).catch(() => {});
    }
  }, []); // eslint-disable-line

  // Close pickers on outside click
  useEffect(() => {
    function handle(e) {
      if (teamRef.current && !teamRef.current.contains(e.target)) setShowTeamPicker(false);
      if (fieldRef.current && !fieldRef.current.contains(e.target)) setShowFieldPicker(false);
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  const hasAnyFilter = teamFilter || (fieldFilter && fieldFilter.values?.length > 0);

  function clearAll() {
    setTeamFilter(null);
    setFieldFilter(null);
    onTeamChange && onTeamChange(null);
    onFieldFilterChange && onFieldFilterChange(null);
    invoke('saveAppData', { key: 'resources.teamFilter', value: null }).catch(() => {});
    invoke('saveAppData', { key: 'featureStatus.customFieldFilter', value: null }).catch(() => {});
  }

  function applyTeam(teamId) {
    setTeamFilter(teamId);
    setShowTeamPicker(false);
    onTeamChange && onTeamChange(teamId);
    invoke('saveAppData', { key: 'resources.teamFilter', value: teamId }).catch(() => {});
  }

  function applyFieldFilter(filter) {
    setFieldFilter(filter);
    setShowFieldPicker(false);
    onFieldFilterChange && onFieldFilterChange(filter);
    invoke('saveAppData', { key: 'featureStatus.customFieldFilter', value: filter }).catch(() => {});
  }

  const activeTeam = teams.find(t => t.id === teamFilter);
  const fieldChipLabel = fieldFilter && fieldFilter.values?.length > 0
    ? `${fieldFilter.fieldName}: ${fieldFilter.values[0]}${fieldFilter.values.length > 1 ? ` +${fieldFilter.values.length - 1}` : ''}`
    : null;

  return (
    <div style={S.bar}>
      <span style={S.filtersLabel}>FILTERS</span>

      {/* Team chip — Resources only */}
      {mode === 'resources' && (
        <div ref={teamRef} style={{ position: 'relative' }}>
          <button
            style={{ ...S.chip, ...(teamFilter ? S.chipActive : S.chipMuted) }}
            onClick={() => setShowTeamPicker(v => !v)}
          >
            Team: <strong style={{ marginLeft: 3 }}>{activeTeam ? activeTeam.name : 'All teams'}</strong>
          </button>
          {showTeamPicker && (
            <TeamPickerPopover teams={teams} current={teamFilter} onSelect={applyTeam} />
          )}
        </div>
      )}

      {/* Custom field chip — Feature Status only */}
      {mode === 'feature-status' && (
        <div ref={fieldRef} style={{ position: 'relative' }}>
          {fieldChipLabel ? (
            <button style={{ ...S.chip, ...S.chipActive }} onClick={() => setShowFieldPicker(v => !v)}>
              {fieldChipLabel}
            </button>
          ) : (
            <button style={{ ...S.chip, ...S.chipDashed }} onClick={() => setShowFieldPicker(v => !v)}>
              + Add field filter
            </button>
          )}
          {showFieldPicker && (
            <FieldPickerPopover
              availableFields={availableFields}
              issues={issues}
              current={fieldFilter}
              onApply={applyFieldFilter}
              onClose={() => setShowFieldPicker(false)}
            />
          )}
        </div>
      )}

      {hasAnyFilter && (
        <button style={S.clearAll} onClick={clearAll}>Clear all</button>
      )}
    </div>
  );
}

/* ── TeamPickerPopover ────────────────────────────────────────────────────── */

function TeamPickerPopover({ teams, current, onSelect }) {
  const [search, setSearch] = useState('');
  const opts = [{ id: null, name: 'All teams' }, ...teams];
  const filtered = opts.filter(t => t.name.toLowerCase().includes(search.toLowerCase()));
  return (
    <div style={P.popover}>
      <input autoFocus placeholder="Search teams…" value={search} onChange={e => setSearch(e.target.value)} style={P.search} />
      {filtered.map(t => (
        <div
          key={t.id || '__all__'}
          style={{ ...P.row, background: current === t.id ? C.primaryBg : 'transparent' }}
          onClick={() => onSelect(t.id)}
        >
          {t.name}
          {current === t.id && <span style={{ marginLeft: 'auto', color: C.primary }}>✓</span>}
        </div>
      ))}
    </div>
  );
}

/* ── FieldPickerPopover ───────────────────────────────────────────────────── */

function FieldPickerPopover({ availableFields, issues, current, onApply, onClose }) {
  const [selectedFieldId, setSelectedFieldId] = useState(current?.fieldId || null);
  const [search, setSearch] = useState('');
  const [selectedValues, setSelectedValues] = useState(current?.values || []);

  const selectedField = availableFields.find(f => f.id === selectedFieldId || f.key === selectedFieldId);

  // Compute values for selected field
  const fieldValues = React.useMemo(() => {
    if (!selectedFieldId) return [];
    const seen = new Set();
    for (const issue of issues) {
      const raw = issue.fields?.[selectedFieldId];
      if (!raw) continue;
      const vals = Array.isArray(raw) ? raw : [raw];
      for (const v of vals) {
        const str = typeof v === 'object' ? (v.name || v.value || v.displayName || String(v)) : String(v);
        if (str) seen.add(str);
      }
    }
    return Array.from(seen).sort();
  }, [selectedFieldId, issues]);

  const filteredValues = fieldValues.filter(v => v.toLowerCase().includes(search.toLowerCase()));

  function toggleValue(v) {
    setSelectedValues(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  }

  function handleApply() {
    if (!selectedField || selectedValues.length === 0) { onApply(null); return; }
    onApply({ fieldId: selectedFieldId, fieldName: selectedField.name || selectedField.key, values: selectedValues });
  }

  // Only show custom fields that have at least one value in the loaded issues
  const customFields = React.useMemo(() => {
    return availableFields.filter(f => {
      const fid = f.id || f.key || '';
      if (!fid.startsWith('customfield_')) return false;
      return issues.some(iss => {
        const raw = iss.fields?.[fid];
        if (!raw) return false;
        const vals = Array.isArray(raw) ? raw : [raw];
        return vals.some(v => {
          const str = typeof v === 'object' ? (v.name || v.value || v.displayName || '') : String(v);
          return str.length > 0;
        });
      });
    });
  }, [availableFields, issues]);

  return (
    <div style={{ ...P.popover, width: 420, padding: 0, display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left pane — field list */}
        <div style={FP.leftPane}>
          <div style={FP.paneLabel}>FIELDS</div>
          {customFields.map(f => (
            <div
              key={f.id || f.key}
              style={{ ...FP.fieldRow, background: selectedFieldId === (f.id || f.key) ? C.primaryBg : 'transparent' }}
              onClick={() => { setSelectedFieldId(f.id || f.key); setSearch(''); setSelectedValues([]); }}
            >
              {f.name || f.key}
            </div>
          ))}
        </div>
        {/* Right pane — value picker */}
        <div style={FP.rightPane}>
          {!selectedField ? (
            <div style={{ padding: 16, fontSize: 12, color: C.ink3 }}>Select a field on the left</div>
          ) : (
            <>
              <div style={FP.paneHeader}>Show where <strong>{selectedField.name || selectedField.key}</strong> is one of:</div>
              <input autoFocus placeholder="Search values…" value={search} onChange={e => setSearch(e.target.value)} style={FP.valueSearch} />
              <div style={FP.valueList}>
                {filteredValues.length === 0 && <div style={{ padding: '10px 12px', fontSize: 12, color: C.ink3 }}>No values found</div>}
                {filteredValues.map(v => (
                  <label key={v} style={{ ...FP.valueRow, background: selectedValues.includes(v) ? C.primaryBg : 'transparent' }}>
                    <input type="checkbox" checked={selectedValues.includes(v)} onChange={() => toggleValue(v)} style={{ accentColor: C.primary }} />
                    <span style={{ fontSize: 12, color: C.ink }}>{v}</span>
                  </label>
                ))}
              </div>
              <div style={FP.footer}>
                <span style={{ fontSize: 11, color: C.ink3 }}>{selectedValues.length} of {fieldValues.length} selected</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button style={FP.clearBtn} onClick={() => setSelectedValues([])}>Clear</button>
                  <button style={FP.applyBtn} onClick={handleApply}>Apply</button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────────────── */

const S = {
  bar: {
    display: 'flex', alignItems: 'center', gap: 8,
    height: 40, padding: '0 20px',
    background: C.bgMuted, borderBottom: `1px solid ${C.line}`,
    fontFamily: T.sans, flexShrink: 0,
  },
  filtersLabel: {
    fontSize: 11, fontWeight: 600, color: C.ink3, letterSpacing: 0.4,
    textTransform: 'uppercase', marginRight: 4,
  },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 3,
    padding: '3px 10px', borderRadius: 12, fontSize: 12,
    cursor: 'pointer', fontFamily: T.sans,
  },
  chipActive: {
    background: C.primaryBg, color: C.primary,
    border: `1px solid ${C.primary2}`, fontWeight: 500,
  },
  chipMuted: {
    background: '#fff', color: C.ink3,
    border: `1px solid ${C.line}`,
  },
  chipDashed: {
    background: 'transparent', color: C.ink3,
    border: `1.5px dashed ${C.line}`,
  },
  clearAll: {
    marginLeft: 'auto', background: 'none', border: 'none',
    fontSize: 12, color: C.ink3, cursor: 'pointer', textDecoration: 'underline',
    fontFamily: T.sans,
  },
};

const P = {
  popover: {
    position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 9999,
    background: '#fff', border: `1px solid ${C.line}`, borderRadius: 6,
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 180, padding: 4,
  },
  search: {
    display: 'block', width: '100%', boxSizing: 'border-box',
    padding: '6px 10px', border: 'none', borderBottom: `1px solid ${C.line2}`,
    fontSize: 12, outline: 'none', fontFamily: 'inherit',
  },
  row: {
    display: 'flex', alignItems: 'center', padding: '7px 10px',
    fontSize: 12, color: C.ink, cursor: 'pointer', borderRadius: 4,
  },
};

const FP = {
  leftPane: {
    width: 170, background: C.bgMuted, borderRight: `1px solid ${C.line2}`,
    overflowY: 'auto', maxHeight: 280,
  },
  paneLabel: {
    fontSize: 10, fontWeight: 700, color: C.ink4, letterSpacing: 0.5,
    padding: '8px 10px 4px', textTransform: 'uppercase',
  },
  fieldRow: {
    padding: '6px 10px', fontSize: 12, color: C.ink2, cursor: 'pointer',
    borderRadius: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  rightPane: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  paneHeader: { fontSize: 12, color: C.ink2, padding: '10px 12px 6px', lineHeight: 1.4 },
  valueSearch: {
    margin: '0 12px 6px', padding: '5px 8px', border: `1px solid ${C.line}`,
    borderRadius: 4, fontSize: 12, outline: 'none', fontFamily: 'inherit',
  },
  valueList: { flex: 1, overflowY: 'auto', maxHeight: 160 },
  valueRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '5px 12px', cursor: 'pointer',
  },
  footer: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '7px 12px', borderTop: `1px solid ${C.line2}`, background: C.bgMuted,
  },
  clearBtn: {
    background: 'none', border: `1px solid ${C.line}`, borderRadius: 4,
    padding: '3px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
  },
  applyBtn: {
    background: C.primary, color: '#fff', border: 'none', borderRadius: 4,
    padding: '3px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
    fontFamily: 'inherit',
  },
};
