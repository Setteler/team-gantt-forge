import React, { useState, useEffect, useRef } from 'react';
import { router, invoke } from '@forge/bridge';
import { C, T } from '../tokens';

const PRIORITY_OPTIONS = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];

const STATUS_COLORS = {
  'To Do':       { bg: '#f4f5f7', text: '#676879', border: '#c1c7d0' },
  'In Progress': { bg: '#dce5ff', text: '#0060b9', border: '#0073ea' },
  'In Review':   { bg: '#f0dcff', text: '#7c3aad', border: '#a25ddc' },
  'Review':      { bg: '#f0dcff', text: '#7c3aad', border: '#a25ddc' },
  'Done':        { bg: '#dcf5e7', text: '#007a44', border: '#00c875' },
  'Canceled':    { bg: '#f4f5f7', text: '#c1c7d0', border: '#e6e9ef' },
  'Blocked':     { bg: '#ffe1e1', text: '#bf2040', border: '#e2445c' },
};

function getStatusColor(statusName) {
  return STATUS_COLORS[statusName] || { bg: '#DEEBFF', text: '#0747A6', border: '#0052CC' };
}

const PRIORITY_ICON = {
  Highest: '🔴', High: '🟠', Medium: '🟡', Low: '🔵', Lowest: '⚪',
};

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
}

function fmtDate(date) {
  if (!date) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtISODate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function GripDots({ color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center', justifyContent: 'center', height: '100%', pointerEvents: 'none' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: color, opacity: 0.7 }} />
      ))}
    </div>
  );
}

export default function GanttBar({ issue, viewStart, dayWidth, rowHeight, barPadding, totalDays, squadColor, onUpdate, startDateField, endDateField, onPreview, previewFields, availableFields, isCritical, onLinkDragStart, onDeleteLink, onFieldUpdate, getIssueDates, onDragStart, onDragEnd }) {
  const [showTooltip, setShowTooltip]   = useState(false);
  const [tooltipPos, setTooltipPos]     = useState({ x: 0, y: 0 });
  const [hovered, setHovered]           = useState(false);
  const hideTimerRef  = useRef(null);   // debounce tooltip close on mouse-leave

  // Live drag/resize deltas
  const [isDragging, setIsDragging] = useState(false);
  const [dragDelta, setDragDelta] = useState(0);
  const [isResizingEnd, setIsResizingEnd] = useState(false);
  const [resizeEndDelta, setResizeEndDelta] = useState(0);
  const [isResizingStart, setIsResizingStart] = useState(false);
  const [resizeStartDelta, setResizeStartDelta] = useState(0);

  // Hold deltas after mouse-up to prevent snap-back while parent async-saves
  const [holdMoveDelta, setHoldMoveDelta] = useState(0);
  const [holdEndDelta, setHoldEndDelta] = useState(0);
  const [holdStartDelta, setHoldStartDelta] = useState(0);

  const didDragRef    = useRef(false);
  const clickTimerRef = useRef(null);
  const { key, fields } = issue;
  const sdf = startDateField || 'customfield_10015';
  const edf = endDateField   || 'duedate';

  // When parent confirms new dates (props update), clear held deltas
  const startFieldValue = fields[sdf];
  const endFieldValue   = fields[edf];
  useEffect(() => {
    setHoldMoveDelta(0);
    setHoldEndDelta(0);
    setHoldStartDelta(0);
  }, [startFieldValue, endFieldValue]);

  const summary  = fields.summary || '';
  const status   = fields.status?.name || 'To Do';
  const priority = fields.priority?.name || 'Medium';
  const assignee = fields.assignee?.displayName || 'Unassigned';

  const isUnscheduled = !fields[sdf] && !fields[edf];

  let startDate = parseDate(fields[sdf]);
  let endDate   = parseDate(fields[edf]);

  if (startDate && !endDate) endDate = addDays(startDate, 7);
  else if (!startDate && endDate) startDate = addDays(endDate, -7);
  else if (!startDate && !endDate) {
    const ref = new Date(); ref.setHours(0, 0, 0, 0);
    startDate = ref;
    endDate   = addDays(ref, 2); // 3-day ghost anchored to today
  }

  const baseStartOffset = daysBetween(viewStart, startDate);
  const baseEndOffset   = daysBetween(viewStart, endDate) + 1;

  const active = isDragging || isResizingEnd || isResizingStart;

  const effectiveMove  = isDragging      ? dragDelta       : holdMoveDelta;
  const effectiveEnd   = isResizingEnd   ? resizeEndDelta  : holdEndDelta;
  const effectiveStart = isResizingStart ? resizeStartDelta : holdStartDelta;

  const startOffset = baseStartOffset + effectiveMove + effectiveStart;
  const endOffset   = baseEndOffset   + effectiveMove + effectiveEnd;

  const clippedStart = Math.max(0, startOffset);
  const clippedEnd   = Math.min(totalDays, endOffset);

  if (clippedEnd <= clippedStart && !active) return null;

  const barLeft   = clippedStart * dayWidth;
  const barWidth  = Math.max((Math.max(0, clippedEnd - clippedStart)) * dayWidth, dayWidth * 0.5);
  const overflowLeft  = startOffset < 0;
  const overflowRight = endOffset > totalDays;
  const statusColor = getStatusColor(status);
  const barHeight = rowHeight - barPadding * 2;
  const barBg     = isUnscheduled ? '#fffbf0' : (squadColor ? squadColor.bg     : statusColor.bg);
  const barBorder = isUnscheduled ? '#fdab3d' : (squadColor ? squadColor.border : statusColor.border);
  const barText   = isUnscheduled ? '#97A0AF' : (squadColor ? squadColor.text   : statusColor.text);
  const showHandles = (hovered || active) && !overflowLeft && !overflowRight;

  // ── Dependency constraints ────────────────────────────────────────────────
  // Returns { minDelta, maxDelta } in days based on Blocks links.
  // outward: this blocks X → this.endDate+delta <= X.startDate → maxDelta = X.startDate - endDate
  // inward:  X blocks this → X.endDate <= this.startDate+delta → minDelta = X.endDate - startDate
  function getDependencyDeltaBounds() {
    if (!getIssueDates) return { minDelta: -Infinity, maxDelta: Infinity };
    const links = fields.issuelinks || [];
    let minDelta = -Infinity, maxDelta = Infinity;
    for (const link of links) {
      if (link.type?.name !== 'Blocks') continue;
      if (link.outwardIssue) {
        // this blocks outwardIssue — this must end before outwardIssue starts
        const dates = getIssueDates(link.outwardIssue.key);
        if (dates?.startDate) {
          const limit = daysBetween(endDate, parseDate(dates.startDate)); // how many days end can move right
          if (limit < maxDelta) maxDelta = limit;
        }
      }
      if (link.inwardIssue) {
        // inwardIssue blocks this — this must start after inwardIssue ends
        const dates = getIssueDates(link.inwardIssue.key);
        if (dates?.endDate) {
          const limit = daysBetween(startDate, parseDate(dates.endDate)); // how many days start can move left (negative = must go right)
          if (limit > minDelta) minDelta = limit;
        }
      }
    }
    return { minDelta, maxDelta };
  }

  // ── Move drag ─────────────────────────────────────────────────────────────
  function handleDragMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    didDragRef.current = false;
    setShowTooltip(false);
    const startX = e.clientX;
    let delta = 0;

    const { minDelta, maxDelta } = getDependencyDeltaBounds();
    onDragStart && onDragStart();
    const onMove = (ev) => {
      if (Math.abs(ev.clientX - startX) > 4) didDragRef.current = true;
      const raw = Math.round((ev.clientX - startX) / dayWidth);
      const clamped = Math.max(minDelta, Math.min(maxDelta, raw));
      if (clamped !== delta) { delta = clamped; setIsDragging(true); setDragDelta(delta); }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      onDragEnd && onDragEnd();
      setIsDragging(false);
      setDragDelta(0);
      if (didDragRef.current && delta !== 0 && onUpdate) {
        setHoldMoveDelta(delta);
        onUpdate(key, fmtISODate(addDays(startDate, delta)), fmtISODate(addDays(endDate, delta)));
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Right-edge resize (due date) ──────────────────────────────────────────
  function handleResizeEndMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    setShowTooltip(false);
    const startX = e.clientX;
    let delta = 0, moved = false;

    const { maxDelta: maxEndDelta } = getDependencyDeltaBounds();
    const onMove = (ev) => {
      const raw = Math.round((ev.clientX - startX) / dayWidth);
      if (Math.abs(ev.clientX - startX) > 4) moved = true;
      const clamped = Math.min(maxEndDelta, raw);
      if (clamped !== delta) { delta = clamped; setIsResizingEnd(true); setResizeEndDelta(delta); }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setIsResizingEnd(false);
      setResizeEndDelta(0);
      if (moved && delta !== 0 && onUpdate) {
        const newEnd = addDays(endDate, delta);
        if (newEnd > startDate) {
          setHoldEndDelta(delta);
          onUpdate(key, fmtISODate(startDate), fmtISODate(newEnd));
        }
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Left-edge resize (start date) ─────────────────────────────────────────
  function handleResizeStartMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    setShowTooltip(false);
    const startX = e.clientX;
    let delta = 0, moved = false;

    const { minDelta: minStartDelta } = getDependencyDeltaBounds();
    const onMove = (ev) => {
      const raw = Math.round((ev.clientX - startX) / dayWidth);
      if (Math.abs(ev.clientX - startX) > 4) moved = true;
      const clamped = Math.max(minStartDelta, raw);
      if (clamped !== delta) { delta = clamped; setIsResizingStart(true); setResizeStartDelta(delta); }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setIsResizingStart(false);
      setResizeStartDelta(0);
      if (moved && delta !== 0 && onUpdate) {
        const newStart = addDays(startDate, delta);
        if (newStart < endDate) {
          setHoldStartDelta(delta);
          onUpdate(key, fmtISODate(newStart), fmtISODate(endDate));
        }
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function openPreview(rect) {
    clearTimeout(hideTimerRef.current);
    setTooltipPos({ x: rect.left, y: rect.bottom + 6 });
    setShowTooltip(true);
  }

  function scheduleHide() {
    hideTimerRef.current = setTimeout(() => setShowTooltip(false), 200);
  }

  function handleClick(e) {
    if (didDragRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      openPreview(rect);
    }, 220);
  }

  function handleDoubleClick() {
    if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null; }
    setShowTooltip(false);
    router.open(`/browse/${key}`);
  }

  return (
    <>
      <div
        data-issue-key={key}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onMouseEnter={() => { setHovered(true); clearTimeout(hideTimerRef.current); }}
        onMouseLeave={() => { setHovered(false); scheduleHide(); }}
        onMouseDown={handleDragMouseDown}
        style={{
          position: 'absolute',
          left: barLeft, top: barPadding,
          width: barWidth, height: barHeight,
          background: barBg,
          border: isUnscheduled
            ? `1.5px dashed ${barBorder}`
            : isCritical ? `1.5px solid ${C.critical}` : `1px solid ${barBorder}35`,
          borderLeft: isUnscheduled
            ? `1.5px dashed ${barBorder}`
            : isCritical ? `1.5px solid ${C.critical}` : `3px solid ${barBorder}`,
          borderRadius: overflowLeft ? '0 4px 4px 0' : overflowRight ? '4px 0 0 4px' : '4px',
          cursor: isDragging ? 'grabbing' : 'grab',
          display: 'flex', alignItems: 'center',
          paddingLeft: showHandles && !overflowLeft ? '16px' : (overflowLeft ? '6px' : '8px'),
          paddingRight: showHandles && !overflowRight ? '14px' : (overflowRight ? '6px' : '8px'),
          overflow: 'hidden',
          zIndex: active ? 10 : 2,
          boxSizing: 'border-box', userSelect: 'none',
          opacity: isUnscheduled ? (active ? 0.9 : 0.65) : (active ? 0.85 : 1),
          boxShadow: active ? '0 6px 20px rgba(0,0,0,0.2)' : '0 1px 2px rgba(0,0,0,0.08)',
          transition: active ? 'none' : 'box-shadow 0.15s ease, opacity 0.1s ease',
        }}
      >
        {/* Done overlay */}
        {status === 'Done' && (
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.2)', pointerEvents: 'none', borderRadius: 'inherit' }} />
        )}
        {overflowLeft && <span style={{ color: barText, marginRight: 3, fontSize: 10, opacity: 0.7 }}>‹</span>}
        {isUnscheduled && <span style={{ fontSize: 11, marginRight: 4, flexShrink: 0, opacity: 0.8 }}>⏱</span>}
        <span style={{ fontSize: '10px', fontWeight: 500, color: barText, fontFamily: T.mono, letterSpacing: 0.2, whiteSpace: 'nowrap', marginRight: 5, flexShrink: 0, lineHeight: '16px', opacity: 0.7 }}>
          {key}
        </span>
        <span style={{ fontSize: '10.5px', fontWeight: 500, color: barText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
          {isUnscheduled ? 'No date — drag to schedule' : summary}
        </span>
        {overflowRight && <span style={{ color: barText, marginLeft: 3, fontSize: 10, opacity: 0.7 }}>›</span>}
        {/* Blocked chip */}
        {(status === 'Blocked' || status === 'BLOCKED') && (
          <span style={{
            fontSize: 9, fontWeight: 700, background: C.critical, color: '#fff',
            padding: '1px 5px', borderRadius: 2,
            position: 'absolute', right: 4,
            pointerEvents: 'none',
          }}>BLOCKED</span>
        )}

        {/* Left resize handle */}
        {showHandles && (
          <div
            onMouseDown={handleResizeStartMouseDown}
            onMouseEnter={(e) => e.stopPropagation()}
            title="Drag to change start date"
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: '12px',
              cursor: 'ew-resize', borderRadius: '6px 0 0 6px',
              background: barBorder + '40', zIndex: 3,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <GripDots color={barBorder} />
          </div>
        )}

        {/* Right resize handle */}
        {showHandles && (
          <div
            onMouseDown={handleResizeEndMouseDown}
            onMouseEnter={(e) => e.stopPropagation()}
            title="Drag to change due date"
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: '12px',
              cursor: 'ew-resize', borderRadius: '0 6px 6px 0',
              background: barBorder + '40', zIndex: 3,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <GripDots color={barBorder} />
          </div>
        )}

        {/* Left connection dot — drag to mark this issue as blocked by another */}
        {hovered && !active && !overflowLeft && onLinkDragStart && (
          <div
            onMouseDown={(e) => {
              e.stopPropagation(); e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              onLinkDragStart(key, 'inward', r.left + r.width / 2, r.top + r.height / 2);
            }}
            onMouseEnter={(e) => e.stopPropagation()}
            title="Drag to mark this issue as blocked by another"
            style={{
              position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)',
              width: 12, height: 12, borderRadius: '50%',
              background: '#6B778C', border: '2px solid #fff',
              cursor: 'crosshair', zIndex: 20,
              boxShadow: '0 0 0 2px #6B778C44',
            }}
          />
        )}

        {/* Right connection dot — drag to mark this issue as blocking another */}
        {hovered && !active && !overflowRight && onLinkDragStart && (
          <div
            onMouseDown={(e) => {
              e.stopPropagation(); e.preventDefault();
              const r = e.currentTarget.getBoundingClientRect();
              onLinkDragStart(key, 'outward', r.left + r.width / 2, r.top + r.height / 2);
            }}
            onMouseEnter={(e) => e.stopPropagation()}
            title="Drag to mark this issue as blocking another"
            style={{
              position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)',
              width: 12, height: 12, borderRadius: '50%',
              background: '#0073ea', border: '2px solid #fff',
              cursor: 'crosshair', zIndex: 20,
              boxShadow: '0 0 0 2px #0073ea44',
            }}
          />
        )}
      </div>

      {showTooltip && !active && (
        <Tooltip
          issue={issue}
          x={tooltipPos.x} y={tooltipPos.y}
          startDate={startDate} endDate={endDate}
          status={status} priority={priority} assignee={assignee}
          statusColor={statusColor}
          previewFields={previewFields}
          availableFields={availableFields}
          sdf={sdf} edf={edf}
          onMouseEnter={() => clearTimeout(hideTimerRef.current)}
          onMouseLeave={scheduleHide}
          onDeleteLink={onDeleteLink}
          onFieldUpdate={onFieldUpdate}
        />
      )}
    </>
  );
}

const BUILTIN_FIELD_LABELS = {
  summary: 'Summary', status: 'Status', assignee: 'Assignee', priority: 'Priority',
  issuetype: 'Type', labels: 'Labels', duedate: 'Due Date', customfield_10015: 'Start Date',
  reporter: 'Reporter', resolution: 'Resolution', project: 'Project',
};

function renderFieldValue(fieldId, fields, statusColor, startDate, endDate, sdf, edf) {
  if (fieldId === 'summary') return null; // shown in title
  if (fieldId === 'status') {
    const s = fields.status?.name || '—';
    return <span style={{ background: statusColor.bg, color: statusColor.text, border: `1px solid ${statusColor.border}`, borderRadius: '4px', padding: '1px 6px', fontSize: '11px', fontWeight: 600 }}>{s}</span>;
  }
  if (fieldId === 'priority') {
    const p = fields.priority?.name || '—';
    return <>{PRIORITY_ICON[p] || '·'} {p}</>;
  }
  if (fieldId === sdf || fieldId === 'customfield_10015') return fmtDate(startDate);
  if (fieldId === edf  || fieldId === 'duedate')          return fmtDate(endDate);
  if (fieldId === 'assignee') return fields.assignee?.displayName || 'Unassigned';
  if (fieldId === 'reporter') return fields.reporter?.displayName || '—';
  if (fieldId === 'project')  return fields.project?.name || '—';
  if (fieldId === 'issuetype') return fields.issuetype?.name || '—';
  if (fieldId === 'resolution') return fields.resolution?.name || '—';
  if (fieldId === 'labels') {
    const labels = fields.labels || [];
    if (!labels.length) return '—';
    return labels.join(', ');
  }
  // Generic fallback
  const v = fields[fieldId];
  if (v == null) return '—';
  if (typeof v === 'string') return v || '—';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return v.map(x => (typeof x === 'string' ? x : x?.displayName || x?.name || x?.value)).filter(Boolean).join(', ') || '—';
  return v.displayName || v.name || v.value || '—';
}

function getEditorType(fieldId, availableFields) {
  if (fieldId === 'priority') return 'priority';
  if (fieldId === 'labels') return 'labels';
  if (fieldId === 'status') return 'status';
  if (fieldId === 'customfield_10015' || fieldId === 'duedate') return 'date';
  if (fieldId === 'assignee' || fieldId === 'reporter' || fieldId === 'issuetype' || fieldId === 'project' || fieldId === 'resolution') return null;
  const f = availableFields?.find(f => f.id === fieldId);
  const type = f?.schemaType || f?.schema?.type;
  if (type === 'date' || type === 'datetime') return 'date';
  if (type === 'string') return 'text';
  if (type === 'number') return 'number';
  return null;
}

function EditableRow({ fieldId, issueKey, fields, sdf, edf, statusColor, startDate, endDate, availableFields, wide, label, onFieldSaved }) {
  const [editing, setEditing] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [draft, setDraft] = useState('');
  const [transitions, setTransitions] = useState([]);
  const editorType = getEditorType(fieldId, availableFields);

  async function startEdit(e) {
    e.stopPropagation();
    if (!editorType) return;
    if (fieldId === 'status') {
      const trans = await invoke('getIssueTransitions', { key: issueKey });
      setTransitions(trans || []);
    } else if (fieldId === 'priority') {
      setDraft(fields.priority?.name || 'Medium');
    } else if (fieldId === 'labels') {
      setDraft((fields.labels || []).join(' '));
    } else if (fieldId === sdf || fieldId === 'customfield_10015') {
      setDraft(fields[sdf] || '');
    } else if (fieldId === edf || fieldId === 'duedate') {
      setDraft(fields[edf] || '');
    } else {
      const v = fields[fieldId];
      setDraft(v != null ? String(v) : '');
    }
    setEditing(true);
  }

  async function save(e) {
    e?.stopPropagation();
    setEditing(false);
    let value;
    if (fieldId === 'priority') value = { name: draft };
    else if (fieldId === 'labels') value = draft.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    else value = draft || null;
    onFieldSaved && onFieldSaved(fieldId, value);
    await invoke('updateIssueField', { key: issueKey, fieldId, value });
  }

  async function applyTransition(e, transitionId, toName) {
    e.stopPropagation();
    setEditing(false);
    onFieldSaved && onFieldSaved('status', { name: toName });
    await invoke('transitionIssue', { key: issueKey, transitionId });
  }

  const readVal = renderFieldValue(fieldId, fields, statusColor, startDate, endDate, sdf, edf);
  if (readVal === null) return null;

  return (
    <div
      style={{ gridColumn: wide ? '1 / -1' : 'auto' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#c3c6d4', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.5px', display: 'flex', alignItems: 'center', gap: '3px' }}>
        {label}
        {editorType && hovered && !editing && (
          <span onClick={startEdit} style={{ cursor: 'pointer', opacity: 0.6, fontSize: '10px' }} title="Edit">✏</span>
        )}
      </div>
      {editing ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
          {fieldId === 'status' ? (
            transitions.length === 0
              ? <span style={{ fontSize: '11px', color: '#97A0AF' }}>Loading…</span>
              : transitions.map(t => (
                <button key={t.id} onClick={(e) => applyTransition(e, t.id, t.to?.name || t.name)}
                  style={{ background: '#0052CC', color: '#fff', border: 'none', borderRadius: '3px', padding: '2px 7px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}>
                  {t.name}
                </button>
              ))
          ) : fieldId === 'priority' ? (
            <select value={draft} onChange={e => setDraft(e.target.value)} onBlur={save} autoFocus
              style={{ fontSize: '11px', border: '1px solid #0052CC', borderRadius: '3px', padding: '2px 4px', outline: 'none' }}>
              {PRIORITY_OPTIONS.map(p => <option key={p}>{p}</option>)}
            </select>
          ) : (
            <input
              type={editorType === 'date' ? 'date' : editorType === 'number' ? 'number' : 'text'}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(e); if (e.key === 'Escape') { e.stopPropagation(); setEditing(false); } }}
              onBlur={save}
              autoFocus
              style={{ fontSize: '11px', border: '1px solid #0052CC', borderRadius: '3px', padding: '2px 4px', outline: 'none', width: '100%', boxSizing: 'border-box' }}
            />
          )}
          {fieldId !== 'status' && <span onClick={() => setEditing(false)} style={{ cursor: 'pointer', color: '#97A0AF', fontSize: '11px' }}>✕</span>}
        </div>
      ) : (
        <div style={{ fontSize: '12px', color: '#323338', cursor: editorType ? 'pointer' : 'default' }} onClick={editorType ? startEdit : undefined}>
          {readVal}
        </div>
      )}
    </div>
  );
}

function Tooltip({ issue, x, y, startDate, endDate, status, priority, assignee, statusColor, previewFields, availableFields, sdf, edf, onMouseEnter, onMouseLeave, onDeleteLink, onFieldUpdate }) {
  const [localFields, setLocalFields] = useState(issue.fields);
  const { key } = issue;
  const safeX = Math.min(x, window.innerWidth - 290);
  const safeY = Math.min(y, window.innerHeight - 320);

  const fieldsToShow = previewFields?.length
    ? previewFields.filter(f => f !== 'summary')
    : ['status', 'priority', sdf, edf, 'assignee'];

  function getLabel(fieldId) {
    return availableFields?.find(f => f.id === fieldId)?.name || BUILTIN_FIELD_LABELS[fieldId] || fieldId;
  }

  function handleFieldSaved(fieldId, value) {
    setLocalFields(prev => ({ ...prev, [fieldId]: value }));
    onFieldUpdate && onFieldUpdate(key, fieldId, value);
  }

  const blocksLinks = (localFields.issuelinks || []).filter(l => l.type?.name === 'Blocks' && l.outwardIssue);
  const blockedByLinks = (localFields.issuelinks || []).filter(l => l.type?.name === 'Blocks' && l.inwardIssue);
  const recalcStatus = localFields.status?.name || status;
  const recalcStatusColor = { ...statusColor, ...(BUILTIN_STATUS_COLORS[recalcStatus] || {}) };

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onClick={e => e.stopPropagation()}
      style={{
        position: 'fixed', left: safeX, top: safeY, width: 290,
        background: '#fff', border: '1px solid #e6e9ef', borderRadius: '8px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        zIndex: 9999, padding: '14px', pointerEvents: 'auto', fontSize: '12px', color: '#323338',
        maxHeight: '80vh', overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <span style={{ background: '#dce5ff', color: '#0060b9', borderRadius: '4px', padding: '2px 7px', fontWeight: 700, fontSize: '11px' }}>{key}</span>
        <span style={{ color: '#6B778C', fontSize: '11px', flex: 1 }}>{localFields.project?.name || ''}</span>
      </div>
      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '10px', lineHeight: '1.5', color: '#323338' }}>{localFields.summary}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 10px' }}>
        {fieldsToShow.map(fieldId => {
          const wide = fieldId === 'assignee' || fieldId === 'reporter' || fieldId === 'labels' || fieldId === 'project';
          return (
            <EditableRow
              key={fieldId}
              fieldId={fieldId}
              issueKey={key}
              fields={localFields}
              sdf={sdf} edf={edf}
              statusColor={recalcStatusColor}
              startDate={startDate} endDate={endDate}
              availableFields={availableFields}
              wide={wide}
              label={getLabel(fieldId)}
              onFieldSaved={handleFieldSaved}
            />
          );
        })}
      </div>
      {(blocksLinks.length > 0 || blockedByLinks.length > 0) && (
        <div style={{ marginTop: '10px', borderTop: '1px solid #F4F5F7', paddingTop: '8px' }}>
          {blocksLinks.length > 0 && <>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#c3c6d4', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Blocks</div>
            {blocksLinks.map(l => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                <span style={{ background: '#ffe1e1', color: '#bf2040', borderRadius: '3px', padding: '1px 5px', fontSize: '11px', fontWeight: 600 }}>{l.outwardIssue.key}</span>
                <span style={{ flex: 1, fontSize: '11px', color: '#42526E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.outwardIssue.fields?.summary || ''}</span>
                {onDeleteLink && <button onClick={(e) => { e.stopPropagation(); onDeleteLink(l.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#97A0AF', fontSize: '12px', padding: '0 2px', lineHeight: 1 }} title="Remove">✕</button>}
              </div>
            ))}
          </>}
          {blockedByLinks.length > 0 && <>
            <div style={{ fontSize: '10px', fontWeight: 700, color: '#c3c6d4', marginBottom: '4px', marginTop: blocksLinks.length ? '6px' : 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Blocked by</div>
            {blockedByLinks.map(l => (
              <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '3px' }}>
                <span style={{ background: '#fff3c7', color: '#8a6800', borderRadius: '3px', padding: '1px 5px', fontSize: '11px', fontWeight: 600 }}>{l.inwardIssue.key}</span>
                <span style={{ flex: 1, fontSize: '11px', color: '#42526E', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.inwardIssue.fields?.summary || ''}</span>
                {onDeleteLink && <button onClick={(e) => { e.stopPropagation(); onDeleteLink(l.id); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#97A0AF', fontSize: '12px', padding: '0 2px', lineHeight: 1 }} title="Remove">✕</button>}
              </div>
            ))}
          </>}
        </div>
      )}
      <div style={{ marginTop: '8px', fontSize: '11px', color: '#97A0AF' }}>Click a field to edit · Double-click bar to open in Jira</div>
    </div>
  );
}

const BUILTIN_STATUS_COLORS = {
  'To Do':       { bg: '#f4f5f7', text: '#676879', border: '#c1c7d0' },
  'In Progress': { bg: '#dce5ff', text: '#0060b9', border: '#0073ea' },
  'In Review':   { bg: '#f0dcff', text: '#7c3aad', border: '#a25ddc' },
  'Review':      { bg: '#f0dcff', text: '#7c3aad', border: '#a25ddc' },
  'Done':        { bg: '#dcf5e7', text: '#007a44', border: '#00c875' },
  'Canceled':    { bg: '#f4f5f7', text: '#c1c7d0', border: '#e6e9ef' },
  'Blocked':     { bg: '#ffe1e1', text: '#bf2040', border: '#e2445c' },
};
