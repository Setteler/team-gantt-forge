import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import JqlInput from './JqlInput';
import { C, T } from '../tokens';
import { getValueColor, colorValueOf } from '../colorBy';

const ORDER_BY_OPTIONS = [
  { value: 'duedate',           label: 'Due Date' },
  { value: 'customfield_10015', label: 'Start Date' },
  { value: 'assignee',          label: 'Assignee' },
  { value: 'priority',          label: 'Priority' },
  { value: 'status',            label: 'Status' },
  { value: 'created',           label: 'Created' },
  { value: 'updated',           label: 'Updated' },
  { value: 'summary',           label: 'Summary' },
];

const DEFAULT_START_FIELD = 'customfield_10015';
const DEFAULT_END_FIELD   = 'duedate';
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Every field type can be a filter — the value picker aggregates distinct
// values from the loaded issues and supports search, so text/numeric/date
// fields all work. Keep this empty; left here for easy future overrides.
const FREE_TEXT_FIELD_IDS = new Set();

function filterFields(list, search) {
  if (!search) return list;
  const q = search.toLowerCase();
  return list.filter(f => f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q));
}

// ── Popover container ─────────────────────────────────────────────────────────
function Popover({ anchorRect, onClose, children, minWidth = 300, align = 'left' }) {
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    }
    // slight delay so the button click that opened us doesn't immediately close us
    const t = setTimeout(() => document.addEventListener('mousedown', handleClick, true), 50);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handleClick, true); };
  }, [onClose]);

  if (!anchorRect) return null;

  const top  = anchorRect.bottom + 4;
  let   left = anchorRect.left;
  if (align === 'right') left = anchorRect.right - minWidth;
  left = Math.max(8, Math.min(left, window.innerWidth - minWidth - 8));

  return (
    <div ref={ref} style={{
      position: 'fixed', top, left, zIndex: 9999,
      background: '#fff',
      border: '1px solid rgba(0,0,0,0.12)',
      borderRadius: '6px',
      boxShadow: '0 6px 20px rgba(0,0,0,0.13), 0 1px 4px rgba(0,0,0,0.08)',
      minWidth,
      maxWidth: 440,
    }}>
      {children}
    </div>
  );
}

// ── Popover section label ─────────────────────────────────────────────────────
function PopLabel({ children }) {
  return <div style={{ fontSize: '11px', fontWeight: 600, color: '#6B778C', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>{children}</div>;
}

// ── Color-by value swatches ───────────────────────────────────────────────────
// Lists every distinct value of `fieldId` found in current issues, with a
// colour swatch the user can click to override the default palette colour.
function ColorByValues({ fieldId, fieldLabel: label, issues, colorByValues, onColorByValuesChange }) {
  const values = useMemo(() => {
    const set = new Set();
    for (const iss of issues || []) {
      const v = colorValueOf(iss.fields, fieldId);
      if (v != null) set.add(v);
    }
    return Array.from(set).sort();
  }, [issues, fieldId]);

  function setColor(value, hex) {
    const next = { ...(colorByValues || {}) };
    next[fieldId] = { ...(next[fieldId] || {}), [String(value)]: hex };
    onColorByValuesChange && onColorByValuesChange(next);
  }
  function clearColor(value) {
    const next = { ...(colorByValues || {}) };
    if (next[fieldId]) {
      const { [String(value)]: _drop, ...rest } = next[fieldId];
      if (Object.keys(rest).length) next[fieldId] = rest;
      else delete next[fieldId];
    }
    onColorByValuesChange && onColorByValuesChange(next);
  }
  function resetAll() {
    const next = { ...(colorByValues || {}) };
    delete next[fieldId];
    onColorByValuesChange && onColorByValuesChange(next);
  }

  if (values.length === 0) {
    return (
      <div style={{ marginTop: 14, fontSize: 12, color: '#97A0AF', fontStyle: 'italic' }}>
        No values found for {label} in the current issues.
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <PopLabel>Colors per value</PopLabel>
        <button
          onClick={resetAll}
          style={{ background: 'none', border: 'none', color: '#0052CC', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
        >Reset</button>
      </div>
      <div style={{ maxHeight: 240, overflowY: 'auto', border: '1px solid #DFE1E6', borderRadius: 5 }}>
        {values.map(v => {
          const c = getValueColor(fieldId, v, colorByValues);
          const userOverride = !!colorByValues?.[fieldId]?.[String(v)];
          return (
            <div key={v} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderBottom: '1px solid #f0f1f3', fontSize: 12 }}>
              <label style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}>
                <span style={{
                  display: 'inline-block', width: 18, height: 18, borderRadius: 4,
                  background: c.bg, border: `2px solid ${c.border}`, verticalAlign: 'middle',
                }} />
                <input
                  type="color"
                  value={c.bg}
                  onChange={(e) => setColor(v, e.target.value)}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                />
              </label>
              <span style={{ flex: 1, color: '#172B4D' }}>{v}</span>
              {userOverride && (
                <button
                  onClick={() => clearColor(v)}
                  style={{ background: 'none', border: 'none', color: '#97A0AF', fontSize: 11, cursor: 'pointer', padding: 0 }}
                  title="Reset to default"
                >×</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Field search + list selector ──────────────────────────────────────────────
function FieldPicker({ value, onChange, availableFields }) {
  const [search, setSearch] = useState('');
  const allFields = availableFields || [];
  const sys  = allFields.filter(f => !f.custom);
  const cust = allFields.filter(f =>  f.custom);
  const show = (list) => filterFields(list, search);

  return (
    <div style={{ border: '1px solid #e1e4e8', borderRadius: '5px', overflow: 'hidden' }}>
      <input
        autoFocus
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search fields…"
        style={{ width: '100%', border: 'none', borderBottom: '1px solid #e1e4e8', padding: '7px 10px', fontSize: '12px', outline: 'none', boxSizing: 'border-box', color: '#172B4D' }}
      />
      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
        {show(sys).length > 0 && <>
          <div style={{ padding: '4px 10px 2px', fontSize: '10px', fontWeight: 700, color: '#97A0AF', textTransform: 'uppercase', letterSpacing: '0.4px', background: '#F7F8F9' }}>Standard</div>
          {show(sys).map(f => (
            <div key={f.id} onClick={() => onChange(f.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: '#172B4D', background: value === f.id ? '#EBF0FF' : 'transparent' }}>
              {value === f.id && <span style={{ color: '#0052CC', fontSize: '10px' }}>✓</span>}
              <span style={{ flex: 1 }}>{f.name}</span>
            </div>
          ))}
        </>}
        {show(cust).length > 0 && <>
          <div style={{ padding: '4px 10px 2px', fontSize: '10px', fontWeight: 700, color: '#97A0AF', textTransform: 'uppercase', letterSpacing: '0.4px', background: '#F7F8F9' }}>Custom</div>
          {show(cust).map(f => (
            <div key={f.id} onClick={() => onChange(f.id)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 500, color: '#172B4D', background: value === f.id ? '#EBF0FF' : 'transparent' }}>
              {value === f.id && <span style={{ color: '#0052CC', fontSize: '10px' }}>✓</span>}
              <span style={{ flex: 1 }}>{f.name}</span>
            </div>
          ))}
        </>}
        {show(sys).length === 0 && show(cust).length === 0 && (
          <div style={{ padding: '10px', color: '#97A0AF', fontSize: '12px', textAlign: 'center' }}>No fields found</div>
        )}
      </div>
    </div>
  );
}

// ── Toolbar flat button ───────────────────────────────────────────────────────
function TBtn({ icon, label, active, activeColor = C.primary2, activeBg, badge, onClick, btnRef }) {
  const [hov, setHov] = useState(false);
  const bg   = active ? (activeBg || `${activeColor}18`) : hov ? C.bgSunken : 'transparent';
  const col  = active ? activeColor : C.ink2;
  return (
    <button
      ref={btnRef}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      onClick={onClick}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 9px', borderRadius: 5,
        background: bg, color: col,
        border: 'none', fontSize: 12.5, fontWeight: active ? 500 : 400,
        fontFamily: T.sans, cursor: 'pointer', lineHeight: 1.3,
        whiteSpace: 'nowrap',
        transition: 'background 0.1s',
      }}
    >
      {icon && <span style={{ fontSize: '13px', opacity: 0.8 }}>{icon}</span>}
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span style={{
          background: active ? activeColor : C.ink4, color: '#fff',
          borderRadius: '9px', fontSize: '10px', fontWeight: 700,
          padding: '1px 5px', lineHeight: 1.4,
        }}>{badge}</span>
      )}
    </button>
  );
}

// ── Group by row ──────────────────────────────────────────────────────────────
function GroupRow({ value, onChange, onRemove, availableFields, label }) {
  const [open, setOpen] = useState(false);
  const [dropRect, setDropRect] = useState(null);
  const btnRef = useRef(null);
  const dropRef = useRef(null);
  const fieldName = (availableFields || []).find(f => f.id === value)?.name || value || '';

  function openDrop() {
    if (open) { setOpen(false); return; }
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setDropRect(r);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function h(e) {
      if (btnRef.current?.contains(e.target)) return;
      if (dropRef.current?.contains(e.target)) return;
      setOpen(false);
    }
    const t = setTimeout(() => document.addEventListener('mousedown', h, true), 50);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h, true); };
  }, [open]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0' }}>
      <span style={{ fontSize: '11px', color: '#97A0AF', width: '28px', flexShrink: 0, textAlign: 'right' }}>{label}</span>
      <button
        ref={btnRef}
        onClick={openDrop}
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 10px', border: '1px solid #DFE1E6', borderRadius: '5px',
          background: '#fff', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
          color: value ? '#172B4D' : '#97A0AF',
        }}
      >
        <span>{value ? fieldName : 'Choose a field…'}</span>
        <span style={{ fontSize: '10px', color: '#97A0AF', marginLeft: '6px' }}>▾</span>
      </button>
      {value && (
        <button onClick={onRemove} title="Remove"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#c1c7d0', fontSize: '15px', padding: '2px 4px', lineHeight: 1, flexShrink: 0 }}>
          🗑
        </button>
      )}
      {/* Fixed-position dropdown — renders outside all parent stacking contexts */}
      {open && dropRect && (
        <div ref={dropRef} style={{
          position: 'fixed',
          top: dropRect.bottom + 4,
          left: dropRect.left,
          width: Math.max(dropRect.width, 260),
          zIndex: 99999,
          background: '#fff',
          border: '1px solid #DFE1E6',
          borderRadius: '6px',
          boxShadow: '0 6px 20px rgba(0,0,0,0.15)',
          overflow: 'hidden',
        }}>
          <FieldPicker value={value} onChange={v => { onChange(v); setOpen(false); }} availableFields={availableFields} />
        </div>
      )}
    </div>
  );
}

// ── Group by popover — N levels ───────────────────────────────────────────────
function GroupByPopover({ allFields, groupByFields, onGroupByFieldsChange, anchorRect, onClose }) {
  const fields = groupByFields || [];

  function updateField(idx, value) {
    const next = [...fields];
    next[idx] = value;
    onGroupByFieldsChange(next);
  }

  function removeField(idx) {
    const next = fields.filter((_, i) => i !== idx);
    onGroupByFieldsChange(next);
  }

  function addField() {
    onGroupByFieldsChange([...fields, '']);
  }

  const ordinals = ['1st','2nd','3rd','4th','5th','6th','7th','8th'];

  return (
    <Popover anchorRect={anchorRect} onClose={onClose} minWidth={340}>
      <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f0f1f3' }}>
        <div style={{ fontSize: '13px', fontWeight: 700, color: '#172B4D', marginBottom: '2px' }}>Group by</div>
        <div style={{ fontSize: '11px', color: '#97A0AF' }}>Organize rows into collapsible groups</div>
      </div>
      <div style={{ padding: '12px 16px 4px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {fields.map((val, idx) => (
          <GroupRow
            key={idx}
            label={ordinals[idx] || `${idx+1}th`}
            value={val}
            onChange={v => updateField(idx, v)}
            onRemove={() => removeField(idx)}
            availableFields={allFields}
          />
        ))}
      </div>
      <div style={{ padding: '6px 16px 14px', borderTop: '1px solid #f0f1f3', marginTop: '8px' }}>
        <button
          onClick={addField}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px',
            background: 'none', border: 'none', padding: '6px 0',
            cursor: 'pointer',
            color: '#0052CC',
            fontSize: '13px', fontWeight: 500,
          }}
        >
          <span style={{ fontSize: '18px', lineHeight: 1, fontWeight: 300 }}>+</span>
          <span>Add subgroup</span>
        </button>
      </div>
    </Popover>
  );
}

// ── Main Toolbar ──────────────────────────────────────────────────────────────
export default function Toolbar({
  activeView, viewType, isDirty,
  availableFields, availableProjects,
  groupByFields, onGroupByFieldsChange,
  jqlFilter, onJqlFilterChange,
  statusFilter, onStatusFilterChange,
  selectedProjects, onProjectsChange,
  startDateField, endDateField, onStartDateFieldChange, onEndDateFieldChange,
  listFields, onListFieldsChange,
  previewFields, onPreviewFieldsChange,
  filterFields, onFilterFieldsChange,
  colorByField, onColorByFieldChange,
  colorByValues, onColorByValuesChange,
  timelineZoom, onTimelineZoomChange,
  timelineZoomScale, onTimelineZoomScaleChange,
  orderByField, orderByDir, onOrderByFieldChange, onOrderByDirChange,
  onViewTypeChange,
  eventsOnly, onEventsOnlyChange,
  holidays, onSaveHolidays,
  baselines, activeBaselineId, onCreateBaseline, onDeleteBaseline, onSetActiveBaseline,
  ganttFilter, onGanttFilterChange,
  issues, customEvents,
  onAddEvent, onShareClick, onRefresh, onSave,
  visYear, visMonth, onNavigateMonth, onJumpToToday,
  activeModuleId,
}) {
  const [openPopover, setOpenPopover] = useState(null);
  const [anchorRect, setAnchorRect]   = useState(null);

  // local state for popovers
  const [colSearch, setColSearch]           = useState('');
  const [previewSearch, setPreviewSearch]   = useState('');
  const [baselineName, setBaselineName]     = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');

  const allFields = availableFields || [];
  const dateFields = allFields.filter(f =>
    f.schema?.type === 'date' || f.schema?.type === 'datetime' ||
    f.schemaType === 'date' || f.schemaType === 'datetime'
  );

  const fieldLabel = id => allFields.find(f => f.id === id)?.name || id;

  function openPop(key, e) {
    const rect = e.currentTarget.getBoundingClientRect();
    if (openPopover === key) { setOpenPopover(null); return; }
    setOpenPopover(key);
    setAnchorRect(rect);
  }
  const closePop = useCallback(() => setOpenPopover(null), []);

  function toggleProject(key) {
    const cur = selectedProjects || [];
    onProjectsChange(cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key]);
  }

  // ── Active indicators ──────────────────────────────────────────────────────
  const groupByActive   = !!(groupByFields && groupByFields.some(f => f));
  const isHierarchical  = viewType === 'project' || viewType === 'tree';
  // Views with a tabular column area: List and Project both render columns
  // driven by listFields, so the Fields popover should edit columns for both.
  // Only Gantt uses the "hover preview fields" mode.
  const isList          = viewType === 'list' || viewType === 'project';

  let filterBadge = 0;
  if (jqlFilter?.trim())           filterBadge++;
  if (statusFilter !== 'active')   filterBadge++;
  if (eventsOnly)                  filterBadge++;
  if (selectedProjects?.length > 0) filterBadge++;

  const dateFieldsActive = startDateField !== DEFAULT_START_FIELD || endDateField !== DEFAULT_END_FIELD;
  const sortActive       = !!(orderByField && orderByField !== 'duedate');

  // ── View type labels ───────────────────────────────────────────────────────
  const viewTypeLabel = viewType === 'list' ? 'List' : viewType === 'project' ? 'Project' : 'Gantt';
  const viewTypeIcon  = viewType === 'list' ? '≡' : viewType === 'project' ? '⊞' : '▤';

  const GANTT_COLOR = C.primary2;
  const LIST_COLOR = C.success;
  const PROJECT_COLOR = '#7c3aad';

  return (
    <>
      {/* ── Row 1: title + right actions ── */}
      <div style={{
        background: C.bg, borderBottom: `1px solid ${C.line}`,
        padding: '10px 16px 0',
        display: 'flex', alignItems: 'center',
        flexShrink: 0, position: 'relative', zIndex: 10,
      }}>
        {/* View name */}
        {activeView && !activeModuleId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1 }}>
            <span style={{ fontFamily: T.display, fontSize: 19, fontWeight: 500, color: C.ink, letterSpacing: -0.3 }}>{activeView.name}</span>
            <span style={{ color: C.ink4, fontSize: 12 }}>· {(issues||[]).length} issues</span>
            {isDirty && <span style={{ color: C.amber, fontSize: '8px', marginLeft: 2 }}>●</span>}
          </div>
        )}

        {/* Right actions */}
        {!activeModuleId && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            <button onClick={onShareClick} style={{
              background: C.bg, color: C.ink2, border: `1px solid ${C.line}`,
              borderRadius: 5, padding: '5px 12px',
              fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.sans,
            }}>Share</button>
            <button onClick={onAddEvent} style={{
              background: C.primary, color: '#fff', border: 'none',
              borderRadius: 5, padding: '5px 14px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: T.sans,
            }}>+ New event</button>
            <button onClick={isDirty ? onSave : undefined} style={{
              background: isDirty ? C.amber : C.line2, color: isDirty ? '#fff' : C.ink4, border: 'none',
              borderRadius: 5, padding: '5px 14px',
              fontSize: 12, fontWeight: 600, cursor: isDirty ? 'pointer' : 'default', fontFamily: T.sans,
              opacity: isDirty ? 1 : 0.7,
            }}>Save</button>
          </div>
        )}
      </div>

      {/* ── Row 2: view tabs + filters + zoom + today ── */}
      <div style={{
        background: C.bg, borderBottom: `1px solid ${C.line}`,
        padding: '8px 10px 8px 14px',
        display: 'flex', alignItems: 'center', gap: '2px',
        flexShrink: 0, position: 'relative', zIndex: 10,
      }}>
        {/* View type tabs */}
        {!activeModuleId && (
          <>
            {[
              { value: 'timeline', label: 'Gantt',   icon: '▤', color: GANTT_COLOR },
              { value: 'list',     label: 'List',    icon: '≡', color: LIST_COLOR },
              { value: 'project',  label: 'Project', icon: '⊞', color: PROJECT_COLOR },
            ].map(opt => {
              const isActive = viewType === opt.value;
              return (
                <button key={opt.value} onClick={() => { onViewTypeChange(opt.value); }} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '5px 9px', borderRadius: 5, border: 'none',
                  background: isActive ? `${opt.color}15` : 'transparent',
                  color: isActive ? opt.color : C.ink2,
                  fontSize: 12.5, fontWeight: isActive ? 500 : 400,
                  fontFamily: T.sans, cursor: 'pointer', lineHeight: 1.3,
                }}>
                  <span>{opt.icon}</span>
                  <span>{opt.label}</span>
                </button>
              );
            })}

            {/* Divider */}
            <div style={{ width: 1, height: 18, background: C.line, margin: '0 6px', flexShrink: 0 }} />

            {/* Filter buttons */}
            {!isHierarchical && (
              <TBtn
                icon="⊞"
                label={groupByActive
                  ? `Group: ${(groupByFields||[]).filter(f=>f).length > 1 ? `${(groupByFields||[]).filter(f=>f).length} fields` : fieldLabel((groupByFields||[])[0])}`
                  : 'Group'}
                active={groupByActive}
                activeColor="#7c3aad"
                activeBg="#f0dcff"
                onClick={e => openPop('groupBy', e)}
              />
            )}

            <TBtn
              icon="⊟"
              label={filterBadge > 0 ? `Filter` : 'Filter'}
              badge={filterBadge}
              active={filterBadge > 0}
              activeColor={C.success}
              activeBg={`${C.success}18`}
              onClick={e => openPop('filter', e)}
            />

            <TBtn
              icon="↕"
              label={sortActive ? `Sort: ${ORDER_BY_OPTIONS.find(o => o.value === orderByField)?.label || fieldLabel(orderByField)}` : 'Sort'}
              active={sortActive}
              activeColor={C.accent}
              activeBg={C.amberBg}
              onClick={e => openPop('sort', e)}
            />

            <TBtn
              icon="⊡"
              label="Fields"
              active={openPopover === 'fields'}
              onClick={e => openPop('fields', e)}
            />

            <TBtn
              icon="◐"
              label={colorByField ? `Color: ${fieldLabel(colorByField)}` : 'Color'}
              active={!!colorByField || openPopover === 'colorBy'}
              activeColor={C.primary2}
              onClick={e => openPop('colorBy', e)}
            />

            <TBtn
              icon="⊠"
              label={dateFieldsActive ? 'Dates: Custom' : 'Dates'}
              active={dateFieldsActive}
              activeColor={C.primary2}
              onClick={e => openPop('dateFields', e)}
            />

            <TBtn
              icon="▦"
              label={`Calendar${(holidays || []).length > 0 ? ` · ${holidays.length}` : ''}`}
              active={(holidays || []).length > 0}
              activeColor={C.primary2}
              onClick={e => openPop('calendar', e)}
            />

            {/* Divider */}
            <div style={{ flex: 1 }} />

            {/* Timeline zoom — preset (Days / Months / Qtrs) + fine-grained
                +/- around the current preset. Picking a preset resets the
                scale; +/- multiplies the active day-width by 1.4 or 1/1.4. */}
            {viewType !== 'list' && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 6, flexShrink: 0 }}>
                <div style={{ display: 'inline-flex', border: '1px solid #DFE1E6', borderRadius: 5, overflow: 'hidden' }}>
                  {[
                    { v: 'day',     l: 'Days' },
                    { v: 'month',   l: 'Months' },
                    { v: 'quarter', l: 'Qtrs' },
                  ].map(o => {
                    const active = (timelineZoom || 'day') === o.v && (timelineZoomScale || 1) === 1;
                    return (
                      <button
                        key={o.v}
                        onClick={() => {
                          onTimelineZoomChange && onTimelineZoomChange(o.v);
                          onTimelineZoomScaleChange && onTimelineZoomScaleChange(1);
                        }}
                        style={{
                          background: active ? C.primaryBg : '#fff',
                          color: active ? C.primary : C.ink3,
                          border: 'none',
                          borderRight: o.v === 'quarter' ? 'none' : '1px solid #DFE1E6',
                          padding: '4px 9px', fontSize: 11, fontWeight: 600,
                          cursor: 'pointer', fontFamily: 'inherit',
                        }}
                      >{o.l}</button>
                    );
                  })}
                </div>
                <button
                  onClick={() => onTimelineZoomScaleChange && onTimelineZoomScaleChange(Math.max(0.2, (timelineZoomScale || 1) / 1.4))}
                  title="Zoom out"
                  style={zoomBtnStyle}
                >−</button>
                <button
                  onClick={() => onTimelineZoomScaleChange && onTimelineZoomScaleChange(Math.min(5, (timelineZoomScale || 1) * 1.4))}
                  title="Zoom in"
                  style={zoomBtnStyle}
                >+</button>
              </div>
            )}

            {/* Timeline nav */}
            {viewType !== 'list' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px', flexShrink: 0 }}>
                <button onClick={() => onNavigateMonth(-1)} style={cadenceNavBtn}>‹</button>
                <span style={{ fontSize: '12px', fontWeight: 500, color: C.ink2, minWidth: '110px', textAlign: 'center', padding: '0 4px' }}>
                  {MONTH_NAMES[visMonth]} {visYear}
                </span>
                <button onClick={() => onNavigateMonth(1)} style={cadenceNavBtn}>›</button>
                <button onClick={onJumpToToday} style={{ ...cadenceNavBtn, padding: '3px 10px', color: C.primary2, fontWeight: 500 }}>Today</button>
              </div>
            )}

            {/* Divider */}
            <div style={{ width: 1, height: 18, background: C.line, margin: '0 6px', flexShrink: 0 }} />

            <button onClick={onRefresh} title="Refresh" style={{
              background: 'none', border: 'none', color: C.ink3,
              borderRadius: 5, padding: '5px 7px', fontSize: 15, cursor: 'pointer',
            }}>⟳</button>
          </>
        )}
      </div>

      {/* ══════════════════════ POPOVERS ══════════════════════ */}

      {/* ── Group by ── */}
      {openPopover === 'groupBy' && (
        <GroupByPopover
          allFields={allFields}
          groupByFields={groupByFields}
          onGroupByFieldsChange={onGroupByFieldsChange}
          anchorRect={anchorRect}
          onClose={closePop}
        />
      )}

      {/* ── Filter ── */}
      {openPopover === 'filter' && (
        <Popover anchorRect={anchorRect} onClose={closePop} minWidth={340}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f0f1f3' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#172B4D' }}>Filter</div>
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '70vh', overflowY: 'auto' }}>

            {!isHierarchical && (
              <div>
                <PopLabel>Data source</PopLabel>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[{v: false, l: 'Issues + Events'}, {v: true, l: 'Events only'}].map(o => (
                    <button key={String(o.v)} onClick={() => onEventsOnlyChange(o.v)} style={{
                      flex: 1, border: '1px solid', borderRadius: '5px', padding: '6px 8px',
                      cursor: 'pointer', fontSize: '12px', fontWeight: 500,
                      background: eventsOnly === o.v ? '#172B4D' : '#fff',
                      color: eventsOnly === o.v ? '#fff' : '#42526E',
                      borderColor: eventsOnly === o.v ? '#172B4D' : '#DFE1E6',
                    }}>{o.l}</button>
                  ))}
                </div>
              </div>
            )}

            {!eventsOnly && (
              <>
                <div>
                  <PopLabel>JQL filter</PopLabel>
                  <JqlInput
                    value={jqlFilter}
                    onChange={onJqlFilterChange}
                    placeholder="project = MYPROJECT AND sprint in openSprints()"
                    availableFields={availableFields}
                    availableProjects={availableProjects}
                  />
                  {jqlFilter?.trim() && (
                    <button onClick={() => onJqlFilterChange('')} style={{ marginTop: '6px', background: 'none', border: '1px solid #DFE1E6', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', color: '#DE350B' }}>
                      ✕ Clear JQL
                    </button>
                  )}
                </div>

                {!jqlFilter?.trim() && <>
                  <div>
                    <PopLabel>Status</PopLabel>
                    {[{v:'active',l:'Active only (exclude Done)'},{v:'all',l:'All statuses'}].map(o => (
                      <label key={o.v} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 0', cursor: 'pointer', fontSize: '13px', color: '#172B4D' }}>
                        <input type="radio" value={o.v} checked={statusFilter === o.v} onChange={() => onStatusFilterChange(o.v)} />
                        {o.l}
                      </label>
                    ))}
                  </div>

                  <div>
                    <PopLabel>Projects <span style={{ textTransform: 'none', fontWeight: 400, color: '#97A0AF' }}>— {(selectedProjects||[]).length} selected</span></PopLabel>
                    <div style={{ border: '1px solid #e1e4e8', borderRadius: '5px', maxHeight: '180px', overflowY: 'auto' }}>
                      {(availableProjects || []).slice(0, 100).map(p => (
                        <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid #f0f1f3' }}>
                          <input type="checkbox" checked={(selectedProjects||[]).includes(p.key)} onChange={() => toggleProject(p.key)} />
                          <span style={{ fontWeight: 700, color: '#0052CC', minWidth: '44px', flexShrink: 0, fontSize: '11px' }}>{p.key}</span>
                          <span style={{ color: '#172B4D' }}>{p.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>}
              </>
            )}
          </div>
        </Popover>
      )}

      {/* ── Sort ── */}
      {openPopover === 'sort' && (
        <Popover anchorRect={anchorRect} onClose={closePop} minWidth={340}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f0f1f3', borderRadius: '6px 6px 0 0' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#172B4D' }}>Sort</div>
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div>
              <PopLabel>Sort by</PopLabel>
              {/* Build a combined field list: ORDER_BY_OPTIONS first, then remaining availableFields */}
              {(() => {
                const commonIds = new Set(ORDER_BY_OPTIONS.map(o => o.value));
                const sortFields = [
                  ...ORDER_BY_OPTIONS.map(o => ({ id: o.value, name: o.label, custom: false })),
                  ...allFields.filter(f => !commonIds.has(f.id)),
                ];
                return (
                  <GroupRow
                    label=""
                    value={orderByField || 'duedate'}
                    onChange={v => onOrderByFieldChange(v)}
                    onRemove={null}
                    availableFields={sortFields}
                  />
                );
              })()}
            </div>
            <div>
              <PopLabel>Direction</PopLabel>
              <div style={{ display: 'flex', border: '1px solid #DFE1E6', borderRadius: '5px', overflow: 'hidden' }}>
                {['ASC','DESC'].map(dir => (
                  <button key={dir} onClick={() => onOrderByDirChange(dir)} style={{
                    flex: 1, border: 'none', borderRight: dir === 'ASC' ? '1px solid #DFE1E6' : 'none',
                    padding: '8px 12px', cursor: 'pointer', fontSize: '13px', fontWeight: 500,
                    background: (orderByDir||'ASC') === dir ? '#172B4D' : '#fff',
                    color: (orderByDir||'ASC') === dir ? '#fff' : '#42526E',
                  }}>{dir === 'ASC' ? '↑ Ascending' : '↓ Descending'}</button>
                ))}
              </div>
            </div>
          </div>
        </Popover>
      )}

      {/* ── Fields ── */}
      {openPopover === 'fields' && (
        <Popover anchorRect={anchorRect} onClose={closePop} minWidth={isList ? 380 : 300}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f0f1f3' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#172B4D' }}>{isList ? 'Fields' : 'Hover preview fields'}</div>
            <div style={{ fontSize: '11px', color: '#97A0AF', marginTop: '2px' }}>
              {isList ? 'Pick which fields appear as table columns or filter chips' : 'Fields shown when hovering over a bar'}
            </div>
          </div>
          <div style={{ padding: '10px 16px' }}>
            <input
              value={isList ? colSearch : previewSearch}
              onChange={e => isList ? setColSearch(e.target.value) : setPreviewSearch(e.target.value)}
              placeholder="Search…"
              style={{ width: '100%', border: '1px solid #e1e4e8', borderRadius: '5px', padding: '6px 10px', fontSize: '12px', outline: 'none', boxSizing: 'border-box', marginBottom: '8px' }}
            />
            <div style={{ border: '1px solid #e1e4e8', borderRadius: '5px', maxHeight: '260px', overflowY: 'auto' }}>
              {isList ? (
                <>
                  {/* Header row for the 2-checkbox layout */}
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 60px 60px',
                    padding: '6px 10px', background: '#FAFBFC',
                    borderBottom: '1px solid #EBECF0',
                    fontSize: 10, fontWeight: 700, color: '#6B778C',
                    textTransform: 'uppercase', letterSpacing: '0.3px',
                  }}>
                    <span>Field</span>
                    <span style={{ textAlign: 'center' }}>Column</span>
                    <span style={{ textAlign: 'center' }}>Filter</span>
                  </div>
                  {allFields.filter(f => !colSearch || f.name.toLowerCase().includes(colSearch.toLowerCase())).map(f => {
                    const colCur = listFields || [];
                    const fltCur = filterFields || [];
                    const colChecked = colCur.includes(f.id);
                    const fltChecked = fltCur.includes(f.id);
                    // Free-text fields can't have a value-picker — disable Filter
                    const fltDisabled = FREE_TEXT_FIELD_IDS.has(f.id);
                    return (
                      <div key={f.id} style={{
                        display: 'grid', gridTemplateColumns: '1fr 60px 60px',
                        padding: '6px 10px', fontSize: 12,
                        borderBottom: '1px solid #f0f1f3',
                        alignItems: 'center',
                      }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                          <span style={{ fontWeight: 500, color: '#172B4D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                          <span style={{ fontSize: 10, color: '#c1c7d0', fontFamily: 'ui-monospace, monospace' }}>{f.id}</span>
                        </span>
                        <label style={{ display: 'flex', justifyContent: 'center', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={colChecked}
                            onChange={() => {
                              const next = colChecked ? colCur.filter(x => x !== f.id) : [...colCur, f.id];
                              onListFieldsChange(next);
                            }}
                            style={{ accentColor: '#0052CC', cursor: 'pointer' }}
                          />
                        </label>
                        <label style={{ display: 'flex', justifyContent: 'center', cursor: fltDisabled ? 'not-allowed' : 'pointer' }} title={fltDisabled ? 'Free-text fields cannot be filter chips' : ''}>
                          <input
                            type="checkbox"
                            checked={fltChecked}
                            disabled={fltDisabled}
                            onChange={() => {
                              const next = fltChecked ? fltCur.filter(x => x !== f.id) : [...fltCur, f.id];
                              onFilterFieldsChange && onFilterFieldsChange(next);
                            }}
                            style={{ accentColor: '#7c3aad', cursor: fltDisabled ? 'not-allowed' : 'pointer' }}
                          />
                        </label>
                      </div>
                    );
                  })}
                </>
              ) : (
                allFields.filter(f => !previewSearch || f.name.toLowerCase().includes(previewSearch.toLowerCase())).map(f => {
                  const cur = previewFields || [];
                  const checked = cur.includes(f.id);
                  return (
                    <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', cursor: 'pointer', fontSize: '12px', borderBottom: '1px solid #f0f1f3' }}>
                      <input type="checkbox" checked={checked} onChange={() => {
                        const next = checked ? cur.filter(x => x !== f.id) : [...cur, f.id];
                        onPreviewFieldsChange(next);
                      }} />
                      <span style={{ fontWeight: 500, flex: 1 }}>{f.name}</span>
                      <span style={{ fontSize: '10px', color: '#c1c7d0', fontFamily: 'monospace' }}>{f.id}</span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        </Popover>
      )}

      {/* ── Color by ── */}
      {openPopover === 'colorBy' && (
        <Popover anchorRect={anchorRect} onClose={closePop} minWidth={320}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f0f1f3' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#172B4D' }}>Color bars by</div>
            <div style={{ fontSize: '11px', color: '#97A0AF', marginTop: '2px' }}>
              Pick a field whose values drive bar color (Status, Priority, …).
            </div>
          </div>
          <div style={{ padding: '12px 16px' }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <button
                onClick={() => onColorByFieldChange && onColorByFieldChange(null)}
                style={{
                  flex: 1, padding: '5px 8px', fontSize: 12, fontWeight: 600,
                  background: !colorByField ? '#172B4D' : '#fff',
                  color: !colorByField ? '#fff' : '#42526E',
                  border: '1px solid', borderColor: !colorByField ? '#172B4D' : '#DFE1E6',
                  borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
                }}
              >Off</button>
              {['status', 'priority', 'issuetype', 'assignee'].map(qid => (
                allFields.some(f => f.id === qid) ? (
                  <button
                    key={qid}
                    onClick={() => onColorByFieldChange && onColorByFieldChange(qid)}
                    style={{
                      flex: 1, padding: '5px 8px', fontSize: 12, fontWeight: 600,
                      background: colorByField === qid ? '#172B4D' : '#fff',
                      color: colorByField === qid ? '#fff' : '#42526E',
                      border: '1px solid', borderColor: colorByField === qid ? '#172B4D' : '#DFE1E6',
                      borderRadius: 5, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >{fieldLabel(qid)}</button>
                ) : null
              ))}
            </div>
            <div>
              <PopLabel>Or any other field</PopLabel>
              <FieldPicker
                value={colorByField || ''}
                onChange={(fid) => onColorByFieldChange && onColorByFieldChange(fid || null)}
                availableFields={allFields}
              />
            </div>
            {colorByField && (
              <ColorByValues
                fieldId={colorByField}
                fieldLabel={fieldLabel(colorByField)}
                issues={issues}
                colorByValues={colorByValues}
                onColorByValuesChange={onColorByValuesChange}
              />
            )}
          </div>
        </Popover>
      )}

      {/* ── Date fields ── */}
      {openPopover === 'dateFields' && (
        <Popover anchorRect={anchorRect} onClose={closePop} minWidth={320}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f0f1f3' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#172B4D' }}>Date fields</div>
            <div style={{ fontSize: '11px', color: '#97A0AF', marginTop: '2px' }}>Which Jira fields map to bar start and end</div>
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div>
              <PopLabel>Start date</PopLabel>
              <FieldPicker value={startDateField} onChange={onStartDateFieldChange} availableFields={dateFields} />
            </div>
            <div>
              <PopLabel>End date (due date)</PopLabel>
              <FieldPicker value={endDateField} onChange={onEndDateFieldChange} availableFields={dateFields} />
            </div>
          </div>
        </Popover>
      )}

      {/* ── View type ── */}
      {openPopover === 'viewType' && (
        <Popover anchorRect={anchorRect} onClose={closePop} minWidth={260}>
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f0f1f3' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#172B4D' }}>View type</div>
          </div>
          <div style={{ padding: '10px 8px' }}>
            {[
              { value: 'timeline', icon: '▤', label: 'Gantt',   desc: 'Timeline bars with dependencies' },
              { value: 'list',     icon: '≡', label: 'List',    desc: 'Flat table with custom columns' },
              { value: 'project',  icon: '⊞', label: 'Project', desc: 'Hierarchy by parent / epic' },
            ].map(opt => (
              <button key={opt.value} onClick={() => { onViewTypeChange(opt.value); closePop(); }} style={{
                display: 'flex', alignItems: 'center', gap: '10px', width: '100%', textAlign: 'left',
                padding: '8px 10px', borderRadius: '5px', border: 'none', cursor: 'pointer',
                background: viewType === opt.value ? '#EBF0FF' : 'transparent',
                marginBottom: '2px',
              }}>
                <span style={{ fontSize: '18px', width: '24px', textAlign: 'center' }}>{opt.icon}</span>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: viewType === opt.value ? '#0052CC' : '#172B4D' }}>{opt.label}</div>
                  <div style={{ fontSize: '11px', color: '#97A0AF' }}>{opt.desc}</div>
                </div>
                {viewType === opt.value && <span style={{ marginLeft: 'auto', color: '#0052CC', fontSize: '12px' }}>✓</span>}
              </button>
            ))}
          </div>
        </Popover>
      )}

      {/* ── Calendar / Baselines ── */}
      {openPopover === 'calendar' && (
        <Popover anchorRect={anchorRect} onClose={closePop} minWidth={360} align="right">
          <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid #f0f1f3' }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: '#172B4D' }}>Calendar & Baselines</div>
          </div>
          <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '18px', maxHeight: '70vh', overflowY: 'auto' }}>

            {/* Holidays */}
            <div>
              <PopLabel>Holidays / non-working days</PopLabel>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                <input type="date" value={newHolidayDate} onChange={e => setNewHolidayDate(e.target.value)}
                  style={{ flex: '0 0 130px', border: '1px solid #DFE1E6', borderRadius: '5px', padding: '6px 8px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                <input value={newHolidayName} onChange={e => setNewHolidayName(e.target.value)}
                  placeholder="Holiday name…"
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newHolidayDate && newHolidayName.trim()) {
                      onSaveHolidays && onSaveHolidays([...(holidays||[]), { date: newHolidayDate, name: newHolidayName.trim() }]);
                      setNewHolidayDate(''); setNewHolidayName('');
                    }
                  }}
                  style={{ flex: 1, border: '1px solid #DFE1E6', borderRadius: '5px', padding: '6px 8px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                <button disabled={!newHolidayDate || !newHolidayName.trim()}
                  onClick={() => {
                    if (newHolidayDate && newHolidayName.trim()) {
                      onSaveHolidays && onSaveHolidays([...(holidays||[]), { date: newHolidayDate, name: newHolidayName.trim() }]);
                      setNewHolidayDate(''); setNewHolidayName('');
                    }
                  }}
                  style={{ background: '#0052CC', color: '#fff', border: 'none', borderRadius: '5px', padding: '6px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, opacity: newHolidayDate && newHolidayName.trim() ? 1 : 0.4, whiteSpace: 'nowrap' }}>
                  Add
                </button>
              </div>
              {(holidays||[]).length > 0 ? (
                <div style={{ border: '1px solid #e1e4e8', borderRadius: '5px', maxHeight: '150px', overflowY: 'auto' }}>
                  {[...(holidays||[])].sort((a,b) => a.date.localeCompare(b.date)).map(h => (
                    <div key={h.date} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', borderBottom: '1px solid #f0f1f3', fontSize: '12px' }}>
                      <span style={{ fontWeight: 600, color: '#BF2040', fontFamily: 'monospace', fontSize: '11px', flexShrink: 0 }}>{h.date}</span>
                      <span style={{ flex: 1, color: '#172B4D' }}>{h.name}</span>
                      <button onClick={() => onSaveHolidays && onSaveHolidays((holidays||[]).filter(x => x.date !== h.date))}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#97A0AF', fontSize: '14px', padding: '0 2px' }}>✕</button>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#97A0AF' }}>No holidays configured.</div>
              )}
            </div>

            {/* Baselines */}
            <div>
              <PopLabel>Baselines</PopLabel>
              <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                <input value={baselineName} onChange={e => setBaselineName(e.target.value)}
                  placeholder="Baseline name…"
                  onKeyDown={e => { if (e.key === 'Enter' && baselineName.trim()) { onCreateBaseline && onCreateBaseline(baselineName.trim()); setBaselineName(''); } }}
                  style={{ flex: 1, border: '1px solid #DFE1E6', borderRadius: '5px', padding: '6px 8px', fontSize: '12px', outline: 'none', boxSizing: 'border-box' }} />
                <button disabled={!baselineName.trim()}
                  onClick={() => { if (baselineName.trim()) { onCreateBaseline && onCreateBaseline(baselineName.trim()); setBaselineName(''); } }}
                  style={{ background: '#0052CC', color: '#fff', border: 'none', borderRadius: '5px', padding: '6px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, opacity: baselineName.trim() ? 1 : 0.4, whiteSpace: 'nowrap' }}>
                  + Snapshot
                </button>
              </div>
              {(baselines||[]).length > 0 ? (
                <div style={{ border: '1px solid #e1e4e8', borderRadius: '5px', maxHeight: '150px', overflowY: 'auto' }}>
                  {[...(baselines||[])].sort((a,b) => (b.createdAt||0) - (a.createdAt||0)).map(bl => {
                    const isActive = activeBaselineId === bl.id;
                    const dateStr = bl.createdAt ? new Date(bl.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
                    return (
                      <div key={bl.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 10px', borderBottom: '1px solid #f0f1f3', background: isActive ? '#EBF0FF' : 'transparent' }}>
                        <div style={{ flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: isActive ? '#0052CC' : '#172B4D' }}>{bl.name}</div>
                          {dateStr && <div style={{ fontSize: '10px', color: '#97A0AF' }}>{dateStr}</div>}
                        </div>
                        {isActive
                          ? <span style={{ fontSize: '10px', fontWeight: 700, color: '#0052CC', background: '#B3D4FF', borderRadius: '3px', padding: '2px 6px', flexShrink: 0 }}>Active</span>
                          : <button onClick={() => onSetActiveBaseline && onSetActiveBaseline(bl.id)}
                              style={{ background: 'none', border: '1px solid #DFE1E6', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '10px', color: '#0052CC', fontWeight: 600, flexShrink: 0 }}>
                              Activate
                            </button>
                        }
                        <button onClick={() => onDeleteBaseline && onDeleteBaseline(bl.id)}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#97A0AF', padding: '0 2px', flexShrink: 0 }}>✕</button>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: '#97A0AF' }}>No baselines yet.</div>
              )}
              {activeBaselineId && (
                <button onClick={() => onSetActiveBaseline && onSetActiveBaseline(null)}
                  style={{ marginTop: '6px', background: 'none', border: '1px solid #DFE1E6', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', color: '#6B778C' }}>
                  Hide baseline
                </button>
              )}
            </div>
          </div>
        </Popover>
      )}
    </>
  );
}

const cadenceNavBtn = {
  background: 'transparent', border: 'none', borderRadius: 4,
  padding: '3px 8px', cursor: 'pointer', fontSize: '14px', color: C.ink2,
  lineHeight: 1.4, fontFamily: T.sans,
};

const zoomBtnStyle = {
  background: '#fff', border: '1px solid #DFE1E6', borderRadius: 4,
  width: 22, height: 22, padding: 0, cursor: 'pointer',
  fontSize: 14, fontWeight: 700, color: C.ink2, lineHeight: 1,
  fontFamily: T.sans,
};

// keep old name as alias for any remaining references
const navBtn = cadenceNavBtn;
