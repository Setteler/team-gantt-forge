import React, { useState, useEffect, useRef, useCallback } from 'react';

const EVENT_STYLES = {
  vacation: { bg: '#E3FCEF', border: '#00875A', text: '#006644', label: '🏖️ Vacation' },
  oncall:   { bg: '#EAE6FF', border: '#5243AA', text: '#403294', label: '🔔 On-Call' },
  ooo:      { bg: '#FFEBE6', border: '#DE350B', text: '#BF2600', label: 'OOO' },
  custom:   { bg: '#F4F5F7', border: '#97A0AF', text: '#42526E', label: 'Event' },
};

function getEventStyle(type, title) {
  const s = EVENT_STYLES[type] || EVENT_STYLES.custom;
  if (type === 'custom' && title) return { ...s, label: title };
  return s;
}

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(a, b) {
  return Math.round((b - a) / 86400000);
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

function fmtDate(date) {
  if (!date) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

function GripDots({ color }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', alignItems: 'center', justifyContent: 'center', height: '100%', pointerEvents: 'none' }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: color, opacity: 0.8 }} />
      ))}
    </div>
  );
}

export default function EventBar({ event, viewStart, dayWidth, rowHeight, barPadding, totalDays, onEdit, onDelete, onUpdate }) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  // Live drag/resize deltas (while mouse is held)
  const [isDragging, setIsDragging] = useState(false);
  const [dragDelta, setDragDelta] = useState(0);
  const [isResizingEnd, setIsResizingEnd] = useState(false);
  const [resizeEndDelta, setResizeEndDelta] = useState(0);
  const [isResizingStart, setIsResizingStart] = useState(false);
  const [resizeStartDelta, setResizeStartDelta] = useState(0);

  // Hold deltas after mouse-up to prevent flicker while parent async-saves
  const [holdMoveDelta, setHoldMoveDelta] = useState(0);
  const [holdEndDelta, setHoldEndDelta] = useState(0);
  const [holdStartDelta, setHoldStartDelta] = useState(0);

  const hideTimerRef = useRef(null);
  const didDragRef   = useRef(false);

  // When parent confirms the new dates (props update), clear hold deltas
  useEffect(() => {
    setHoldMoveDelta(0);
    setHoldEndDelta(0);
    setHoldStartDelta(0);
  }, [event.startDate, event.endDate]);

  let startDate = parseDate(event.startDate);
  let endDate = parseDate(event.endDate);

  if (startDate && !endDate) endDate = addDays(startDate, 1);
  else if (!startDate && endDate) startDate = endDate;
  else if (!startDate && !endDate) {
    const ref = new Date();
    startDate = ref;
    endDate = addDays(ref, 1);
  }

  const baseStartOffset = daysBetween(viewStart, startDate);
  const baseEndOffset   = daysBetween(viewStart, endDate) + 1;

  const active = isDragging || isResizingEnd || isResizingStart;

  // Compose effective deltas: live (while dragging) or held (after drop, before parent confirms)
  const effectiveMove  = isDragging     ? dragDelta      : holdMoveDelta;
  const effectiveEnd   = isResizingEnd  ? resizeEndDelta : holdEndDelta;
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
  const barHeight = rowHeight - barPadding * 2;
  const style = getEventStyle(event.type, event.title);
  const showHandles = (hovered || active) && !overflowLeft && !overflowRight;

  // ── Tooltip ──────────────────────────────────────────────────────────────
  function handleBarMouseEnter(e) {
    setHovered(true);
    clearTimeout(hideTimerRef.current);
    if (!active) {
      const rect = e.currentTarget.getBoundingClientRect();
      setTooltipPos({ x: rect.left, y: rect.bottom + 6 });
      setShowTooltip(true);
    }
  }

  function handleBarMouseLeave() {
    setHovered(false);
    hideTimerRef.current = setTimeout(() => setShowTooltip(false), 180);
  }

  // ── Move drag ─────────────────────────────────────────────────────────────
  function handleDragMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    setShowTooltip(false);
    didDragRef.current = false;
    const startX = e.clientX;
    let delta = 0, moved = false;

    const onMove = (ev) => {
      const raw = Math.round((ev.clientX - startX) / dayWidth);
      if (Math.abs(ev.clientX - startX) > 8) { moved = true; didDragRef.current = true; }
      if (raw !== delta) { delta = raw; setIsDragging(true); setDragDelta(delta); }
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setIsDragging(false);
      setDragDelta(0);
      if (moved && delta !== 0 && onUpdate) {
        setHoldMoveDelta(delta); // hold visually until parent confirms
        onUpdate(event, fmtISODate(addDays(startDate, delta)), fmtISODate(addDays(endDate, delta)));
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Right-edge resize (end date) ──────────────────────────────────────────
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
          onUpdate(event, fmtISODate(startDate), fmtISODate(newEnd));
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
          onUpdate(event, fmtISODate(newStart), fmtISODate(endDate));
        }
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <>
      <div
        onMouseEnter={handleBarMouseEnter}
        onMouseLeave={handleBarMouseLeave}
        onMouseDown={handleDragMouseDown}
        onClick={() => { if (!didDragRef.current && onEdit) onEdit(event); }}
        style={{
          position: 'absolute',
          left: barLeft, top: barPadding,
          width: barWidth, height: barHeight,
          background: style.bg,
          border: `1.5px solid ${style.border}`,
          borderRadius: overflowLeft ? '0 6px 6px 0' : overflowRight ? '6px 0 0 6px' : '6px',
          display: 'flex', alignItems: 'center',
          paddingLeft: showHandles && !overflowLeft ? '14px' : '8px',
          paddingRight: showHandles && !overflowRight ? '14px' : '8px',
          overflow: 'hidden',
          zIndex: active ? 10 : 2,
          boxSizing: 'border-box', userSelect: 'none',
          cursor: isDragging ? 'grabbing' : 'grab',
          opacity: active ? 0.82 : 0.92,
          boxShadow: active ? '0 4px 14px rgba(0,0,0,0.22)' : 'none',
          transition: active ? 'none' : 'box-shadow 0.15s',
        }}
      >
        {overflowLeft && <span style={{ color: style.text, marginRight: 3, fontSize: 10, opacity: 0.7 }}>‹</span>}
        <span style={{ fontSize: '11px', fontWeight: 600, color: style.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, textAlign: 'center' }}>
          {style.label}
        </span>
        {overflowRight && <span style={{ color: style.text, marginLeft: 3, fontSize: 10, opacity: 0.7 }}>›</span>}

        {/* Left resize handle */}
        {showHandles && (
          <div
            onMouseDown={handleResizeStartMouseDown}
            onMouseEnter={(e) => { e.stopPropagation(); clearTimeout(hideTimerRef.current); }}
            title="Drag to change start date"
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: '12px',
              cursor: 'ew-resize', borderRadius: '6px 0 0 6px',
              background: style.border + '40', zIndex: 3,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <GripDots color={style.border} />
          </div>
        )}

        {/* Right resize handle */}
        {showHandles && (
          <div
            onMouseDown={handleResizeEndMouseDown}
            onMouseEnter={(e) => { e.stopPropagation(); clearTimeout(hideTimerRef.current); }}
            title="Drag to change end date"
            style={{
              position: 'absolute', right: 0, top: 0, bottom: 0, width: '12px',
              cursor: 'ew-resize', borderRadius: '0 6px 6px 0',
              background: style.border + '40', zIndex: 3,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <GripDots color={style.border} />
          </div>
        )}
      </div>

      {showTooltip && !active && (
        <EventTooltip
          event={event}
          style={style}
          startDate={startDate}
          endDate={endDate}
          x={tooltipPos.x}
          y={tooltipPos.y}
          onEdit={onEdit}
          onDelete={onDelete}
          onClose={() => setShowTooltip(false)}
          onMouseEnter={() => clearTimeout(hideTimerRef.current)}
          onMouseLeave={() => setShowTooltip(false)}
        />
      )}
    </>
  );
}

function EventTooltip({ event, style, startDate, endDate, x, y, onEdit, onDelete, onClose, onMouseEnter, onMouseLeave }) {
  const [confirming, setConfirming] = useState(false);
  const safeX = Math.min(x, window.innerWidth - 260);
  const safeY = Math.min(y, window.innerHeight - 180);

  // Find the best groupValues display — first non-empty value
  const groupPairs = Object.entries(event.groupValues || {});
  const g1 = groupPairs[0]?.[1] || event.squad || event.developer || '';
  const g2 = groupPairs[1]?.[1] || (groupPairs[0]?.[1] ? '' : event.developer) || '';

  return (
    <div
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed', left: safeX, top: safeY, width: 240,
        background: '#fff', border: '1px solid #DFE1E6', borderRadius: '6px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)', zIndex: 9999,
        padding: '12px', fontSize: '12px', color: '#172B4D', pointerEvents: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: event.summary ? '4px' : '8px' }}>
        <span style={{ background: style.bg, color: style.text, border: `1px solid ${style.border}`, borderRadius: '4px', padding: '2px 8px', fontWeight: 700, fontSize: '12px' }}>
          {style.label}
        </span>
      </div>
      {event.summary && (
        <div style={{ fontSize: '12px', color: '#172B4D', marginBottom: '8px', fontStyle: 'italic' }}>{event.summary}</div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '10px' }}>
        {g1 && <div>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#97A0AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Group</div>
          <div style={{ fontSize: '12px', marginTop: '2px' }}>{g1}</div>
        </div>}
        {g2 && <div>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#97A0AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Sub-group</div>
          <div style={{ fontSize: '12px', marginTop: '2px' }}>{g2}</div>
        </div>}
        <div>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#97A0AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>Start</div>
          <div style={{ fontSize: '12px', marginTop: '2px' }}>{fmtDate(startDate)}</div>
        </div>
        <div>
          <div style={{ fontSize: '10px', fontWeight: 600, color: '#97A0AF', textTransform: 'uppercase', letterSpacing: '0.4px' }}>End</div>
          <div style={{ fontSize: '12px', marginTop: '2px' }}>{fmtDate(endDate)}</div>
        </div>
      </div>

      {confirming ? (
        <div style={{ background: '#FFEBE6', borderRadius: '4px', padding: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#BF2600', marginBottom: '6px' }}>Delete this event?</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              style={{ flex: 1, background: '#DE350B', color: '#fff', border: 'none', borderRadius: '4px', padding: '5px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); onClose?.(); onDelete?.(event.id); }}
            >Yes, delete</button>
            <button
              style={{ flex: 1, background: '#fff', color: '#42526E', border: '1px solid #DFE1E6', borderRadius: '4px', padding: '5px 8px', cursor: 'pointer', fontSize: '11px' }}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); setConfirming(false); }}
            >Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            style={{ flex: 1, background: '#DEEBFF', color: '#0052CC', border: 'none', borderRadius: '4px', padding: '5px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onClose?.(); onEdit?.(event); }}
          >✏ Edit</button>
          <button
            style={{ flex: 1, background: '#FFEBE6', color: '#DE350B', border: 'none', borderRadius: '4px', padding: '5px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: 600 }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); setConfirming(true); }}
          >🗑 Delete</button>
        </div>
      )}
    </div>
  );
}
