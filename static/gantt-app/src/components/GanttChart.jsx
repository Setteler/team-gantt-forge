import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import GanttBar from './GanttBar';
import EventBar from './EventBar';

const LEFT_WIDTH    = 260;
const DAY_WIDTH     = 38;
const GROUP_HEIGHT  = 36;
const SUB_HEIGHT    = 46;
const ITEM_HEIGHT   = 44;
const HEADER_HEIGHT = 62;
const BAR_PADDING   = 6;

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const SQUAD_COLORS = [
  { bg: '#dcf5e7', border: '#00c875', text: '#007a44' },
  { bg: '#dce5ff', border: '#0073ea', text: '#0060b9' },
  { bg: '#f0dcff', border: '#a25ddc', text: '#7c3aad' },
  { bg: '#ffe9c5', border: '#fdab3d', text: '#b07d00' },
  { bg: '#ffe1e1', border: '#e2445c', text: '#bf2040' },
  { bg: '#ddf8ff', border: '#4bcce4', text: '#007090' },
  { bg: '#fff3c7', border: '#ffcb00', text: '#8a6800' },
  { bg: '#f0e6ff', border: '#7e3af2', text: '#5521b5' },
];

const _squadColorMap = new Map();
function getSquadColor(name) {
  if (!_squadColorMap.has(name)) {
    _squadColorMap.set(name, SQUAD_COLORS[_squadColorMap.size % SQUAD_COLORS.length]);
  }
  return _squadColorMap.get(name);
}

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

function getFieldValue(fields, key) {
  const v = fields?.[key];
  if (v == null) return 'None';
  if (typeof v === 'string') return v || 'None';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    if (!v.length) return 'None';
    const f = v[0];
    return typeof f === 'string' ? f : (f?.displayName || f?.name || f?.value || 'None');
  }
  return v.displayName || v.name || v.value || v.key || '—';
}

function getItemDates(item, sdf, edf) {
  if (item._type === 'custom') {
    let s = parseDate(item.startDate), e = parseDate(item.endDate);
    if (!s && !e) { const r = new Date(); s = r; e = addDays(r, 1); }
    if (!s) s = e; if (!e) e = addDays(s, 1);
    return { s, e };
  }
  let s = parseDate(item.fields[sdf]);
  let e = parseDate(item.fields[edf]);
  if (!s && !e) { const r = new Date(); s = addDays(r, -3); e = addDays(r, 3); }
  if (!s) s = addDays(e, -7);
  if (!e) e = addDays(s, 7);
  return { s, e };
}

function computeRollup(items, sdf, edf) {
  let minS = null, maxE = null;
  for (const item of items) {
    const { s, e } = getItemDates(item, sdf, edf);
    if (!minS || s < minS) minS = s;
    if (!maxE || e > maxE) maxE = e;
  }
  return { s: minS, e: maxE };
}

function groupItems(issues, events, f1, f2) {
  const g = {};
  for (const iss of issues) {
    const g1 = getFieldValue(iss.fields, f1) || 'None';
    const g2 = getFieldValue(iss.fields, f2) || 'None';
    if (!g[g1]) g[g1] = {};
    if (!g[g1][g2]) g[g1][g2] = [];
    g[g1][g2].push({ ...iss, _type: 'jira' });
  }
  for (const evt of (events || [])) {
    const g1 = evt.groupValues?.[f1] ?? evt.squad ?? 'No Squad';
    const g2 = evt.groupValues?.[f2] ?? evt.developer ?? 'Unassigned';
    if (!g[g1]) g[g1] = {};
    if (!g[g1][g2]) g[g1][g2] = [];
    g[g1][g2].push({ ...evt, _type: 'custom' });
  }
  return g;
}

function RollupBar({ s, e, bufferStart, totalDays, color, height }) {
  if (!s || !e) return null;
  const left  = Math.max(0, daysBetween(bufferStart, s)) * DAY_WIDTH;
  const right = Math.min(totalDays, daysBetween(bufferStart, e) + 1) * DAY_WIDTH;
  if (right <= left) return null;
  return (
    <div style={{
      position: 'absolute', left, width: right - left,
      height: height || 8, top: '50%', transform: 'translateY(-50%)',
      background: color.border, borderRadius: 4, opacity: 0.3,
      pointerEvents: 'none', zIndex: 1,
    }} />
  );
}

function CreatePreview({ startDay, endDay, color, rowH }) {
  const lo = Math.min(startDay, endDay), hi = Math.max(startDay, endDay);
  const w = Math.max((hi - lo + 1) * DAY_WIDTH, DAY_WIDTH * 2);
  return (
    <div style={{
      position: 'absolute', left: lo * DAY_WIDTH, top: 4,
      width: w, height: rowH - 8,
      background: color.bg, border: `2px dashed ${color.border}`,
      borderRadius: 6, opacity: 0.85, zIndex: 8, pointerEvents: 'none',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <span style={{ fontSize: '10px', color: color.text, fontWeight: 700 }}>+ New event</span>
    </div>
  );
}

// Pack items into lanes (Airtable-style: fewest rows, no overlaps)
function toMidnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function packItems(items, sdf, edf) {
  // Compute dates ONCE per item — avoids new Date() being called multiple times
  // (non-date items use new Date() as fallback, which changes each call and breaks sort/placement).
  // Normalize to midnight so time-of-day differences don't affect day-level overlap checks.
  const dated = items.map(item => {
    const { s: sRaw, e: eRaw } = getItemDates(item, sdf, edf);
    const s = toMidnight(sRaw);
    const e = toMidnight(eRaw > sRaw ? eRaw : sRaw); // guard: end must be >= start
    return { item, s, e };
  });

  // Sort by start date, stable tie-breaker by key/id
  dated.sort((a, b) => {
    const diff = a.s - b.s;
    if (diff !== 0) return diff;
    const ak = a.item.key || a.item.id || '';
    const bk = b.item.key || b.item.id || '';
    return ak.localeCompare(bk);
  });

  const lanes = [];     // each lane = array of items
  const laneEnds = [];  // max end date per lane
  for (const { item, s, e } of dated) {
    let placed = false;
    for (let i = 0; i < lanes.length; i++) {
      if (s > laneEnds[i]) { // starts strictly after lane's last end (end day is inclusive in rendering)
        lanes[i].push(item);
        laneEnds[i] = e > laneEnds[i] ? e : laneEnds[i];
        placed = true;
        break;
      }
    }
    if (!placed) { lanes.push([item]); laneEnds.push(e); }
  }
  return lanes;
}

export default function GanttChart({
  issues, customEvents, today,
  groupByField1, groupByField2, groupByField1Label, groupByField2Label,
  startDateField, endDateField,
  scrollToTarget, onVisibleMonthChange,
  onEditEvent, onDeleteEvent, onUpdateEvent, onUpdateIssue, onCreateEvent,
  onPreviewIssue, previewFields, availableFields,
}) {
  const scrollRef     = useRef(null);
  const lastMonthRef  = useRef(null);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [collapsedSubs, setCollapsedSubs]     = useState(new Set());
  const [createDrag, setCreateDrag]           = useState(null);
  const hoverHighlightRef                     = useRef(null);
  const rafScrollRef                          = useRef(null);
  // Visible day range for day-cell rendering (performance)
  const [visRange, setVisRange] = useState({ from: 0, to: 160 });

  const sdf = startDateField || 'customfield_10015';
  const edf = endDateField   || 'duedate';
  const f1  = groupByField1  || 'labels';
  const f2  = groupByField2  || 'assignee';

  // Fixed 4-year buffer centered around today.
  // Memoized on year so dependent useMemos (dependency arrows, etc.) don't
  // re-run every render due to a fresh Date object.
  const todayYear = today.getFullYear();
  const bufferStart = useMemo(() => new Date(todayYear - 1, 0, 1), [todayYear]);
  const bufferEnd   = useMemo(() => new Date(todayYear + 3, 0, 0), [todayYear]);
  const totalDays   = daysBetween(bufferStart, bufferEnd) + 1;
  const totalWidth  = totalDays * DAY_WIDTH;
  const todayOff    = daysBetween(bufferStart, today) * DAY_WIDTH;

  // Scroll to target when it changes (navigation arrows / Today button)
  useEffect(() => {
    if (!scrollToTarget || !scrollRef.current) return;
    const focusDate = new Date(scrollToTarget.year, scrollToTarget.month, 1);
    const off = Math.max(0, daysBetween(bufferStart, focusDate)) * DAY_WIDTH;
    scrollRef.current.scrollLeft = off;
  }, [scrollToTarget]);

  // Scroll to today on initial mount
  useEffect(() => {
    if (!scrollRef.current) return;
    const off = Math.max(0, todayOff - 60);
    scrollRef.current.scrollLeft = off;
    const cw = scrollRef.current.clientWidth;
    const from = Math.max(0, Math.floor(off / DAY_WIDTH) - 20);
    const to   = Math.min(totalDays - 1, Math.ceil((off + cw) / DAY_WIDTH) + 20);
    setVisRange({ from, to });
  }, []);

  // Diagonal scroll: intercept wheel events and apply both deltaX and deltaY
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e) => {
      e.preventDefault();
      el.scrollLeft += e.deltaX;
      el.scrollTop  += e.deltaY;
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  const handleScroll = useCallback((e) => {
    const sl = e.currentTarget.scrollLeft;
    const cw = e.currentTarget.clientWidth;

    // Sync header immediately (no RAF — must stay in sync with body)
    const h = document.getElementById('gantt-header-scroll');
    if (h) h.scrollLeft = sl;

    // Throttle React re-renders via RAF
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
  }, [totalDays]);

  // Memoize grouped + rows — only recompute when data/collapse state changes, not on scroll
  const grouped    = useMemo(() => groupItems(issues, customEvents || [], f1, f2), [issues, customEvents, f1, f2]);
  const groupNames = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  const rows = useMemo(() => {
    const r = [];
    for (const g1 of groupNames) {
      const color    = getSquadColor(g1);
      const allItems = Object.values(grouped[g1]).flat();
      const rollup   = computeRollup(allItems, sdf, edf);
      r.push({ type: 'group', g1, color, rollup, count: allItems.length });
      if (!collapsedGroups.has(g1)) {
        const subNames = Object.keys(grouped[g1]).sort();
        for (const g2 of subNames) {
          const items  = grouped[g1][g2];
          const subKey = `${g1}||${g2}`;
          const subRoll = computeRollup(items, sdf, edf);
          r.push({ type: 'sub', g1, g2, color, rollup: subRoll, count: items.length, subKey });
          if (!collapsedSubs.has(subKey)) {
            const lanes = packItems(items, sdf, edf);
            for (const laneItems of lanes) {
              r.push({ type: 'lane', g1, g2, color, items: laneItems, subKey });
            }
          }
        }
      }
    }
    return r;
  }, [grouped, groupNames, collapsedGroups, collapsedSubs, sdf, edf]);

  // ── Dependency arrows: position map + arrow data ──────────────────────────
  const { depArrows, totalRowsHeight } = useMemo(() => {
    const map = {};
    let cumulY = 0;
    for (const row of rows) {
      const rowH = row.type === 'group' ? GROUP_HEIGHT : row.type === 'sub' ? SUB_HEIGHT : ITEM_HEIGHT;
      if (row.type === 'lane') {
        for (const item of row.items) {
          if (item._type !== 'jira') continue;
          const { s, e } = getItemDates(item, sdf, edf);
          const xStart = daysBetween(bufferStart, s) * DAY_WIDTH;
          const xEnd   = (daysBetween(bufferStart, e) + 1) * DAY_WIDTH;
          map[item.key] = {
            x: xStart,
            width: xEnd - xStart,
            midY: cumulY + rowH / 2,
            startDate: s,
            endDate: e,
          };
        }
      }
      cumulY += rowH;
    }

    // Build arrows from issue links
    const arrows = [];
    for (const row of rows) {
      if (row.type !== 'lane') continue;
      for (const item of row.items) {
        if (item._type !== 'jira') continue;
        const links = item.fields?.issuelinks;
        if (!links || !links.length) continue;
        for (const link of links) {
          // Only process outward "Blocks" links to avoid duplicates
          if (link.type?.name !== 'Blocks' || !link.outwardIssue) continue;
          const predKey = item.key;
          const succKey = link.outwardIssue.key;
          if (predKey === succKey) continue; // skip self-links
          if (!map[predKey] || !map[succKey]) continue;
          const pred = map[predKey];
          const succ = map[succKey];
          const predEndX  = pred.x + pred.width;
          const succStartX = succ.x;
          // Violation: predecessor ends strictly after successor starts
          const violated = pred.endDate > succ.startDate;
          arrows.push({ predEndX, predMidY: pred.midY, succStartX, succMidY: succ.midY, violated });
        }
      }
    }

    return { depArrows: arrows, totalRowsHeight: cumulY };
  }, [rows, sdf, edf, bufferStart]);

  // ── SVG overlay element for dependency arrows ────────────────────────────
  const depArrowsSvg = useMemo(() => {
    if (!depArrows.length) return null;
    const ARROW_SIZE = 6;
    const GAP = 8;
    return (
      <svg
        style={{ position: 'absolute', top: 0, left: 0, width: totalWidth, height: totalRowsHeight, pointerEvents: 'none', zIndex: 1 }}
        xmlns="http://www.w3.org/2000/svg"
      >
        {depArrows.map((a, i) => {
          const color = a.violated ? '#E2445C' : '#6B778C';
          const x1 = a.predEndX;
          const y1 = a.predMidY;
          const x2 = a.succStartX;
          const y2 = a.succMidY;
          // Direction-aware routing: arrow always points INTO the successor's left edge.
          // For forward deps (x2 >= x1): elbow goes right from pred, then to succ.
          // For backward (overlap/violation): route around with negative gap so arrowhead still points right into succ.
          const forward = x2 >= x1;
          const tipX = x2 - 2;
          const elbowX = forward ? x1 + GAP : Math.min(x1 + GAP, x2 - GAP);
          const d = `M ${x1} ${y1} L ${elbowX} ${y1} L ${elbowX} ${y2} L ${tipX} ${y2}`;
          // Arrowhead always points right (into successor's left edge)
          const ah = `${tipX} ${y2 - ARROW_SIZE / 2}, ${tipX + ARROW_SIZE} ${y2}, ${tipX} ${y2 + ARROW_SIZE / 2}`;
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
              <polygon points={ah} fill={color} />
            </g>
          );
        })}
      </svg>
    );
  }, [depArrows, totalWidth, totalRowsHeight]);

  function toggleGroup(g1) {
    setCollapsedGroups(prev => { const n = new Set(prev); n.has(g1) ? n.delete(g1) : n.add(g1); return n; });
  }
  function toggleSub(key) {
    setCollapsedSubs(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  // Click-to-create drag — uses bufferStart
  function getDay(clientX) {
    const rect = scrollRef.current.getBoundingClientRect();
    const x    = clientX - rect.left - LEFT_WIDTH + scrollRef.current.scrollLeft;
    return Math.max(0, Math.min(totalDays - 1, Math.floor(x / DAY_WIDTH)));
  }

  function handleTimelineMouseMove(e) {
    if (!scrollRef.current || !hoverHighlightRef.current) return;
    const rect = scrollRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left - LEFT_WIDTH + scrollRef.current.scrollLeft;
    if (x < 0) { hoverHighlightRef.current.style.display = 'none'; return; }
    const day = Math.max(0, Math.min(totalDays - 1, Math.floor(x / DAY_WIDTH)));
    const el = hoverHighlightRef.current;
    el.style.display = 'block';
    el.style.left = (day * DAY_WIDTH) + 'px';
  }

  function handleBgMouseDown(e, g1, g2) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startDay = getDay(e.clientX);
    setCreateDrag({ g1, g2, startDay, curDay: startDay });

    const onMove = (ev) => setCreateDrag(p => p ? { ...p, curDay: getDay(ev.clientX) } : null);
    const onUp   = (ev) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const endDay = getDay(ev.clientX);
      const lo = Math.min(startDay, endDay), hi = Math.max(startDay, endDay);
      setCreateDrag(null);
      if (onCreateEvent) {
        onCreateEvent({
          startDate: fmtISODate(addDays(bufferStart, lo)),
          endDate:   fmtISODate(addDays(bufferStart, hi)),
          g1, g2,
        });
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  // ── Header ────────────────────────────────────────────────────────────────
  function renderHeader() {
    // Month-label spans (top row) — render all, they're few
    const monthEls = [];
    let mStart = 0, mMo = -1, mYear = -1;
    for (let i = 0; i <= totalDays; i++) {
      const d  = i < totalDays ? addDays(bufferStart, i) : null;
      const mo = d ? d.getMonth() : -1;
      if (mo !== mMo) {
        if (mMo !== -1) {
          monthEls.push(
            <div key={`m-${mStart}`} style={{ ...styles.weekLabel, left: mStart * DAY_WIDTH, width: (i - mStart) * DAY_WIDTH, fontWeight: 700, fontSize: '11px', color: mYear === today.getFullYear() ? '#323338' : '#c3c6d4' }}>
              {MONTH_NAMES[mMo].slice(0, 3)} {mYear !== today.getFullYear() ? mYear : ''}
            </div>
          );
        }
        mMo = mo; mStart = i; mYear = d ? d.getFullYear() : -1;
      }
    }

    // Day cells — only render the visible window
    const dayEls = [];
    for (let i = visRange.from; i <= visRange.to && i < totalDays; i++) {
      const d = addDays(bufferStart, i);
      const isToday   = daysBetween(today, d) === 0;
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      // Day cell absolute-positioned at its correct offset
      dayEls.push(
        <div key={i} style={{
          ...styles.dayCell, left: i * DAY_WIDTH,
          background: isToday ? '#0073ea' : isWeekend ? 'transparent' : 'transparent',
          fontWeight: isToday ? 700 : 400,
          color: isToday ? '#fff' : isWeekend ? '#c3c6d4' : '#676879',
          borderRadius: isToday ? '6px' : '0',
        }}>
          <div style={styles.dayName}>{['Su','Mo','Tu','We','Th','Fr','Sa'][d.getDay()]}</div>
          <div style={styles.dayNum}>{d.getDate()}</div>
        </div>
      );
    }

    return (
      <div style={{ position: 'relative', height: HEADER_HEIGHT, width: totalWidth }}>
        <div style={{ position: 'relative', height: 22 }}>{monthEls}</div>
        <div style={{ position: 'relative', height: 34 }}>{dayEls}</div>
        {/* Hover day column highlight — shown/hidden via direct DOM ref, no re-renders */}
        <div ref={hoverHighlightRef} style={{
          display: 'none',
          position: 'absolute', top: 0,
          width: DAY_WIDTH, height: HEADER_HEIGHT,
          background: '#0073ea22',
          borderRadius: 4,
          pointerEvents: 'none', zIndex: 20,
        }} />
      </div>
    );
  }

  // Memoize weekend shading — computed once per visible range per row height, not once per row per render
  const weekendShadingByHeight = useMemo(() => {
    function make(rowH) {
      const out = [];
      for (let i = visRange.from; i <= visRange.to && i < totalDays; i++) {
        const d = addDays(bufferStart, i);
        if (d.getDay() === 0 || d.getDay() === 6) {
          out.push(<div key={i} style={{ position: 'absolute', left: i * DAY_WIDTH, top: 0, width: DAY_WIDTH, height: rowH, background: '#f8f8fb', pointerEvents: 'none' }} />);
        }
      }
      return out;
    }
    return { group: make(GROUP_HEIGHT), sub: make(SUB_HEIGHT), item: make(ITEM_HEIGHT) };
  }, [visRange.from, visRange.to]);

  const todayLineEl = useMemo(() =>
    todayOff >= 0 && todayOff <= totalWidth
      ? <div style={{ ...styles.todayLine, left: todayOff }} />
      : null,
  [todayOff, totalWidth]);

  const totalItems = issues.length + (customEvents || []).length;
  if (totalItems === 0) {
    return (
      <div style={styles.emptyState}>
        <div style={{ fontSize: '48px' }}>📋</div>
        <div style={{ fontWeight: 600, fontSize: '16px', color: '#172B4D' }}>No issues found</div>
        <div style={{ color: '#6B778C', fontSize: '13px' }}>Configure a JQL filter or select projects in ⚙ Configure.</div>
      </div>
    );
  }

  const headerLabel = `${(groupByField1Label || f1).toUpperCase()} / ${(groupByField2Label || f2).toUpperCase()}`;

  return (
    <div style={styles.outer}>
      {/* Left header */}
      <div style={styles.leftHeader}>
        <span style={{ fontWeight: 700, fontSize: '11px', color: '#676879', letterSpacing: '0.3px', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{headerLabel}</span>
        <span style={{ fontSize: '11px', color: '#97A0AF', flexShrink: 0, marginLeft: '6px' }}>
          {issues.length} issue{issues.length !== 1 ? 's' : ''}
          {(customEvents || []).length > 0 ? ` · ${customEvents.length} event${customEvents.length !== 1 ? 's' : ''}` : ''}
        </span>
      </div>

      {/* Timeline header (scrolls in sync with body) */}
      <div style={{ position: 'absolute', left: LEFT_WIDTH, top: 0, right: 0, height: HEADER_HEIGHT, overflowX: 'hidden', background: '#fff', borderBottom: '2px solid #e6e9ef', zIndex: 10 }} id="gantt-header-scroll">
        {renderHeader()}
      </div>

      {/* Body */}
      <div
        id="gantt-body-scroll"
        ref={scrollRef}
        style={{ position: 'absolute', left: 0, top: HEADER_HEIGHT, right: 0, bottom: 0, overflowY: 'auto', overflowX: 'auto' }}
        onScroll={handleScroll}
        onMouseMove={handleTimelineMouseMove}
        onMouseLeave={() => { if (hoverHighlightRef.current) hoverHighlightRef.current.style.display = 'none'; }}
      >
        <div style={{ display: 'flex', minWidth: LEFT_WIDTH + totalWidth }}>

          {/* Sticky left column */}
          <div style={{ width: LEFT_WIDTH, flexShrink: 0, position: 'sticky', left: 0, zIndex: 5, background: '#fff', borderRight: '2px solid #e6e9ef' }}>
            {rows.map((row, idx) => {
              if (row.type === 'group') {
                const col = row.color;
                return (
                  <div key={`lG-${row.g1}`}
                    style={{ height: GROUP_HEIGHT, display: 'flex', alignItems: 'center', gap: '6px', padding: '0 10px', background: col.bg, borderLeft: `4px solid ${col.border}`, color: col.text, cursor: 'pointer', borderBottom: `1px solid ${col.border}30`, userSelect: 'none', overflow: 'hidden' }}
                    onClick={() => toggleGroup(row.g1)}
                  >
                    <span style={{ fontSize: '9px', flexShrink: 0 }}>{collapsedGroups.has(row.g1) ? '▶' : '▼'}</span>
                    <span style={{ fontWeight: 700, fontSize: '11px', letterSpacing: '0.4px', textTransform: 'uppercase', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.g1}</span>
                    <span style={{ fontSize: '11px', fontWeight: 600, background: col.border + '22', borderRadius: '10px', padding: '1px 7px', flexShrink: 0, color: col.text }}>{row.count}</span>
                  </div>
                );
              }
              if (row.type === 'sub') {
                const col = row.color;
                const isCol = collapsedSubs.has(row.subKey);
                return (
                  <div key={`lS-${row.g1}-${row.g2}`}
                    style={{ height: SUB_HEIGHT, display: 'flex', alignItems: 'center', gap: '8px', padding: '0 10px 0 18px', background: '#fff', borderLeft: `3px solid ${col.border}55`, borderBottom: '1px solid #f0f1f3', cursor: 'pointer', userSelect: 'none', overflow: 'hidden' }}
                    onClick={() => toggleSub(row.subKey)}
                  >
                    <span style={{ fontSize: '9px', color: '#6B778C', flexShrink: 0 }}>{isCol ? '▶' : '▼'}</span>
                    <div style={{ width: 26, height: 26, borderRadius: '50%', background: col.border, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: 700, flexShrink: 0 }}>
                      {row.g2.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                    </div>
                    <span style={{ fontSize: '13px', fontWeight: 600, flex: 1, color: '#323338', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.g2}</span>
                    <span style={{ fontSize: '11px', color: '#c3c6d4', flexShrink: 0 }}>{row.count}</span>
                  </div>
                );
              }
              // lane row — left column is empty (item info is on the bars)
              return (
                <div key={`lL-${row.g1}-${row.g2}-${idx}`}
                  style={{ height: ITEM_HEIGHT, background: idx % 2 === 0 ? '#fff' : '#fafbfd', borderLeft: `2px solid ${row.color.border}30`, borderBottom: '1px solid #f4f5f7' }}
                />
              );
            })}
          </div>

          {/* Timeline body */}
          <div style={{ width: totalWidth, flexShrink: 0, position: 'relative' }}>
            {depArrowsSvg}
            {rows.map((row, idx) => {
              if (row.type === 'group') {
                return (
                  <div key={`rG-${row.g1}`} style={{ position: 'relative', height: GROUP_HEIGHT, background: row.color.bg, borderBottom: `1px solid ${row.color.border}20`, opacity: 0.8 }}>
                    {weekendShadingByHeight.group}
                    {todayLineEl}
                    <RollupBar s={row.rollup.s} e={row.rollup.e} bufferStart={bufferStart} totalDays={totalDays} color={row.color} height={10} />
                  </div>
                );
              }
              if (row.type === 'sub') {
                return (
                  <div key={`rS-${row.g1}-${row.g2}`} style={{ position: 'relative', height: SUB_HEIGHT, background: '#fff', borderBottom: '1px solid #f0f1f3' }}
                    onMouseDown={(e) => handleBgMouseDown(e, row.g1, row.g2)}
                  >
                    {weekendShadingByHeight.sub}
                    {todayLineEl}
                    <RollupBar s={row.rollup.s} e={row.rollup.e} bufferStart={bufferStart} totalDays={totalDays} color={row.color} height={8} />
                    {createDrag?.g1 === row.g1 && createDrag?.g2 === row.g2 && (
                      <CreatePreview startDay={createDrag.startDay} endDay={createDrag.curDay} color={row.color} rowH={SUB_HEIGHT} />
                    )}
                  </div>
                );
              }
              // lane row — may contain multiple non-overlapping bars
              const bg = idx % 2 === 0 ? '#fff' : '#fafbfd';
              const laneKey = `rL-${row.g1}-${row.g2}-${idx}`;
              return (
                <div key={laneKey}
                  style={{ position: 'relative', height: ITEM_HEIGHT, background: bg, borderBottom: '1px solid #F4F5F7' }}
                >
                  <div style={{ position: 'absolute', inset: 0, zIndex: 0, cursor: 'crosshair' }}
                    onMouseDown={(e) => handleBgMouseDown(e, row.g1, row.g2)}
                  />
                  {weekendShadingByHeight.item}
                  {todayLineEl}
                  {row.items.map(item =>
                    item._type === 'custom'
                      ? <EventBar key={item.id} event={item} viewStart={bufferStart} dayWidth={DAY_WIDTH} rowHeight={ITEM_HEIGHT} barPadding={BAR_PADDING} totalDays={totalDays} onEdit={onEditEvent} onDelete={onDeleteEvent} onUpdate={onUpdateEvent} />
                      : <GanttBar key={item.key} issue={item} viewStart={bufferStart} dayWidth={DAY_WIDTH} rowHeight={ITEM_HEIGHT} barPadding={BAR_PADDING} totalDays={totalDays} squadColor={row.color} onUpdate={onUpdateIssue} startDateField={sdf} endDateField={edf} onPreview={onPreviewIssue} previewFields={previewFields} availableFields={availableFields} />
                  )}
                  {createDrag?.g1 === row.g1 && createDrag?.g2 === row.g2 && (
                    <CreatePreview startDay={createDrag.startDay} endDay={createDrag.curDay} color={row.color} rowH={ITEM_HEIGHT} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  outer:      { position: 'relative', flex: 1, overflow: 'hidden', background: '#fafbfd' },
  leftHeader: {
    position: 'absolute', left: 0, top: 0, width: LEFT_WIDTH, height: HEADER_HEIGHT,
    background: '#fff', borderRight: '2px solid #e6e9ef', borderBottom: '2px solid #e6e9ef',
    zIndex: 11, display: 'flex', alignItems: 'center', padding: '0 14px',
  },
  weekLabel: {
    position: 'absolute', top: 0, height: 22, display: 'flex', alignItems: 'center',
    paddingLeft: '8px', fontSize: '11px', fontWeight: 700, color: '#323338',
    letterSpacing: '0.8px', textTransform: 'uppercase',
    borderRight: '1px solid #e6e9ef', boxSizing: 'border-box',
  },
  dayCell: {
    position: 'absolute', top: 2, width: DAY_WIDTH - 2, height: 30,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    borderRadius: 4, boxSizing: 'border-box', margin: '0 1px',
  },
  dayName:    { fontSize: '9px', opacity: 0.65, letterSpacing: '0.3px', textTransform: 'uppercase' },
  dayNum:     { fontWeight: 700, fontSize: '13px', lineHeight: 1 },
  todayLine:  { position: 'absolute', top: 0, bottom: 0, width: 1, background: '#0073ea', zIndex: 4, pointerEvents: 'none' },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', color: '#676879', background: '#fafbfd' },
};
