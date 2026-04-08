import React, { useState, useEffect, useRef } from 'react';
import { router } from '@forge/bridge';

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

export default function GanttBar({ issue, viewStart, dayWidth, rowHeight, barPadding, totalDays, squadColor, onUpdate, startDateField, endDateField, onPreview, previewFields, availableFields }) {
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

  let startDate = parseDate(fields[sdf]);
  let endDate   = parseDate(fields[edf]);

  if (startDate && !endDate) endDate = addDays(startDate, 7);
  else if (!startDate && endDate) startDate = addDays(endDate, -7);
  else if (!startDate && !endDate) {
    const ref = new Date();
    startDate = addDays(ref, -3);
    endDate   = addDays(ref, 3);
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
  const barBg     = squadColor ? squadColor.bg     : statusColor.bg;
  const barBorder = squadColor ? squadColor.border : statusColor.border;
  const barText   = squadColor ? squadColor.text   : statusColor.text;
  const showHandles = (hovered || active) && !overflowLeft && !overflowRight;

  // ── Move drag ─────────────────────────────────────────────────────────────
  function handleDragMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    didDragRef.current = false;
    setShowTooltip(false);
    const startX = e.clientX;
    let delta = 0;

    const onMove = (ev) => {
      if (Math.abs(ev.clientX - startX) > 4) didDragRef.current = true;
      const raw = Math.round((ev.clientX - startX) / dayWidth);
      if (raw !== delta) { delta = raw; setIsDragging(true); setDragDelta(delta); }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
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

    const onMove = (ev) => {
      const raw = Math.round((ev.clientX - startX) / dayWidth);
      if (Math.abs(ev.clientX - startX) > 4) moved = true;
      if (raw !== delta) { delta = raw; setIsResizingEnd(true); setResizeEndDelta(delta); }
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

    const onMove = (ev) => {
      const raw = Math.round((ev.clientX - startX) / dayWidth);
      if (Math.abs(ev.clientX - startX) > 4) moved = true;
      if (raw !== delta) { delta = raw; setIsResizingStart(true); setResizeStartDelta(delta); }
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
    // Capture rect before timer (React clears synthetic events)
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
    router.navigate(`/browse/${key}`);
  }

  return (
    <>
      <div
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
          border: `1px solid ${barBorder}35`,
          borderLeft: `3px solid ${barBorder}`,
          borderRadius: overflowLeft ? '0 6px 6px 0' : overflowRight ? '6px 0 0 6px' : '6px',
          cursor: isDragging ? 'grabbing' : 'grab',
          display: 'flex', alignItems: 'center',
          paddingLeft: showHandles && !overflowLeft ? '16px' : (overflowLeft ? '6px' : '8px'),
          paddingRight: showHandles && !overflowRight ? '14px' : (overflowRight ? '6px' : '8px'),
          overflow: 'hidden',
          zIndex: active ? 10 : 2,
          boxSizing: 'border-box', userSelect: 'none',
          opacity: active ? 0.85 : 1,
          boxShadow: active ? '0 6px 20px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04)',
          transition: active ? 'none' : 'box-shadow 0.15s ease, opacity 0.1s ease',
        }}
      >
        {overflowLeft && <span style={{ color: barText, marginRight: 3, fontSize: 10, opacity: 0.7 }}>‹</span>}
        <span style={{ fontSize: '10px', fontWeight: 700, color: barText, background: barBorder + '25', borderRadius: '3px', padding: '0 4px', whiteSpace: 'nowrap', marginRight: 5, flexShrink: 0, lineHeight: '16px' }}>
          {key}
        </span>
        <span style={{ fontSize: '11px', fontWeight: 600, color: barText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
          {summary}
        </span>
        {overflowRight && <span style={{ color: barText, marginLeft: 3, fontSize: 10, opacity: 0.7 }}>›</span>}

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

function Tooltip({ issue, x, y, startDate, endDate, status, priority, assignee, statusColor, previewFields, availableFields, sdf, edf, onMouseEnter, onMouseLeave }) {
  const { key, fields } = issue;
  const safeX = Math.min(x, window.innerWidth - 290);
  const safeY = Math.min(y, window.innerHeight - 220);

  // Use configured previewFields, or fall back to default set
  const fieldsToShow = previewFields?.length
    ? previewFields.filter(f => f !== 'summary')
    : ['status', 'priority', sdf, edf, 'assignee'];

  function getLabel(fieldId) {
    return availableFields?.find(f => f.id === fieldId)?.name || BUILTIN_FIELD_LABELS[fieldId] || fieldId;
  }

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed', left: safeX, top: safeY, width: 280,
        background: '#fff', border: '1px solid #e6e9ef', borderRadius: '8px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.06)',
        zIndex: 9999, padding: '14px', pointerEvents: 'auto', fontSize: '12px', color: '#323338',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <span style={{ background: '#dce5ff', color: '#0060b9', borderRadius: '4px', padding: '2px 7px', fontWeight: 700, fontSize: '11px' }}>{key}</span>
        <span style={{ color: '#6B778C', fontSize: '11px', flex: 1 }}>{fields.project?.name || ''}</span>
      </div>
      <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '10px', lineHeight: '1.5', color: '#323338' }}>{fields.summary}</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
        {fieldsToShow.map(fieldId => {
          const value = renderFieldValue(fieldId, fields, statusColor, startDate, endDate, sdf, edf);
          if (value === null) return null;
          const isWide = fieldId === 'assignee' || fieldId === 'reporter' || fieldId === 'labels' || fieldId === 'project';
          return (
            <TF key={fieldId} label={getLabel(fieldId)} wide={isWide}>{value}</TF>
          );
        })}
      </div>
      <div style={{ marginTop: '8px', fontSize: '11px', color: '#97A0AF' }}>Double-click to open in Jira</div>
    </div>
  );
}

function TF({ label, children, wide }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : 'auto' }}>
      <div style={{ fontSize: '10px', fontWeight: 700, color: '#c3c6d4', marginBottom: '3px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{label}</div>
      <div style={{ fontSize: '12px', color: '#323338' }}>{children}</div>
    </div>
  );
}
