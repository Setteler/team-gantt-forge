import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { router } from '@forge/bridge';

const TREE_WIDTH    = 400;
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

export default function ProjectView({
  issues, today, startDateField, endDateField,
  onUpdateIssue, holidays,
  scrollToTarget, onVisibleMonthChange,
}) {
  const bodyRef       = useRef(null);
  const lastMonthRef  = useRef(null);
  const rafScrollRef  = useRef(null);

  const [collapsed, setCollapsed]     = useState(new Set());
  const [selectedKey, setSelectedKey] = useState(null);
  const [hoveredKey, setHoveredKey]   = useState(null);
  const [visRange, setVisRange]       = useState({ from: 0, to: 160 });

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
  useEffect(() => {
    if (!scrollToTarget || !bodyRef.current) return;
    const focusDate = new Date(scrollToTarget.year, scrollToTarget.month, 1);
    const off = Math.max(0, daysBetween(bufferStart, focusDate)) * DAY_WIDTH;
    bodyRef.current.scrollLeft = off;
  }, [scrollToTarget, bufferStart]);

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

  // ── Row grid lines (subtle separators) ───────────────────────────────────
  const rowGridLines = useMemo(() => {
    const lines = [];
    for (let i = 0; i < flatRows.length; i++) {
      lines.push(
        <div key={`grid-${i}`} style={{
          position: 'absolute', left: 0, top: (i + 1) * ROW_HEIGHT - 1,
          width: totalWidth, height: 1, background: '#f0f1f3', pointerEvents: 'none',
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

  return (
    <div style={s.outer}>
      {/* ── Tree header (sticky top-left) ── */}
      <div style={s.treeHeader}>
        <span style={s.treeHeaderLabel}>Name</span>
        <span style={s.treeHeaderStats}>
          {issues.length} issue{issues.length !== 1 ? 's' : ''} &middot; {roots.length} root{roots.length !== 1 ? 's' : ''}
        </span>
        <button style={s.expandCollapseBtn} onClick={allExpanded ? collapseAll : expandAll}>
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {/* ── Timeline header (sticky top, scrolls horizontally with body) ── */}
      <div style={s.timelineHeaderWrap} id="project-header-scroll">
        {renderTimelineHeader()}
      </div>

      {/* ── Body: tree + timeline, single vertical scroll container ── */}
      <div
        ref={bodyRef}
        style={s.body}
        onScroll={handleScroll}
      >
        <div style={{ display: 'flex', minWidth: TREE_WIDTH + totalWidth, height: totalContentHeight }}>
          {/* Tree column — sticky left */}
          <div style={s.treeColumn}>
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
                    height: ROW_HEIGHT,
                    paddingLeft: 8 + indent,
                    background: isSelected ? '#DEEBFF' : isHovered ? '#F4F5F7' : '#fff',
                  }}
                  onClick={() => setSelectedKey(row.key)}
                  onDoubleClick={() => router.navigate(`/browse/${row.key}`)}
                  onMouseEnter={() => setHoveredKey(row.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                >
                  {/* Expand/collapse triangle */}
                  {row.hasKids ? (
                    <span
                      style={s.toggle}
                      onClick={(e) => { e.stopPropagation(); toggleNode(row.key); }}
                    >
                      {row.isCollapsed ? '\u25B8' : '\u25BE'}
                    </span>
                  ) : (
                    <span style={{ width: 14, display: 'inline-block', flexShrink: 0 }} />
                  )}
                  {/* Key chip */}
                  <span style={s.keyBadge}>{row.key}</span>
                  {/* Summary */}
                  <span style={s.summaryText}>{summary}</span>
                  {row.hasKids && (
                    <span style={s.childCount}>({(childrenByKey[row.key] || []).length})</span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Timeline column */}
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

  // ── Tree header (sticky top-left corner) ──
  treeHeader: {
    position: 'absolute', left: 0, top: 0, width: TREE_WIDTH,
    height: HEADER_HEIGHT, zIndex: 12,
    background: '#F4F5F7', borderBottom: '2px solid #e6e9ef', borderRight: '2px solid #e6e9ef',
    display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px',
    boxSizing: 'border-box',
  },
  treeHeaderLabel: {
    fontWeight: 700, fontSize: '11px', color: '#6B778C',
    textTransform: 'uppercase', letterSpacing: '0.4px',
  },
  treeHeaderStats: {
    fontSize: '11px', color: '#97A0AF', flex: 1,
  },
  expandCollapseBtn: {
    background: '#fff', border: '1px solid #DFE1E6', borderRadius: '4px',
    padding: '3px 8px', cursor: 'pointer', fontSize: '10px', fontWeight: 600,
    color: '#323338', flexShrink: 0,
  },

  // ── Timeline header (sticky top, right of tree header) ──
  timelineHeaderWrap: {
    position: 'absolute', left: TREE_WIDTH, top: 0, right: 0,
    height: HEADER_HEIGHT, overflowX: 'hidden',
    background: '#fff', borderBottom: '2px solid #e6e9ef', zIndex: 11,
  },

  // ── Body (scrolls both ways) ──
  body: {
    position: 'absolute', left: 0, top: HEADER_HEIGHT, right: 0, bottom: 0,
    overflowY: 'auto', overflowX: 'auto',
  },

  // ── Tree column (sticky left inside body) ──
  treeColumn: {
    width: TREE_WIDTH, flexShrink: 0,
    position: 'sticky', left: 0, zIndex: 6,
    background: '#fff', borderRight: '2px solid #e6e9ef',
  },

  // ── Tree row ──
  treeRow: {
    display: 'flex', alignItems: 'center', gap: 4,
    borderBottom: '1px solid #f0f1f3',
    cursor: 'pointer', userSelect: 'none', overflow: 'hidden',
    boxSizing: 'border-box',
  },
  toggle: {
    cursor: 'pointer', fontSize: '11px', color: '#6B778C', width: 14,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    userSelect: 'none', flexShrink: 0,
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
