import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import GanttBar from './GanttBar';
import EventBar from './EventBar';
import { C, T } from '../tokens';

const LEFT_WIDTH      = 260;
const DAY_WIDTH       = 38;
const GROUP_HEIGHT    = 36;
const SUB_HEIGHT      = 22;   // compact sub-group label strip
const ITEM_HEIGHT     = 44;
const HEADER_HEIGHT   = 62;
const BAR_PADDING     = 6;

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

const _subColorMap = new Map();
function getSubColor(name) {
  if (!_subColorMap.has(name)) {
    _subColorMap.set(name, SQUAD_COLORS[_subColorMap.size % SQUAD_COLORS.length]);
  }
  return _subColorMap.get(name);
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
  if (!s && !e) { const r = new Date(); r.setHours(0,0,0,0); s = r; e = addDays(r, 2); }
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

// Build a nested grouping structure for N levels.
// Returns either an array of leaf items (at depth === fields.length)
// or an object mapping group key -> nested structure.
function groupItemsN(items, fields, depth) {
  if (depth >= fields.length) return items;
  const f = fields[depth];
  const groups = {};
  for (const item of items) {
    const key = item._type === 'custom'
      ? (item.groupValues?.[f] ?? (depth === 0 ? (item.squad ?? 'No Squad') : (item.developer ?? 'Unassigned')))
      : (getFieldValue(item.fields, f) || 'None');
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  }
  // Recursively group each bucket
  const result = {};
  for (const key of Object.keys(groups)) {
    result[key] = groupItemsN(groups[key], fields, depth + 1);
  }
  return result;
}

const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtShort(d) {
  if (!d) return '';
  return `${SHORT_MONTHS[d.getMonth()]} ${d.getDate()}`;
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

  // Sort by start date so items fill earlier lanes optimally.
  dated.sort((a, b) => a.s - b.s);

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
  groupByFields,
  availableFields,
  startDateField, endDateField,
  scrollToTarget, onVisibleMonthChange,
  onEditEvent, onDeleteEvent, onUpdateEvent, onUpdateIssue, onCreateEvent,
  onPreviewIssue, previewFields,
  showCriticalPath,
  activeBaseline,
  holidays,
  onDeleteLink, onCreateLink, onFieldUpdate, getIssueDates,
}) {
  const scrollRef     = useRef(null);
  const lastMonthRef  = useRef(null);
  const [collapsedKeys, setCollapsedKeys] = useState(new Set());
  const [createDrag, setCreateDrag]           = useState(null);
  const [linkDrag, setLinkDrag]               = useState(null);
  const [draggingKey, setDraggingKey]         = useState(null);
  const linkTargetRef                         = useRef(null);
  const linkSvgRef                            = useRef(null);
  const linkDragStateRef                      = useRef(null);
  const hoverHighlightRef                     = useRef(null);
  const rafScrollRef                          = useRef(null);
  // Visible day range for day-cell rendering (performance)
  const [visRange, setVisRange] = useState({ from: 0, to: 160 });

  const sdf    = startDateField || 'customfield_10015';
  const edf    = endDateField   || 'duedate';
  const fields = (groupByFields && groupByFields.length > 0) ? groupByFields : ['labels', 'assignee'];
  const fieldLabel = (id) => (availableFields || []).find(f => f.id === id)?.name || id;

  // Fixed 4-year buffer centered around today.
  // Memoized on year so dependent useMemos (dependency arrows, etc.) don't
  // re-run every render due to a fresh Date object.
  const todayYear = today.getFullYear();
  const bufferStart = useMemo(() => new Date(todayYear - 1, 0, 1), [todayYear]);
  const bufferEnd   = useMemo(() => new Date(todayYear + 3, 0, 0), [todayYear]);
  const totalDays   = daysBetween(bufferStart, bufferEnd) + 1;
  const totalWidth  = totalDays * DAY_WIDTH;
  const todayOff    = daysBetween(bufferStart, today) * DAY_WIDTH;

  // Holiday lookup map: 'YYYY-MM-DD' → name
  const holidaySet = useMemo(() => {
    const m = new Map();
    for (const h of (holidays || [])) {
      if (h && h.date) m.set(h.date, h.name || 'Holiday');
    }
    return m;
  }, [holidays]);

  // Scroll to target when it changes (navigation arrows / Today button)
  useEffect(() => {
    if (!scrollToTarget || !scrollRef.current) return;
    if (scrollToTarget.today) {
      scrollRef.current.scrollLeft = Math.max(0, todayOff - 100);
    } else {
      const focusDate = new Date(scrollToTarget.year, scrollToTarget.month, 1);
      const off = Math.max(0, daysBetween(bufferStart, focusDate)) * DAY_WIDTH;
      scrollRef.current.scrollLeft = off;
    }
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
  const allItems = useMemo(() => [
    ...issues.map(iss => ({ ...iss, _type: 'jira' })),
    ...(customEvents || []).map(evt => ({ ...evt, _type: 'custom' })),
  ], [issues, customEvents]);

  const grouped = useMemo(() => groupItemsN(allItems, fields, 0), [allItems, fields]);

  const rows = useMemo(() => {
    const r = [];

    // Recursively flatten nested group structure into rows
    function flatten(node, depth, pathKey, color) {
      if (Array.isArray(node)) {
        // Leaf: array of items → pack into lanes
        const lanes = packItems(node, sdf, edf);
        for (const laneItems of lanes) {
          r.push({ type: 'lane', depth, pathKey, color, items: laneItems });
        }
        return;
      }
      // Object: iterate sorted keys
      const keys = Object.keys(node).sort();
      for (const key of keys) {
        const childPath = pathKey ? `${pathKey}||${key}` : key;
        if (depth === 0) {
          const rowColor = getSquadColor(key);
          function collectLeaves(n) {
            if (Array.isArray(n)) return n;
            return Object.values(n).flatMap(collectLeaves);
          }
          const nodeItems = collectLeaves(node[key]);
          const rollup = computeRollup(nodeItems, sdf, edf);
          r.push({ type: 'groupHeader', depth: 0, key, pathKey: childPath, color: rowColor, rollup, count: nodeItems.length, label: key });
          if (!collapsedKeys.has(childPath)) {
            flatten(node[key], depth + 1, childPath, rowColor);
          }
        } else {
          // depth ≥ 1: compact label strip, colored by sub-group key
          const subColor = getSubColor(key);
          function collectLeaves2(n) {
            if (Array.isArray(n)) return n;
            return Object.values(n).flatMap(collectLeaves2);
          }
          const nodeItems2 = collectLeaves2(node[key]);
          const rollup2 = computeRollup(nodeItems2, sdf, edf);
          r.push({ type: 'groupHeader', depth: 1, key, pathKey: childPath, color: subColor, rollup: rollup2, count: nodeItems2.length, label: key });
          if (!collapsedKeys.has(childPath)) {
            flatten(node[key], depth + 1, childPath, subColor);
          }
        }
      }
    }

    flatten(grouped, 0, '', null);
    return r;
  }, [grouped, collapsedKeys, sdf, edf, fields]);

  // ── Dependency arrows: position map + arrow data ──────────────────────────
  const { depArrows, totalRowsHeight } = useMemo(() => {
    const map = {};
    let cumulY = 0;
    for (const row of rows) {
      const rowH = row.type === 'groupHeader' ? (row.depth === 0 ? GROUP_HEIGHT : SUB_HEIGHT) : ITEM_HEIGHT;
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
          arrows.push({ predEndX, predMidY: pred.midY, succStartX, succMidY: succ.midY, violated, predKey, succKey });
        }
      }
    }

    return { depArrows: arrows, totalRowsHeight: cumulY };
  }, [rows, sdf, edf, bufferStart]);

  // ── Critical path computation (Kahn's topological sort) ──────────────────
  const criticalPathSet = useMemo(() => {
    if (!showCriticalPath) return new Set();

    // Build adjacency from issue data restricted to rendered issues
    const nodeKeys = new Set();
    const adj = {};      // predecessor -> [successor]
    const revAdj = {};   // successor -> [predecessor]
    const inDegree = {};
    const duration = {};

    // Collect all jira items from lane rows
    for (const row of rows) {
      if (row.type !== 'lane') continue;
      for (const item of row.items) {
        if (item._type !== 'jira') continue;
        const key = item.key;
        const { s, e } = getItemDates(item, sdf, edf);
        const dur = daysBetween(s, e) + 1;
        if (!nodeKeys.has(key)) {
          nodeKeys.add(key);
          duration[key] = Math.max(dur, 1);
          if (!adj[key]) adj[key] = [];
          if (!revAdj[key]) revAdj[key] = [];
          if (!(key in inDegree)) inDegree[key] = 0;
        }
      }
    }

    if (nodeKeys.size === 0) return new Set();

    // Build edges from issue links (deduplicate to avoid double-counting)
    const edgeSeen = new Set();
    for (const row of rows) {
      if (row.type !== 'lane') continue;
      for (const item of row.items) {
        if (item._type !== 'jira') continue;
        const links = item.fields?.issuelinks;
        if (!links || !links.length) continue;
        for (const link of links) {
          if (link.type?.name !== 'Blocks' || !link.outwardIssue) continue;
          const predKey = item.key;
          const succKey = link.outwardIssue.key;
          if (predKey === succKey) continue;
          if (!nodeKeys.has(predKey) || !nodeKeys.has(succKey)) continue;
          const edgeKey = `${predKey}->${succKey}`;
          if (edgeSeen.has(edgeKey)) continue;
          edgeSeen.add(edgeKey);
          adj[predKey].push(succKey);
          revAdj[succKey].push(predKey);
          inDegree[succKey] = (inDegree[succKey] || 0) + 1;
        }
      }
    }

    // Kahn's algorithm for topological sort + earliest finish computation
    const earliestFinish = {};
    const queue = [];
    for (const key of nodeKeys) {
      earliestFinish[key] = duration[key];
      if ((inDegree[key] || 0) === 0) queue.push(key);
    }

    let processed = 0;
    while (queue.length > 0) {
      const node = queue.shift();
      processed++;
      for (const succ of (adj[node] || [])) {
        const candidate = earliestFinish[node] + duration[succ];
        if (candidate > earliestFinish[succ]) {
          earliestFinish[succ] = candidate;
        }
        inDegree[succ]--;
        if (inDegree[succ] === 0) queue.push(succ);
      }
    }

    // Cycle detection: if we didn't process all nodes, there's a cycle
    if (processed < nodeKeys.size) return new Set();

    // Find the node with the largest earliest finish
    let maxEF = -1;
    let endNode = null;
    for (const key of nodeKeys) {
      if (earliestFinish[key] > maxEF) {
        maxEF = earliestFinish[key];
        endNode = key;
      }
    }

    if (!endNode) return new Set();

    // Trace backward: always pick the predecessor with the largest earliestFinish
    const path = new Set();
    let current = endNode;
    while (current) {
      path.add(current);
      const preds = (revAdj[current] || []).filter(p => (adj[p] || []).includes(current));
      if (preds.length === 0) break;
      let bestPred = null;
      let bestEF = -1;
      for (const p of preds) {
        if (earliestFinish[p] > bestEF) {
          bestEF = earliestFinish[p];
          bestPred = p;
        }
      }
      current = bestPred;
    }

    return path;
  }, [showCriticalPath, rows, sdf, edf]);

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
          const isCriticalArrow = showCriticalPath && criticalPathSet.has(a.predKey) && criticalPathSet.has(a.succKey);
          let color, sw;
          if (isCriticalArrow && a.violated) {
            color = C.critical;
            sw = 2;
          } else if (isCriticalArrow) {
            color = C.critical;
            sw = 1.5;
          } else if (a.violated) {
            color = C.critical;
            sw = 1.5;
          } else {
            // Normal: ink4
            color = C.ink4;
            sw = 1;
          }
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
            <g key={i} opacity={isCriticalArrow || a.violated ? 1 : 0.55}>
              <path d={d} fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" />
              <polygon points={ah} fill={color} />
            </g>
          );
        })}
      </svg>
    );
  }, [depArrows, totalWidth, totalRowsHeight, showCriticalPath, criticalPathSet]);

  function toggleKey(key) {
    setCollapsedKeys(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
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

  function handleLinkDragStart(sourceKey, direction, startX, startY) {
    // Show SVG overlay via state (just to mount the element)
    setLinkDrag({ x1: startX, y1: startY, x2: startX, y2: startY });
    linkDragStateRef.current = { x1: startX, y1: startY };
    linkTargetRef.current = null;

    const onMove = (ev) => {
      // Update SVG directly via ref — no React re-render, 60fps smooth
      if (linkSvgRef.current) {
        const line = linkSvgRef.current.querySelector('line');
        const circle = linkSvgRef.current.querySelector('circle');
        if (line) {
          line.setAttribute('x2', ev.clientX);
          line.setAttribute('y2', ev.clientY);
        }
        if (circle) {
          circle.setAttribute('cx', ev.clientX);
          circle.setAttribute('cy', ev.clientY);
        }
      }
      const els = document.elementsFromPoint(ev.clientX, ev.clientY);
      const barEl = els.find(el => el.dataset?.issueKey);
      linkTargetRef.current = barEl ? barEl.dataset.issueKey : null;
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const target = linkTargetRef.current;
      setLinkDrag(null);
      linkTargetRef.current = null;
      linkDragStateRef.current = null;
      if (target && target !== sourceKey && onCreateLink) {
        // direction 'inward' means sourceKey is blocked by target → target blocks sourceKey
        if (direction === 'inward') {
          onCreateLink(target, sourceKey);
        } else {
          onCreateLink(sourceKey, target);
        }
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function handleBgMouseDown(e, pathKey) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startDay = getDay(e.clientX);
    setCreateDrag({ pathKey, startDay, curDay: startDay });

    const onMove = (ev) => setCreateDrag(p => p ? { ...p, curDay: getDay(ev.clientX) } : null);
    const onUp   = (ev) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      const endDay = getDay(ev.clientX);
      const lo = Math.min(startDay, endDay), hi = Math.max(startDay, endDay);
      setCreateDrag(null);
      if (onCreateEvent) {
        // Pass g1/g2 from pathKey parts for backward compat with EventModal
        const parts = pathKey.split('||');
        onCreateEvent({
          startDate: fmtISODate(addDays(bufferStart, lo)),
          endDate:   fmtISODate(addDays(bufferStart, hi)),
          g1: parts[0] || '',
          g2: parts[1] || '',
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
            <div key={`m-${mStart}`} style={{ ...styles.weekLabel, left: mStart * DAY_WIDTH, width: (i - mStart) * DAY_WIDTH, fontWeight: 600, fontSize: '11px', color: C.ink2 }}>
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
      const holidayName = holidaySet.get(fmtISODate(d));
      const isHoliday = !!holidayName;
      // Day cell absolute-positioned at its correct offset
      const DOW = ['S','M','T','W','T','F','S'];
      dayEls.push(
        <div key={i} title={isHoliday ? holidayName : undefined} style={{
          ...styles.dayCell, left: i * DAY_WIDTH,
          background: 'transparent',
        }}>
          <div style={{ ...styles.dayName, color: isWeekend ? C.line : C.ink4 }}>{DOW[d.getDay()]}</div>
          {isToday ? (
            <div style={{
              width: 16, height: 16, borderRadius: '50%',
              background: C.primary, color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '10.5px', fontWeight: 700, lineHeight: 1,
            }}>{d.getDate()}</div>
          ) : (
            <div style={{ ...styles.dayNum, color: isHoliday ? C.accent : isWeekend ? C.ink4 : C.ink3 }}>{d.getDate()}</div>
          )}
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
          background: `${C.primary}18`,
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
          // Skip weekend shading for days that are also holidays (holiday takes priority)
          if (!holidaySet.has(fmtISODate(d))) {
            out.push(<div key={i} style={{ position: 'absolute', left: i * DAY_WIDTH, top: 0, width: DAY_WIDTH, height: rowH, background: C.weekend, pointerEvents: 'none' }} />);
          }
        }
      }
      return out;
    }
    return { group: make(GROUP_HEIGHT), sub: make(SUB_HEIGHT), item: make(ITEM_HEIGHT) };
  }, [visRange.from, visRange.to, holidaySet]);

  // Memoize holiday shading — one div per visible holiday day
  const holidayShadingByHeight = useMemo(() => {
    if (holidaySet.size === 0) return { group: [], sub: [], item: [] };
    function make(rowH) {
      const out = [];
      for (let i = visRange.from; i <= visRange.to && i < totalDays; i++) {
        const d = addDays(bufferStart, i);
        if (holidaySet.has(fmtISODate(d))) {
          out.push(<div key={`h${i}`} style={{ position: 'absolute', left: i * DAY_WIDTH, top: 0, width: DAY_WIDTH, height: rowH, background: C.holiday, pointerEvents: 'none' }} />);
        }
      }
      return out;
    }
    return { group: make(GROUP_HEIGHT), sub: make(SUB_HEIGHT), item: make(ITEM_HEIGHT) };
  }, [visRange.from, visRange.to, holidaySet]);

  const todayLineEl = useMemo(() =>
    todayOff >= 0 && todayOff <= totalWidth
      ? (
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: todayOff, width: 0, zIndex: 4, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: '1.5px', background: C.amber }} />
        </div>
      )
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

  const headerLabel = fields.map(f => fieldLabel(f).toUpperCase()).join(' / ');

  return (
    <div style={styles.outer}>
      {/* Rubber-band dependency line during drag — DOM-mutated directly for 60fps */}
      {linkDrag && (
        <svg ref={linkSvgRef} style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 9999 }}>
          <line x1={linkDrag.x1} y1={linkDrag.y1} x2={linkDrag.x1} y2={linkDrag.y1} stroke="#0073ea" strokeWidth={2} strokeDasharray="6,3" />
          <circle cx={linkDrag.x1} cy={linkDrag.y1} r={5} fill="#0073ea" opacity={0.8} />
        </svg>
      )}
      {/* Left header */}
      <div style={styles.leftHeader}>
        <span style={{ fontWeight: 600, fontSize: '11px', color: C.ink4, letterSpacing: '0.3px', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{headerLabel}</span>
        <span style={{ fontSize: '11px', color: C.ink4, flexShrink: 0, marginLeft: '6px' }}>
          {issues.length} issue{issues.length !== 1 ? 's' : ''}
          {(customEvents || []).length > 0 ? ` · ${customEvents.length} event${customEvents.length !== 1 ? 's' : ''}` : ''}
        </span>
      </div>

      {/* Timeline header (scrolls in sync with body) */}
      <div style={{ position: 'absolute', left: LEFT_WIDTH, top: 0, right: 0, height: HEADER_HEIGHT, overflowX: 'hidden', background: C.bg, borderBottom: `1px solid ${C.line}`, zIndex: 10 }} id="gantt-header-scroll">
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
          <div style={{ width: LEFT_WIDTH, flexShrink: 0, position: 'sticky', left: 0, zIndex: 5, background: C.bg, borderRight: `1px solid ${C.line}` }}>
            {rows.map((row, idx) => {
              if (row.type === 'groupHeader') {
                const col = row.color;
                const isCol = collapsedKeys.has(row.pathKey);
                const isDepth0 = row.depth === 0;
                const rowH = isDepth0 ? GROUP_HEIGHT : SUB_HEIGHT;
                if (isDepth0) {
                  return (
                    <div key={`lH-${row.pathKey}`}
                      style={{ height: rowH, display: 'flex', alignItems: 'center', gap: '6px', paddingLeft: 12, paddingRight: '10px', background: C.bgSunken, borderBottom: `1px solid ${C.line2}`, cursor: 'pointer', userSelect: 'none', overflow: 'hidden' }}
                      onClick={() => toggleKey(row.pathKey)}
                    >
                      <span style={{ fontSize: '12px', fontWeight: 600, color: C.ink, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
                      <span style={{ fontSize: '11px', color: C.ink4, flexShrink: 0 }}>{row.count}</span>
                      <span style={{ fontSize: '10px', color: C.ink4, flexShrink: 0, display: 'inline-block', transform: isCol ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▾</span>
                    </div>
                  );
                }
                // depth ≥ 1: compact colored label strip
                const dateRange = row.rollup?.s && row.rollup?.e
                  ? `${fmtShort(row.rollup.s)} – ${fmtShort(row.rollup.e)}`
                  : null;
                return (
                  <div key={`lH-${row.pathKey}`}
                    style={{ height: rowH, display: 'flex', alignItems: 'center', background: `${col.bg}99`, borderBottom: `1px solid ${col.border}30`, borderLeft: `3px solid ${col.border}`, paddingLeft: 10, paddingRight: 8, cursor: 'pointer', userSelect: 'none', overflow: 'hidden', gap: 4 }}
                    onClick={() => toggleKey(row.pathKey)}
                  >
                    <span style={{ fontSize: '10.5px', fontWeight: 600, color: col.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0 }}>{row.label}</span>
                    {dateRange && <span style={{ fontSize: '9.5px', color: col.text, opacity: 0.65, flexShrink: 0, whiteSpace: 'nowrap' }}>{dateRange}</span>}
                    <span style={{ fontSize: '9px', color: col.text, opacity: 0.6, flexShrink: 0, display: 'inline-block', transform: isCol ? 'rotate(-90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>▾</span>
                  </div>
                );
              }
              // lane row — left column is empty (item info is on the bars)
              return (
                <div key={`lL-${row.pathKey}-${idx}`}
                  style={{ height: ITEM_HEIGHT, background: C.bg, borderBottom: `1px solid ${C.line2}` }}
                />
              );
            })}
          </div>

          {/* Timeline body */}
          <div style={{ width: totalWidth, flexShrink: 0, position: 'relative' }}>
            {!draggingKey && depArrowsSvg}
            {rows.map((row, idx) => {
              if (row.type === 'groupHeader') {
                const isDepth0 = row.depth === 0;
                const rowH = isDepth0 ? GROUP_HEIGHT : SUB_HEIGHT;
                const bg = isDepth0 ? C.bgSunken : `${row.color.bg}60`;
                const borderCol = isDepth0 ? C.line2 : `${row.color.border}30`;
                return (
                  <div key={`rH-${row.pathKey}`} style={{ position: 'relative', height: rowH, background: bg, borderBottom: `1px solid ${borderCol}` }}
                    onMouseDown={(e) => handleBgMouseDown(e, row.pathKey)}
                  >
                    {todayLineEl}
                    {isDepth0 && <RollupBar s={row.rollup.s} e={row.rollup.e} bufferStart={bufferStart} totalDays={totalDays} color={row.color} height={10} />}
                    {!isDepth0 && <RollupBar s={row.rollup?.s} e={row.rollup?.e} bufferStart={bufferStart} totalDays={totalDays} color={row.color} height={5} />}
                    {createDrag?.pathKey === row.pathKey && (
                      <CreatePreview startDay={createDrag.startDay} endDay={createDrag.curDay} color={row.color} rowH={rowH} />
                    )}
                  </div>
                );
              }
              // lane row — may contain multiple non-overlapping bars
              const laneKey = `rL-${row.pathKey}-${idx}`;
              return (
                <div key={laneKey}
                  style={{ position: 'relative', height: ITEM_HEIGHT, background: C.bg, borderBottom: `1px solid ${C.line2}` }}
                >
                  <div style={{ position: 'absolute', inset: 0, zIndex: 0, cursor: 'crosshair' }}
                    onMouseDown={(e) => handleBgMouseDown(e, row.pathKey)}
                  />
                  {weekendShadingByHeight.item}
                  {holidayShadingByHeight.item}
                  {todayLineEl}
                  {/* Ghost baseline bars — rendered before current bars so they sit behind */}
                  {activeBaseline && row.items.map(item => {
                    const snap = activeBaseline.snapshot;
                    if (!snap) return null;
                    if (item._type === 'custom') {
                      const blEvt = (snap.events || []).find(e => e.id === item.id);
                      if (!blEvt) return null;
                      const bls = parseDate(blEvt.startDate);
                      const ble = parseDate(blEvt.endDate);
                      if (!bls && !ble) return null;
                      const s = bls || ble;
                      const e = ble || addDays(bls, 1);
                      const isMilestone = item.type === 'milestone' || (s.getTime() === e.getTime());
                      const startOff = daysBetween(bufferStart, s);
                      const endOff = daysBetween(bufferStart, e) + (isMilestone ? 0 : 1);
                      const clippedStart = Math.max(0, startOff);
                      const clippedEnd = Math.min(totalDays, endOff);
                      if (clippedEnd <= clippedStart && !isMilestone) return null;
                      if (isMilestone) {
                        const cx = startOff * DAY_WIDTH + DAY_WIDTH / 2;
                        const sz = ITEM_HEIGHT - BAR_PADDING * 2 - 4;
                        return (
                          <div key={`ghost-evt-${item.id}`} style={{
                            position: 'absolute',
                            left: cx - sz / 2, top: BAR_PADDING + 2,
                            width: sz, height: sz,
                            background: '#97A0AF',
                            opacity: 0.35,
                            border: '1.5px dashed #6B778C',
                            transform: 'rotate(45deg)',
                            borderRadius: '2px',
                            pointerEvents: 'none',
                            zIndex: 1,
                          }} />
                        );
                      }
                      const gLeft = clippedStart * DAY_WIDTH;
                      const gWidth = Math.max((clippedEnd - clippedStart) * DAY_WIDTH, DAY_WIDTH * 0.5);
                      return (
                        <div key={`ghost-evt-${item.id}`} style={{
                          position: 'absolute',
                          left: gLeft, top: BAR_PADDING,
                          width: gWidth, height: ITEM_HEIGHT - BAR_PADDING * 2,
                          background: '#97A0AF',
                          opacity: 0.35,
                          border: '1.5px dashed #6B778C',
                          borderRadius: '6px',
                          pointerEvents: 'none',
                          zIndex: 1,
                        }} />
                      );
                    }
                    // Jira issue ghost bar
                    const blIssue = (snap.issues || {})[item.key];
                    if (!blIssue) return null;
                    const bls = parseDate(blIssue.startDate);
                    const ble = parseDate(blIssue.endDate);
                    if (!bls && !ble) return null;
                    const s = bls || addDays(ble, -7);
                    const e = ble || addDays(bls, 7);
                    const startOff = daysBetween(bufferStart, s);
                    const endOff = daysBetween(bufferStart, e) + 1;
                    const clippedStart = Math.max(0, startOff);
                    const clippedEnd = Math.min(totalDays, endOff);
                    if (clippedEnd <= clippedStart) return null;
                    const gLeft = clippedStart * DAY_WIDTH;
                    const gWidth = Math.max((clippedEnd - clippedStart) * DAY_WIDTH, DAY_WIDTH * 0.5);
                    return (
                      <div key={`ghost-${item.key}`} style={{
                        position: 'absolute',
                        left: gLeft, top: BAR_PADDING,
                        width: gWidth, height: ITEM_HEIGHT - BAR_PADDING * 2,
                        background: '#97A0AF',
                        opacity: 0.35,
                        border: '1.5px dashed #6B778C',
                        borderRadius: '6px',
                        pointerEvents: 'none',
                        zIndex: 1,
                      }} />
                    );
                  })}
                  {row.items.map(item =>
                    item._type === 'custom'
                      ? <EventBar key={item.id} event={item} viewStart={bufferStart} dayWidth={DAY_WIDTH} rowHeight={ITEM_HEIGHT} barPadding={BAR_PADDING} totalDays={totalDays} onEdit={onEditEvent} onDelete={onDeleteEvent} onUpdate={onUpdateEvent} />
                      : <GanttBar key={item.key} issue={item} viewStart={bufferStart} dayWidth={DAY_WIDTH} rowHeight={ITEM_HEIGHT} barPadding={BAR_PADDING} totalDays={totalDays} squadColor={row.color} onUpdate={onUpdateIssue} startDateField={sdf} endDateField={edf} onPreview={onPreviewIssue} previewFields={previewFields} availableFields={availableFields} isCritical={showCriticalPath && criticalPathSet.has(item.key)} onLinkDragStart={handleLinkDragStart} onDeleteLink={onDeleteLink} onFieldUpdate={onFieldUpdate} getIssueDates={getIssueDates} onDragStart={() => setDraggingKey(item.key)} onDragEnd={() => setDraggingKey(null)} />
                  )}
                  {createDrag?.pathKey === row.pathKey && (
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
  outer:      { position: 'relative', flex: 1, overflow: 'hidden', background: C.bg },
  leftHeader: {
    position: 'absolute', left: 0, top: 0, width: LEFT_WIDTH, height: HEADER_HEIGHT,
    background: C.bg, borderRight: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`,
    zIndex: 11, display: 'flex', alignItems: 'center', padding: '0 14px',
  },
  weekLabel: {
    position: 'absolute', top: 0, height: 22, display: 'flex', alignItems: 'center',
    paddingLeft: '8px', fontSize: '11px', fontWeight: 600, color: C.ink2,
    letterSpacing: '0.3px',
    borderRight: `1px solid ${C.line2}`, boxSizing: 'border-box',
  },
  dayCell: {
    position: 'absolute', top: 4, width: DAY_WIDTH - 2, height: 28,
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    boxSizing: 'border-box', margin: '0 1px',
  },
  dayName:    { fontSize: '8.5px', letterSpacing: '0.3px', textTransform: 'uppercase', lineHeight: 1, marginBottom: 2 },
  dayNum:     { fontWeight: 400, fontSize: '10.5px', lineHeight: 1 },
  emptyState: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', color: C.ink3, background: C.bg },
};
