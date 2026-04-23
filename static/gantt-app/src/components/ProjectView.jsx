import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { router } from '@forge/bridge';

const NAME_COL_WIDTH     = 340; // fixed — Name never collapses
const FIELD_COL_WIDTH    = 140; // fixed per-field
const TREE_WIDTH_DEFAULT = 600; // viewport width of the whole table before timeline
const TREE_WIDTH_MIN     = 260; // can shrink until just Name is visible
const TREE_WIDTH_MAX     = 1600;
const DAY_WIDTH     = 38;
const ROW_HEIGHT    = 32;
const HEADER_HEIGHT = 62;

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, n) {
  const d = new Date(date); d.setDate(d.getDate() + n); return d;
}

function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

function fmtISODate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getParentKey(issue) {
  const parent = issue.fields?.parent;
  if (parent?.key) return parent.key;
  const epicLink = issue.fields?.customfield_10014;
  if (typeof epicLink === 'string' && epicLink) return epicLink;
  return null;
}

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtDateShort(str) {
  if (!str) return '';
  const d = parseDate(str);
  if (!d) return str;
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
}
function renderFieldValue(raw) {
  if (raw == null) return '';
  if (typeof raw === 'string') return fmtDateShort(raw) || raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  if (Array.isArray(raw)) return raw.map(v => (typeof v === 'object' ? (v?.name || v?.value || v?.displayName || '') : String(v))).filter(Boolean).join(', ');
  if (typeof raw === 'object') return raw.name || raw.displayName || raw.value || raw.key || '';
  return '';
}

export default function ProjectView({
  issues, today, startDateField, endDateField,
  onUpdateIssue, holidays,
  scrollToTarget, onVisibleMonthChange,
  listFields, availableFields, onListFieldsChange,
}) {
  const bodyRef       = useRef(null);
  const lastMonthRef  = useRef(null);
  const rafScrollRef  = useRef(null);

  const [collapsed, setCollapsed]     = useState(new Set());
  const [selectedKey, setSelectedKey] = useState(null);
  const [hoveredKey, setHoveredKey]   = useState(null);
  const [visRange, setVisRange]       = useState({ from: 0, to: 160 });
  const [treeWidth, setTreeWidth]     = useState(TREE_WIDTH_DEFAULT);
  const [showTimeline, setShowTimeline] = useState(true);
  const [dragFieldId, setDragFieldId] = useState(null);
  const [dropBeforeFieldId, setDropBeforeFieldId] = useState(null);

  const sdf = startDateField || 'customfield_10015';
  const edf = endDateField   || 'duedate';

  // ── Buffer dates ─────────────────────────────────────────────────────────
  const todayYear   = today.getFullYear();
  const bufferStart = useMemo(() => new Date(todayYear - 1, 0, 1), [todayYear]);
  const bufferEnd   = useMemo(() => new Date(todayYear + 3, 0, 0), [todayYear]);
  const totalDays   = daysBetween(bufferStart, bufferEnd) + 1;
  const totalWidth  = totalDays * DAY_WIDTH;
  const todayOff    = daysBetween(bufferStart, today) * DAY_WIDTH;

  // ── Holiday set ──────────────────────────────────────────────────────────
  const holidaySet = useMemo(() => {
    const m = new Map();
    for (const h of (holidays || [])) {
      if (h && h.date) m.set(h.date, h.name || 'Holiday');
    }
    return m;
  }, [holidays]);

  // ── Build tree ───────────────────────────────────────────────────────────
  const { roots, childrenByKey, issueByKey } = useMemo(() => {
    const byKey = {};
    for (const iss of issues) byKey[iss.key] = iss;

    const children = {};
    const hasParentInSet = new Set();

    for (const iss of issues) {
      const pk = getParentKey(iss);
      if (pk && byKey[pk]) {
        hasParentInSet.add(iss.key);
        if (!children[pk]) children[pk] = [];
        children[pk].push(iss.key);
      }
    }

    const rootIssues = issues.filter(iss => !hasParentInSet.has(iss.key));
    return { roots: rootIssues, childrenByKey: children, issueByKey: byKey };
  }, [issues]);

  // ── Rollup dates (recursive, cycle-safe) ─────────────────────────────────
  const rollupCache = useRef({});
  useEffect(() => { rollupCache.current = {}; }, [issues, sdf, edf]);

  function getRollupDates(key, visited) {
    if (visited.has(key)) return { minStart: null, maxEnd: null };
    if (rollupCache.current[key]) return rollupCache.current[key];
    visited.add(key);

    const iss = issueByKey[key];
    let minStart = parseDate(iss?.fields?.[sdf]);
    let maxEnd   = parseDate(iss?.fields?.[edf]);

    const kids = childrenByKey[key] || [];
    for (const ck of kids) {
      const child = getRollupDates(ck, visited);
      if (child.minStart && (!minStart || child.minStart < minStart)) minStart = child.minStart;
      if (child.maxEnd   && (!maxEnd   || child.maxEnd   > maxEnd))   maxEnd   = child.maxEnd;
    }

    const result = { minStart, maxEnd };
    rollupCache.current[key] = result;
    return result;
  }

  // ── Flatten tree into visible rows ───────────────────────────────────────
  const flatRows = useMemo(() => {
    const rows = [];
    function walk(keys, depth, visited) {
      for (const key of keys) {
        if (visited.has(key)) continue;
        const nextVisited = new Set(visited);
        nextVisited.add(key);

        const iss = issueByKey[key];
        if (!iss) continue;

        const kids = childrenByKey[key] || [];
        const hasKids = kids.length > 0;
        const isCollapsed = collapsed.has(key);

        rows.push({ key, depth, hasKids, isCollapsed });

        if (hasKids && !isCollapsed) {
          walk(kids, depth + 1, nextVisited);
        }
      }
    }
    walk(roots.map(r => r.key), 0, new Set());
    return rows;
  }, [roots, childrenByKey, issueByKey, collapsed]);

  // ── Expand/Collapse ──────────────────────────────────────────────────────
  function toggleNode(key) {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function collapseAll() {
    const allParents = new Set();
    for (const k of Object.keys(childrenByKey)) allParents.add(k);
    setCollapsed(allParents);
  }

  function expandAll() {
    setCollapsed(new Set());
  }

  // ── Column drag-and-drop reorder (extra fields only; Name is fixed) ─────
  function handleColDragStart(e, fieldId) {
    setDragFieldId(fieldId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', fieldId);
  }
  function handleColDragOver(e, overFieldId) {
    if (!dragFieldId || dragFieldId === overFieldId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropBeforeFieldId(overFieldId);
  }
  function handleColDrop(e, overFieldId) {
    e.preventDefault();
    if (!dragFieldId || !onListFieldsChange) return;
    const current = [...(listFields || [])];
    const fromIdx = current.indexOf(dragFieldId);
    const toIdx   = current.indexOf(overFieldId);
    if (fromIdx < 0 || toIdx < 0) return;
    current.splice(fromIdx, 1);
    const insertAt = current.indexOf(overFieldId);
    current.splice(insertAt, 0, dragFieldId);
    onListFieldsChange(current);
    setDragFieldId(null);
    setDropBeforeFieldId(null);
  }
  function handleColDragEnd() {
    setDragFieldId(null);
    setDropBeforeFieldId(null);
  }

  // ── Divider drag: split between table (left) and timeline (right) ───────
  function startDividerDrag(e) {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = treeWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    function onMove(ev) {
      const delta = ev.clientX - startX;
      setTreeWidth(Math.max(TREE_WIDTH_MIN, Math.min(TREE_WIDTH_MAX, startWidth + delta)));
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Scroll sync: timeline header ← body horizontal scroll ───────────────
  const handleScroll = useCallback((e) => {
    const sl = e.currentTarget.scrollLeft;
    const cw = e.currentTarget.clientWidth;

    const h = document.getElementById('project-header-scroll');
    if (h) h.scrollLeft = sl;

    if (rafScrollRef.current) cancelAnimationFrame(rafScrollRef.current);
    rafScrollRef.current = requestAnimationFrame(() => {
      const from = Math.max(0, Math.floor(sl / DAY_WIDTH) - 20);
      const to   = Math.min(totalDays - 1, Math.ceil((sl + cw) / DAY_WIDTH) + 20);
      setVisRange({ from, to });

      const visDay = Math.max(0, Math.floor(sl / DAY_WIDTH));
      const d = addDays(bufferStart, visDay);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (key !== lastMonthRef.current) {
        lastMonthRef.current = key;
        onVisibleMonthChange?.(d.getFullYear(), d.getMonth());
      }
    });
  }, [totalDays, bufferStart, onVisibleMonthChange]);

  // Diagonal scroll: intercept wheel events
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      el.scrollLeft += e.deltaX;
      el.scrollTop  += e.deltaY;
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // Scroll to target (navigation arrows / Today button)
  // App.jsx sends `{ today: true }` for the Today button and `{ year, month }`
  // for month-arrow navigation — handle both.
  useEffect(() => {
    if (!scrollToTarget || !bodyRef.current) return;
    let off;
    if (scrollToTarget.today) {
      off = Math.max(0, todayOff - 60);
    } else {
      const focusDate = new Date(scrollToTarget.year, scrollToTarget.month, 1);
      off = Math.max(0, daysBetween(bufferStart, focusDate)) * DAY_WIDTH;
    }
    bodyRef.current.scrollLeft = off;
  }, [scrollToTarget, bufferStart, todayOff]);

  // Scroll to today on initial mount
  useEffect(() => {
    if (!bodyRef.current) return;
    const off = Math.max(0, todayOff - 60);
    bodyRef.current.scrollLeft = off;
    const cw = bodyRef.current.clientWidth;
    const from = Math.max(0, Math.floor(off / DAY_WIDTH) - 20);
    const to   = Math.min(totalDays - 1, Math.ceil((off + cw) / DAY_WIDTH) + 20);
    setVisRange({ from, to });
  }, []);

  // ── Render timeline header ───────────────────────────────────────────────
  function renderTimelineHeader() {
    // Month spans (top row)
    const monthEls = [];
    let mStart = 0, mMo = -1, mYear = -1;
    for (let i = 0; i <= totalDays; i++) {
      const d  = i < totalDays ? addDays(bufferStart, i) : null;
      const mo = d ? d.getMonth() : -1;
      if (mo !== mMo) {
        if (mMo !== -1) {
          monthEls.push(
            <div key={`m-${mStart}`} style={{
              position: 'absolute', left: mStart * DAY_WIDTH, width: (i - mStart) * DAY_WIDTH,
              height: 22, display: 'flex', alignItems: 'center', paddingLeft: 8,
              fontWeight: 700, fontSize: '11px', whiteSpace: 'nowrap',
              color: mYear === today.getFullYear() ? '#323338' : '#c3c6d4',
            }}>
              {MONTH_NAMES[mMo].slice(0, 3)} {mYear !== today.getFullYear() ? mYear : ''}
            </div>
          );
        }
        mMo = mo; mStart = i; mYear = d ? d.getFullYear() : -1;
      }
    }

    // Day cells (bottom row) -- visible range only
    const dayEls = [];
    for (let i = visRange.from; i <= visRange.to && i < totalDays; i++) {
      const d = addDays(bufferStart, i);
      const isToday   = daysBetween(today, d) === 0;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const holidayName = holidaySet.get(fmtISODate(d));
      const isHoliday = !!holidayName;
      dayEls.push(
        <div key={i} title={isHoliday ? holidayName : undefined} style={{
          position: 'absolute', left: i * DAY_WIDTH, width: DAY_WIDTH,
          height: 34, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: isToday ? '#0073ea' : isHoliday ? '#FFE0E6' : 'transparent',
          fontWeight: isToday ? 700 : 400,
          color: isToday ? '#fff' : isHoliday ? '#BF2040' : isWeekend ? '#c3c6d4' : '#676879',
          borderRadius: isToday ? '6px' : isHoliday ? '6px' : '0',
          fontSize: '10px',
        }}>
          <div>{['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()]}</div>
          <div style={{ fontWeight: isToday ? 800 : 600 }}>{d.getDate()}</div>
        </div>
      );
    }

    return (
      <div style={{ position: 'relative', height: HEADER_HEIGHT, width: totalWidth }}>
        <div style={{ position: 'relative', height: 22 }}>{monthEls}</div>
        <div style={{ position: 'relative', height: 34 }}>{dayEls}</div>
      </div>
    );
  }

  // ── Weekend shading (memoized) ───────────────────────────────────────────
  const weekendShading = useMemo(() => {
    const out = [];
    const totalH = flatRows.length * ROW_HEIGHT;
    for (let i = visRange.from; i <= visRange.to && i < totalDays; i++) {
      const d = addDays(bufferStart, i);
      if (d.getDay() === 0 || d.getDay() === 6) {
        if (!holidaySet.has(fmtISODate(d))) {
          out.push(<div key={`w${i}`} style={{ position: 'absolute', left: i * DAY_WIDTH, top: 0, width: DAY_WIDTH, height: totalH, background: '#f8f8fb', pointerEvents: 'none' }} />);
        }
      }
    }
    return out;
  }, [visRange.from, visRange.to, flatRows.length, holidaySet, bufferStart, totalDays]);

  // ── Holiday shading (memoized) ───────────────────────────────────────────
  const holidayShading = useMemo(() => {
    if (holidaySet.size === 0) return [];
    const out = [];
    const totalH = flatRows.length * ROW_HEIGHT;
    for (let i = visRange.from; i <= visRange.to && i < totalDays; i++) {
      const d = addDays(bufferStart, i);
      if (holidaySet.has(fmtISODate(d))) {
        out.push(<div key={`h${i}`} style={{ position: 'absolute', left: i * DAY_WIDTH, top: 0, width: DAY_WIDTH, height: totalH, background: '#FFEBEE', pointerEvents: 'none' }} />);
      }
    }
    return out;
  }, [visRange.from, visRange.to, flatRows.length, holidaySet, bufferStart, totalDays]);

  // ── Today line ───────────────────────────────────────────────────────────
  const todayLineEl = useMemo(() => {
    const totalH = flatRows.length * ROW_HEIGHT;
    return todayOff >= 0 && todayOff <= totalWidth
      ? <div style={{ position: 'absolute', left: todayOff, top: 0, width: 2, height: totalH, background: '#0073ea', opacity: 0.5, zIndex: 4, pointerEvents: 'none', borderRadius: 1 }} />
      : null;
  }, [todayOff, totalWidth, flatRows.length]);

  // ── Render bar for a row ─────────────────────────────────────────────────
  function renderBar(row, rowIndex) {
    const iss = issueByKey[row.key];
    if (!iss) return null;

    const hasKids = row.hasKids;
    const isCollapsed = row.isCollapsed;
    const isExpanded = hasKids && !isCollapsed;

    // Get dates
    let startDate, endDate, isRollup = false;
    if (hasKids) {
      const rollup = getRollupDates(row.key, new Set());
      startDate = rollup.minStart;
      endDate   = rollup.maxEnd;
      isRollup = true;
    } else {
      startDate = parseDate(iss.fields?.[sdf]);
      endDate   = parseDate(iss.fields?.[edf]);
    }

    if (!startDate && !endDate) return null;
    if (startDate && !endDate) endDate = addDays(startDate, 7);
    if (!startDate && endDate) startDate = addDays(endDate, -7);

    const startOff = daysBetween(bufferStart, startDate);
    const endOff   = daysBetween(bufferStart, endDate) + 1;

    const clippedStart = Math.max(0, startOff);
    const clippedEnd   = Math.min(totalDays, endOff);
    if (clippedEnd <= clippedStart) return null;

    const barLeft  = clippedStart * DAY_WIDTH;
    const barWidth = Math.max((clippedEnd - clippedStart) * DAY_WIDTH, DAY_WIDTH * 0.5);
    const overflowLeft  = startOff < 0;
    const overflowRight = endOff > totalDays;

    const y = rowIndex * ROW_HEIGHT;

    // Parent expanded = summary bracket
    if (isExpanded) {
      const bracketH = 6;
      const tickH = 10;
      return (
        <g key={row.key}>
          {/* Main bracket bar */}
          <rect
            x={barLeft} y={y + ROW_HEIGHT / 2 - bracketH / 2}
            width={barWidth} height={bracketH}
            rx={2} fill="#97A0AF" opacity={0.4}
          />
          {/* Left tick */}
          {!overflowLeft && (
            <rect
              x={barLeft} y={y + ROW_HEIGHT / 2 - tickH / 2}
              width={3} height={tickH}
              rx={1} fill="#6B778C" opacity={0.6}
            />
          )}
          {/* Right tick */}
          {!overflowRight && (
            <rect
              x={barLeft + barWidth - 3} y={y + ROW_HEIGHT / 2 - tickH / 2}
              width={3} height={tickH}
              rx={1} fill="#6B778C" opacity={0.6}
            />
          )}
        </g>
      );
    }

    // Parent collapsed = solid dark bar; Leaf = blue bar
    const isCollapsedParent = hasKids && isCollapsed;
    const barH   = ROW_HEIGHT - 10;
    const barY   = y + (ROW_HEIGHT - barH) / 2;
    const bgColor     = isCollapsedParent ? '#253858' : '#0073EA';
    const borderColor = isCollapsedParent ? '#172B4D' : '#0052CC';
    const textColor   = '#fff';
    const summary = iss.fields?.summary || '';

    return (
      <g key={row.key}>
        {/* Bar background */}
        <rect
          x={barLeft} y={barY}
          width={barWidth} height={barH}
          rx={4} fill={bgColor}
          stroke={borderColor} strokeWidth={1}
        />
        {/* Overflow arrows */}
        {overflowLeft && (
          <text x={barLeft + 4} y={barY + barH / 2} dominantBaseline="central" fill={textColor} fontSize="10" opacity={0.7}>&#8249;</text>
        )}
        {overflowRight && (
          <text x={barLeft + barWidth - 10} y={barY + barH / 2} dominantBaseline="central" fill={textColor} fontSize="10" opacity={0.7}>&#8250;</text>
        )}
        {/* Clip content */}
        <clipPath id={`clip-${row.key}`}>
          <rect x={barLeft + (overflowLeft ? 12 : 6)} y={barY} width={barWidth - (overflowLeft ? 14 : 8) - (overflowRight ? 14 : 8)} height={barH} />
        </clipPath>
        <g clipPath={`url(#clip-${row.key})`}>
          {/* Key chip */}
          <rect
            x={barLeft + (overflowLeft ? 14 : 8)} y={barY + (barH - 14) / 2}
            width={Math.min(row.key.length * 7 + 8, barWidth - 20)} height={14}
            rx={2} fill="rgba(255,255,255,0.2)"
          />
          <text
            x={barLeft + (overflowLeft ? 18 : 12)} y={barY + barH / 2}
            dominantBaseline="central" fontSize="10" fontWeight="700" fill={textColor}
          >
            {row.key}
          </text>
          {/* Summary text */}
          <text
            x={barLeft + (overflowLeft ? 18 : 12) + row.key.length * 7 + 12} y={barY + barH / 2}
            dominantBaseline="central" fontSize="11" fontWeight="600" fill={textColor}
          >
            {summary.length > 60 ? summary.slice(0, 57) + '...' : summary}
          </text>
        </g>
      </g>
    );
  }

  // ── Row grid lines (draw above weekend/holiday shading so they stay
  //    visible over colored backgrounds; color matches left row borders) ───
  const rowGridLines = useMemo(() => {
    const lines = [];
    for (let i = 0; i < flatRows.length; i++) {
      lines.push(
        <div key={`grid-${i}`} style={{
          position: 'absolute', left: 0, top: (i + 1) * ROW_HEIGHT - 1,
          width: totalWidth, height: 1, background: '#E1E4E8',
          pointerEvents: 'none', zIndex: 1,
        }} />
      );
    }
    return lines;
  }, [flatRows.length, totalWidth]);

  // ── Empty state ──────────────────────────────────────────────────────────
  if (issues.length === 0) {
    return (
      <div style={s.emptyState}>
        <div style={{ fontSize: '48px' }}>&#128203;</div>
        <div style={{ fontWeight: 600, fontSize: '16px', color: '#172B4D' }}>No issues found</div>
        <div style={{ color: '#6B778C', fontSize: '13px' }}>Configure a JQL filter or select projects.</div>
      </div>
    );
  }

  const totalContentHeight = flatRows.length * ROW_HEIGHT;
  const allExpanded = collapsed.size === 0;

  // Extra columns from listFields (exclude 'summary' — name is already shown)
  const extraFields = useMemo(() => {
    const allF = availableFields || [];
    return (listFields || [])
      .filter(fid => fid && fid !== 'summary')
      .map(fid => ({
        id: fid,
        name: allF.find(f => f.id === fid)?.name || fid,
      }));
  }, [listFields, availableFields]);

  // Total content width inside the table panel (Name + all fields at fixed widths).
  // The table panel viewport is treeWidth; if content > treeWidth, extra columns
  // are clipped on the right — user widens the panel via the tree/timeline divider.
  const treeContentWidth = NAME_COL_WIDTH + extraFields.length * FIELD_COL_WIDTH;
  const leftPanelWidth   = showTimeline ? treeWidth : '100%';

  return (
    <div style={s.outer}>
      {/* ── Tree header (sticky top-left) ── */}
      <div style={{ ...s.treeHeader, width: leftPanelWidth, overflow: 'hidden' }}>
        <div style={{ display: 'flex', width: treeContentWidth, height: '100%' }}>
          {/* Name column header */}
          <div style={{ width: NAME_COL_WIDTH, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', boxSizing: 'border-box', overflow: 'hidden' }}>
            <span style={s.treeHeaderLabel}>Name</span>
            <span style={s.treeHeaderStats}>
              {issues.length} issue{issues.length !== 1 ? 's' : ''} &middot; {roots.length} root{roots.length !== 1 ? 's' : ''}
            </span>
            <button style={s.expandCollapseBtn} onClick={allExpanded ? collapseAll : expandAll}>
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </button>
            {/* Toggle timeline button */}
            <button
              style={{ ...s.expandCollapseBtn, padding: '3px 7px', color: showTimeline ? '#0052CC' : '#6B778C', background: showTimeline ? '#DEEBFF' : '#fff' }}
              title={showTimeline ? 'Hide timeline' : 'Show timeline'}
              onClick={() => setShowTimeline(v => !v)}
            >
              {showTimeline ? '⊣ Hide' : '⊢ Timeline'}
            </button>
          </div>
          {/* Extra field column headers — draggable to reorder */}
          {extraFields.map(f => {
            const isDragging = dragFieldId === f.id;
            const isDropTarget = dropBeforeFieldId === f.id && dragFieldId !== f.id;
            return (
              <div
                key={f.id}
                draggable
                onDragStart={(e) => handleColDragStart(e, f.id)}
                onDragOver={(e) => handleColDragOver(e, f.id)}
                onDrop={(e) => handleColDrop(e, f.id)}
                onDragEnd={handleColDragEnd}
                title="Drag to reorder"
                style={{
                  ...s.fieldColHeader,
                  width: FIELD_COL_WIDTH,
                  cursor: 'grab',
                  opacity: isDragging ? 0.4 : 1,
                  boxShadow: isDropTarget ? 'inset 2px 0 0 #0073ea' : 'none',
                  userSelect: 'none',
                }}
              >
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Timeline header (sticky top, scrolls horizontally with body) ── */}
      {showTimeline && (
        <div style={{ ...s.timelineHeaderWrap, left: treeWidth }} id="project-header-scroll">
          {renderTimelineHeader()}
        </div>
      )}

      {/* ── Body: tree + timeline, single vertical scroll container ── */}
      <div
        ref={bodyRef}
        style={s.body}
        onScroll={handleScroll}
      >
        <div style={{ display: 'flex', minWidth: showTimeline ? treeWidth + totalWidth : '100%', height: totalContentHeight }}>
          {/* Tree + field columns — sticky left, clips content beyond treeWidth */}
          <div style={{ ...s.treeColumn, width: leftPanelWidth, position: showTimeline ? 'sticky' : 'relative', overflow: 'hidden' }}>
            {flatRows.map((row, idx) => {
              const iss = issueByKey[row.key];
              if (!iss) return null;
              const summary = iss.fields?.summary || '';
              const indent = row.depth * 20;
              const isSelected = selectedKey === row.key;
              const isHovered  = hoveredKey === row.key;

              return (
                <div
                  key={row.key}
                  style={{
                    ...s.treeRow,
                    width: treeContentWidth,
                    height: ROW_HEIGHT,
                    background: isSelected ? '#DEEBFF' : isHovered ? '#F4F5F7' : '#fff',
                  }}
                  onClick={() => setSelectedKey(row.key)}
                  onDoubleClick={() => router.navigate(`/browse/${row.key}`)}
                  onMouseEnter={() => setHoveredKey(row.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                >
                  {/* Name cell — fixed width, never collapses */}
                  <div style={{ width: NAME_COL_WIDTH, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 8 + indent, minWidth: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
                    {row.hasKids ? (
                      <span
                        style={s.toggle}
                        onClick={(e) => { e.stopPropagation(); toggleNode(row.key); }}
                      >
                        {row.isCollapsed ? '\u25B6' : '\u25BC'}
                      </span>
                    ) : (
                      <span style={{ width: 20, flexShrink: 0 }} />
                    )}
                    <span style={s.keyBadge}>{row.key}</span>
                    <span style={s.summaryText}>{summary}</span>
                    {row.hasKids && (
                      <span style={s.childCount}>({(childrenByKey[row.key] || []).length})</span>
                    )}
                  </div>
                  {/* Extra field cells — each fixed width */}
                  {extraFields.map(f => (
                    <div key={f.id} style={{ ...s.fieldCell, width: FIELD_COL_WIDTH }}>
                      {renderFieldValue(iss.fields?.[f.id])}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>

          {/* Table ↔ Timeline divider */}
          {showTimeline && (
            <div
              onMouseDown={startDividerDrag}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#0073ea'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              style={{
                width: 5, flexShrink: 0, cursor: 'col-resize',
                position: 'sticky', left: treeWidth - 2, zIndex: 8,
                background: 'transparent', transition: 'background 0.12s',
              }}
              title="Drag to change table / timeline split"
            />
          )}

          {/* Timeline column */}
          {showTimeline && (
            <div style={{ position: 'relative', width: totalWidth, height: totalContentHeight }}>
              {/* Weekend shading */}
              {weekendShading}
              {/* Holiday shading */}
              {holidayShading}
              {/* Row grid lines */}
              {rowGridLines}
              {/* Today line */}
              {todayLineEl}
              {/* Bars (SVG overlay) */}
              <svg
                style={{ position: 'absolute', top: 0, left: 0, width: totalWidth, height: totalContentHeight, pointerEvents: 'none', zIndex: 3 }}
                xmlns="http://www.w3.org/2000/svg"
              >
                {flatRows.map((row, idx) => renderBar(row, idx))}
              </svg>
              {/* Row highlight on hover (transparent clickable row zones) */}
              {flatRows.map((row, idx) => {
                const isSelected = selectedKey === row.key;
                const isHovered  = hoveredKey === row.key;
                return (
                  <div
                    key={`zone-${row.key}`}
                    style={{
                      position: 'absolute', left: 0, top: idx * ROW_HEIGHT,
                      width: totalWidth, height: ROW_HEIGHT,
                      background: isSelected ? 'rgba(222,235,255,0.15)' : isHovered ? 'rgba(0,0,0,0.02)' : 'transparent',
                      pointerEvents: 'auto', cursor: 'default',
                      zIndex: 2,
                    }}
                    onClick={() => setSelectedKey(row.key)}
                    onMouseEnter={() => setHoveredKey(row.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const s = {
  outer: {
    flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff',
    position: 'relative',
  },
  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: '10px', color: '#6B778C',
  },

  // ── Tree header (sticky top-left corner) — width set dynamically ──
  treeHeader: {
    position: 'absolute', left: 0, top: 0,
    height: HEADER_HEIGHT, zIndex: 12,
    background: '#fff', borderBottom: '2px solid #e6e9ef', borderRight: '2px solid #e6e9ef',
    display: 'flex', alignItems: 'center', gap: 0,
    boxSizing: 'border-box',
  },
  treeHeaderLabel: {
    fontWeight: 700, fontSize: '11px', color: '#6B778C',
    textTransform: 'uppercase', letterSpacing: '0.4px',
  },
  treeHeaderStats: {
    fontSize: '11px', color: '#97A0AF',
  },
  expandCollapseBtn: {
    background: '#fff', border: '1px solid #DFE1E6', borderRadius: '4px',
    padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: 600,
    color: '#323338', flexShrink: 0,
  },
  fieldColHeader: {
    flexShrink: 0, boxSizing: 'border-box',
    padding: '0 8px', fontSize: '10px', fontWeight: 700, color: '#6B778C',
    textTransform: 'uppercase', letterSpacing: '0.4px',
    borderLeft: '1px solid #e6e9ef', height: '100%',
    display: 'flex', alignItems: 'center',
    whiteSpace: 'nowrap', overflow: 'hidden',
  },
  fieldCell: {
    flexShrink: 0, boxSizing: 'border-box',
    padding: '0 8px', fontSize: '11px', color: '#42526E',
    borderLeft: '1px solid #f0f1f3',
    display: 'flex', alignItems: 'center',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    height: '100%',
  },

  // ── Timeline header (sticky top, right of tree header) — left set dynamically ──
  timelineHeaderWrap: {
    position: 'absolute', top: 0, right: 0,
    height: HEADER_HEIGHT, overflowX: 'hidden',
    background: '#fff', borderBottom: '2px solid #e6e9ef', zIndex: 11,
  },

  // ── Body (scrolls both ways) ──
  body: {
    position: 'absolute', left: 0, top: HEADER_HEIGHT, right: 0, bottom: 0,
    overflowY: 'auto', overflowX: 'auto',
  },

  // ── Tree column (sticky left inside body) — width set dynamically ──
  treeColumn: {
    flexShrink: 0,
    position: 'sticky', left: 0, zIndex: 6,
    background: '#fff', borderRight: '2px solid #e6e9ef',
  },

  // ── Tree row ──
  treeRow: {
    display: 'flex', alignItems: 'center', gap: 4,
    borderBottom: '1px solid #E1E4E8',
    cursor: 'pointer', userSelect: 'none', overflow: 'hidden',
    boxSizing: 'border-box',
  },
  toggle: {
    cursor: 'pointer', fontSize: '13px', color: '#42526E', width: 20,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    userSelect: 'none', flexShrink: 0, padding: '2px',
  },
  keyBadge: {
    background: '#DEEBFF', color: '#0747A6', borderRadius: '3px',
    padding: '1px 5px', fontSize: '10px', fontWeight: 700,
    whiteSpace: 'nowrap', flexShrink: 0,
  },
  summaryText: {
    fontSize: '12px', color: '#172B4D', whiteSpace: 'nowrap',
    overflow: 'hidden', textOverflow: 'ellipsis', flex: 1,
  },
  childCount: {
    fontSize: '10px', color: '#97A0AF', fontWeight: 400, flexShrink: 0, marginRight: 4,
  },
};
