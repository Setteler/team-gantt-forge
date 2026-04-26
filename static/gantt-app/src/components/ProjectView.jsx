import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { router, invoke } from '@forge/bridge';
import { getValueColor, colorValueOf, DEFAULT_BAR_COLOR, DEFAULT_BAR_BORDER } from '../colorBy';

// ── Inline editor helpers (shared with IssuePreview; duplicated here so the
//    Project view can stand alone without cross-imports) ─────────────────────
const PRIORITY_OPTIONS = ['Highest', 'High', 'Medium', 'Low', 'Lowest'];
// Status is explicitly read-only here (per user request) — clicking it should
// not open any editor. Other read-only fields are ones we don't yet have
// proper pickers for (user picker, project picker, etc.).
const READ_ONLY_FIELD_IDS = new Set(['status', 'assignee', 'reporter', 'issuetype', 'project', 'resolution', 'created', 'updated', 'key']);
function getSchemaType(fieldId, availableFields) {
  const f = availableFields?.find(f => f.id === fieldId);
  return f?.schemaType || f?.schema?.type || null;
}
// Pull a single comparable primitive out of a field value for sorting.
// Returns null for empty, number for numeric, string otherwise.
function extractSortValue(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'number' || typeof raw === 'boolean') return typeof raw === 'number' ? raw : Number(raw);
  if (typeof raw === 'string') {
    // Dates as ISO strings sort lexicographically = chronologically
    const n = Number(raw);
    return Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(raw.trim()) ? n : raw.toLowerCase();
  }
  if (Array.isArray(raw)) {
    const first = raw[0];
    if (first == null) return null;
    return typeof first === 'string' ? first.toLowerCase() : (first.name || first.displayName || first.value || first.key || '').toString().toLowerCase();
  }
  return (raw.name || raw.displayName || raw.value || raw.key || '').toString().toLowerCase();
}

function getEditorType(fieldId, availableFields, sdf, edf) {
  if (READ_ONLY_FIELD_IDS.has(fieldId)) return null;
  if (fieldId === 'priority') return 'priority';
  if (fieldId === 'labels')   return 'labels';
  if (fieldId === 'duedate' || fieldId === sdf || fieldId === edf || fieldId === 'customfield_10015') return 'date';
  const type = getSchemaType(fieldId, availableFields);
  if (type === 'date' || type === 'datetime') return 'date';
  if (type === 'string') return 'text';
  if (type === 'number') return 'number';
  return null;
}

const NAME_COL_DEFAULT   = 340; // initial Name-column width (user can resize)
const NAME_COL_MIN       = 240; // Name never collapses below this
const NAME_COL_MAX       = 800;
const FIELD_COL_NATURAL  = 140; // preferred width per extra field
const FIELD_COL_MIN      = 28;  // collapsed field — only a sliver visible (like Jira Advanced Roadmaps)
const FIELD_COL_MAX      = 400; // upper bound when user drags a column wider
const TREE_WIDTH_DEFAULT = 760; // Name (340) + 3 × field (140) at natural size
const TREE_WIDTH_MIN     = 260;
const TREE_WIDTH_MAX     = 1600;
// Day-width is determined by the timelineZoom prop:
//   day     → 38 px/day  (full day cells; ~265px per week)
//   month   → 8  px/day  (~240px per month; bar text legible)
//   quarter → 3  px/day  (~270px per quarter; bars are clearly visible)
function dayWidthFor(zoom) {
  if (zoom === 'month')   return 8;
  if (zoom === 'quarter') return 3;
  return 38;
}
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
  onUpdateIssueField,
  colorByField, colorByValues, timelineZoom, timelineZoomScale,
}) {
  const outerRef      = useRef(null);
  const bodyRef       = useRef(null);
  const lastMonthRef  = useRef(null);
  const rafScrollRef  = useRef(null);

  const [collapsed, setCollapsed]     = useState(new Set());
  const [selectedKey, setSelectedKey] = useState(null);
  const [hoveredKey, setHoveredKey]   = useState(null);
  const [visRange, setVisRange]       = useState({ from: 0, to: 160 });
  // Initial tree-panel width sized to fit every column at natural width
  // (so whatever the user had saved shows up fully on first render).
  const [treeWidth, setTreeWidth]     = useState(() => {
    const fieldCount = (listFields || []).filter(fid => fid && fid !== 'summary').length;
    return Math.min(TREE_WIDTH_MAX, Math.max(TREE_WIDTH_DEFAULT, NAME_COL_DEFAULT + fieldCount * FIELD_COL_NATURAL));
  });
  const [nameWidthUser, setNameWidthUser] = useState(NAME_COL_DEFAULT);
  const [showTimeline, setShowTimeline] = useState(true);
  const [dragFieldId, setDragFieldId] = useState(null);
  const [dropBeforeFieldId, setDropBeforeFieldId] = useState(null);
  // Inline-edit state: which cell is currently being edited (null = none)
  const [editingCell, setEditingCell] = useState(null); // { issueKey, fieldId, draft, loading?, transitions? } | null
  // Bar drag state
  const [draggingBar, setDraggingBar] = useState(null); // { key, delta } | null
  // Sort by field column (click header to sort)
  const [sortField, setSortField] = useState(null);      // fieldId | null
  const [sortDir, setSortDir]     = useState('desc');    // 'asc' | 'desc'
  // Collapsed columns — double-click header to collapse to a narrow strip
  // with vertical text. Double-click again to expand.
  const [collapsedCols, setCollapsedCols] = useState(new Set());
  // User-set column widths keyed by fieldId (override of auto-computed width)
  const [colWidthOverrides, setColWidthOverrides] = useState({});
  // x-position of the full-height blue guide shown while any resize is in
  // progress (tree/timeline divider, Name column, or per-field column).
  const [resizeGuideX, setResizeGuideX] = useState(null);

  const sdf = startDateField || 'customfield_10015';
  const edf = endDateField   || 'duedate';

  // ── Buffer dates ─────────────────────────────────────────────────────────
  // Resolve the active day-width once per render. Base preset (Days/Months/
  // Quarters) sets a baseline; the +/- buttons scale around it. Clamp to a
  // reasonable range so extreme zooms can't grind layout calc to a halt.
  const DAY_WIDTH = Math.max(0.5, Math.min(120, dayWidthFor(timelineZoom) * (timelineZoomScale || 1)));
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

  // ── Flatten tree into visible rows, sorted by active sort column ────────
  // Sort is applied at each level (siblings within a parent sort together).
  const flatRows = useMemo(() => {
    const rows = [];
    function sortKeys(keys) {
      if (!sortField) return keys;
      const sign = sortDir === 'asc' ? 1 : -1;
      return [...keys].sort((a, b) => {
        const va = extractSortValue(issueByKey[a]?.fields?.[sortField]);
        const vb = extractSortValue(issueByKey[b]?.fields?.[sortField]);
        // null / undefined always go to the bottom (regardless of direction)
        if (va == null && vb == null) return 0;
        if (va == null) return 1;
        if (vb == null) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return sign * (va - vb);
        return sign * String(va).localeCompare(String(vb));
      });
    }
    function walk(keys, depth, visited) {
      for (const key of sortKeys(keys)) {
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
  }, [roots, childrenByKey, issueByKey, collapsed, sortField, sortDir]);

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

  // ── Inline field editing ────────────────────────────────────────────────
  async function startEditCell(iss, fieldId) {
    const editorType = getEditorType(fieldId, availableFields, sdf, edf);
    if (!editorType) return;
    setSelectedKey(iss.key);
    const fields = iss.fields || {};
    let draft = '';
    let transitions = null;
    let loading = false;
    if (editorType === 'status') {
      loading = true;
      setEditingCell({ issueKey: iss.key, fieldId, draft: '', loading: true });
      transitions = await invoke('getIssueTransitions', { key: iss.key });
      setEditingCell({ issueKey: iss.key, fieldId, draft: '', loading: false, transitions });
      return;
    }
    if (editorType === 'priority') {
      draft = fields.priority?.name || 'Medium';
    } else if (editorType === 'labels') {
      draft = (fields.labels || []).join(' ');
    } else if (editorType === 'date') {
      // For the project's configured start/end date fields, pick the right raw value.
      const raw = fields[fieldId];
      draft = typeof raw === 'string' ? raw.slice(0, 10) : '';
    } else {
      const raw = fields[fieldId];
      draft = raw == null ? '' : String(raw);
    }
    setEditingCell({ issueKey: iss.key, fieldId, draft });
  }

  async function saveEdit() {
    if (!editingCell) return;
    const { issueKey, fieldId, draft } = editingCell;
    const editorType = getEditorType(fieldId, availableFields, sdf, edf);
    setEditingCell(null);
    let value;
    if (editorType === 'priority') {
      value = { name: draft };
    } else if (editorType === 'labels') {
      value = draft.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    } else if (editorType === 'number') {
      value = draft === '' ? null : Number(draft);
    } else {
      value = draft === '' ? null : draft;
    }
    // Optimistic local update
    if (onUpdateIssueField) onUpdateIssueField(issueKey, fieldId, value);
    try {
      await invoke('updateIssueField', { key: issueKey, fieldId, value });
    } catch (e) {
      console.error('updateIssueField failed', e);
    }
  }

  // ── Header click & double-click: sort by column / collapse column ───────
  // React fires onClick THEN onDoubleClick on a double-click. We delay the
  // sort toggle by ~220ms so that if a double-click comes, we cancel it.
  const headerClickTimerRef = useRef(null);
  function handleHeaderClick(e, fieldId) {
    e.stopPropagation();
    // Don't trigger sort when the drag-reorder just finished
    if (dragFieldId) return;
    if (headerClickTimerRef.current) clearTimeout(headerClickTimerRef.current);
    headerClickTimerRef.current = setTimeout(() => {
      setSortField(prevField => {
        if (prevField === fieldId) {
          // same field → toggle direction
          setSortDir(d => d === 'desc' ? 'asc' : 'desc');
          return prevField;
        }
        // new field → start descending
        setSortDir('desc');
        return fieldId;
      });
      headerClickTimerRef.current = null;
    }, 220);
  }
  function handleHeaderDoubleClick(e, fieldId) {
    e.stopPropagation();
    if (headerClickTimerRef.current) {
      clearTimeout(headerClickTimerRef.current);
      headerClickTimerRef.current = null;
    }
    // If the column was auto-collapsed (squeezed out by a narrow tree
    // panel), widen the tree panel enough to bring every column back to
    // its natural width instead of marking it user-collapsed.
    if (autoCollapsed.has(fieldId) && !collapsedCols.has(fieldId)) {
      const needed = nameColWidth + extraFields.reduce((a, f) => {
        if (collapsedCols.has(f.id)) return a + COLLAPSED_COL_WIDTH;
        if (colWidthOverrides[f.id]) return a + colWidthOverrides[f.id];
        return a + FIELD_COL_NATURAL;
      }, 0);
      setTreeWidth(Math.min(TREE_WIDTH_MAX, needed));
      return;
    }
    setCollapsedCols(prev => {
      const next = new Set(prev);
      next.has(fieldId) ? next.delete(fieldId) : next.add(fieldId);
      return next;
    });
  }

  // ── Bar drag: reschedule an issue by dragging its bar left/right ────────
  function startBarDrag(e, row) {
    if (e.button !== 0) return;
    if (row.hasKids) return; // don't drag roll-up brackets
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    let delta = 0;
    setSelectedKey(row.key);
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    function onMove(ev) {
      const raw = Math.round((ev.clientX - startX) / DAY_WIDTH);
      if (raw !== delta) {
        delta = raw;
        setDraggingBar({ key: row.key, delta });
      }
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setDraggingBar(null);
      if (delta !== 0 && onUpdateIssue) {
        const iss = issueByKey[row.key];
        const sd = parseDate(iss?.fields?.[sdf]);
        const ed = parseDate(iss?.fields?.[edf]);
        if (sd && ed) {
          onUpdateIssue(row.key, fmtISODate(addDays(sd, delta)), fmtISODate(addDays(ed, delta)));
        }
      }
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  async function applyStatusTransition(transitionId, transitionName) {
    if (!editingCell) return;
    const { issueKey } = editingCell;
    setEditingCell(null);
    if (onUpdateIssueField) onUpdateIssueField(issueKey, 'status', { name: transitionName });
    try {
      await invoke('transitionIssue', { key: issueKey, transitionId });
    } catch (e) {
      console.error('transitionIssue failed', e);
    }
  }

  function cancelEdit() { setEditingCell(null); }

  // Shared helper: run a column-resize drag. During the drag, `resizeGuideX`
  // stores the mouse x RELATIVE to the ProjectView's outer container so
  // a blue guide line can be drawn inside the view only (not spilling out
  // into the Jira chrome).
  function runColumnResizeDrag(e, getDelta, apply) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const containerLeft = outerRef.current?.getBoundingClientRect()?.left || 0;
    setResizeGuideX(startX - containerLeft);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    function onMove(ev) {
      apply(getDelta(ev.clientX - startX));
      setResizeGuideX(ev.clientX - containerLeft);
    }
    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      setResizeGuideX(null);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── Name column drag ────────────────────────────────────────────────────
  function startNameColDrag(e) {
    const startW = nameColWidth;
    runColumnResizeDrag(e, d => d, d => {
      setNameWidthUser(Math.max(NAME_COL_MIN, Math.min(NAME_COL_MAX, startW + d)));
    });
  }

  // ── Per-field column drag ──────────────────────────────────────────────
  function startFieldColDrag(e, fieldId) {
    // Dragging a collapsed column's edge expands it back — clear the
    // user-collapsed state and let the override drive the width.
    const wasUserCollapsed = collapsedCols.has(fieldId);
    if (wasUserCollapsed) {
      setCollapsedCols(prev => {
        const next = new Set(prev);
        next.delete(fieldId);
        return next;
      });
    }
    const startW = widthOf(fieldId);
    runColumnResizeDrag(e, d => d, d => {
      setColWidthOverrides(prev => ({
        ...prev,
        [fieldId]: Math.max(COLLAPSED_COL_WIDTH, Math.min(FIELD_COL_MAX, startW + d)),
      }));
    });
  }

  // ── Tree / timeline divider drag ───────────────────────────────────────
  function startDividerDrag(e) {
    const startW = treeWidth;
    runColumnResizeDrag(e, d => d, d => {
      setTreeWidth(Math.max(TREE_WIDTH_MIN, Math.min(TREE_WIDTH_MAX, startW + d)));
    });
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

  // Scroll to today on initial mount AND whenever the zoom changes — pixel
  // positions are not stable across DAY_WIDTH changes, so without this the
  // view jumps to an unrelated date when the user toggles Days/Months/Qtrs.
  useEffect(() => {
    if (!bodyRef.current) return;
    const off = Math.max(0, todayOff - 60);
    bodyRef.current.scrollLeft = off;
    const cw = bodyRef.current.clientWidth;
    const from = Math.max(0, Math.floor(off / DAY_WIDTH) - 20);
    const to   = Math.min(totalDays - 1, Math.ceil((off + cw) / DAY_WIDTH) + 20);
    setVisRange({ from, to });
  }, [timelineZoom, DAY_WIDTH, todayOff, totalDays]);

  // (Auto-expand-tree-on-new-column effect moved below, after extraFields
  // and treeContentWidth are declared, to avoid a TDZ error.)

  // ── Render timeline header (mode-aware: day / month / quarter) ──────────
  function renderTimelineHeader() {
    if (timelineZoom === 'month') {
      return renderMonthHeader();
    }
    if (timelineZoom === 'quarter') {
      return renderQuarterHeader();
    }
    return renderDayHeader();
  }

  function renderDayHeader() {
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

  function renderMonthHeader() {
    // Top row: years. Bottom row: month abbreviations (Jan, Feb, …).
    const yearEls = [];
    const monthEls = [];
    let yStart = 0, yYear = -1;
    let mStart = 0, mMo = -1, mYear = -1;
    for (let i = 0; i <= totalDays; i++) {
      const d  = i < totalDays ? addDays(bufferStart, i) : null;
      const yr = d ? d.getFullYear() : -1;
      const mo = d ? d.getMonth() : -1;
      if (yr !== yYear) {
        if (yYear !== -1) {
          yearEls.push(
            <div key={`y-${yStart}`} style={{
              position: 'absolute', left: yStart * DAY_WIDTH, width: (i - yStart) * DAY_WIDTH,
              height: 22, display: 'flex', alignItems: 'center', paddingLeft: 8,
              fontWeight: 700, fontSize: 11, color: yYear === today.getFullYear() ? '#172B4D' : '#97A0AF',
              whiteSpace: 'nowrap',
            }}>{yYear}</div>
          );
        }
        yYear = yr; yStart = i;
      }
      if (mo !== mMo) {
        if (mMo !== -1) {
          const isCurrentMonth = mYear === today.getFullYear() && mMo === today.getMonth();
          monthEls.push(
            <div key={`m-${mStart}`} style={{
              position: 'absolute', left: mStart * DAY_WIDTH, width: (i - mStart) * DAY_WIDTH,
              height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: isCurrentMonth ? 800 : 600,
              color: isCurrentMonth ? '#fff' : '#42526E',
              background: isCurrentMonth ? '#0073EA' : 'transparent',
              borderRadius: isCurrentMonth ? 4 : 0,
              borderLeft: '1px solid #EBECF0',
            }}>
              {MONTH_NAMES[mMo].slice(0, 3)}
            </div>
          );
        }
        mMo = mo; mStart = i; mYear = yr;
      }
    }
    return (
      <div style={{ position: 'relative', height: HEADER_HEIGHT, width: totalWidth }}>
        <div style={{ position: 'relative', height: 22 }}>{yearEls}</div>
        <div style={{ position: 'relative', height: 34 }}>{monthEls}</div>
      </div>
    );
  }

  function renderQuarterHeader() {
    // Top row: years. Bottom row: Q1 / Q2 / Q3 / Q4.
    const yearEls = [];
    const qEls = [];
    let yStart = 0, yYear = -1;
    let qStart = 0, qIdx = -1, qYear = -1;
    for (let i = 0; i <= totalDays; i++) {
      const d  = i < totalDays ? addDays(bufferStart, i) : null;
      const yr = d ? d.getFullYear() : -1;
      const q  = d ? Math.floor(d.getMonth() / 3) : -1;
      if (yr !== yYear) {
        if (yYear !== -1) {
          yearEls.push(
            <div key={`y-${yStart}`} style={{
              position: 'absolute', left: yStart * DAY_WIDTH, width: (i - yStart) * DAY_WIDTH,
              height: 22, display: 'flex', alignItems: 'center', paddingLeft: 8,
              fontWeight: 700, fontSize: 12, color: yYear === today.getFullYear() ? '#172B4D' : '#97A0AF',
              whiteSpace: 'nowrap',
            }}>{yYear}</div>
          );
        }
        yYear = yr; yStart = i;
      }
      if (q !== qIdx || yr !== qYear) {
        if (qIdx !== -1) {
          const isCurrentQ = qYear === today.getFullYear() && qIdx === Math.floor(today.getMonth() / 3);
          qEls.push(
            <div key={`q-${qStart}`} style={{
              position: 'absolute', left: qStart * DAY_WIDTH, width: (i - qStart) * DAY_WIDTH,
              height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, fontWeight: isCurrentQ ? 800 : 600,
              color: isCurrentQ ? '#fff' : '#42526E',
              background: isCurrentQ ? '#0073EA' : 'transparent',
              borderRadius: isCurrentQ ? 4 : 0,
              borderLeft: '1px solid #EBECF0',
            }}>
              Q{qIdx + 1}
            </div>
          );
        }
        qIdx = q; qStart = i; qYear = yr;
      }
    }
    return (
      <div style={{ position: 'relative', height: HEADER_HEIGHT, width: totalWidth }}>
        <div style={{ position: 'relative', height: 22 }}>{yearEls}</div>
        <div style={{ position: 'relative', height: 34 }}>{qEls}</div>
      </div>
    );
  }

  // ── Weekend shading (memoized) — only shown in 'day' zoom mode where
  //     individual days are wide enough to be visually meaningful. ───────
  const weekendShading = useMemo(() => {
    if (timelineZoom !== 'day') return [];
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
  }, [visRange.from, visRange.to, flatRows.length, holidaySet, bufferStart, totalDays, timelineZoom, DAY_WIDTH]);

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

    // Apply live drag offset if this bar is being dragged
    const dragOffset = (draggingBar && draggingBar.key === row.key) ? draggingBar.delta * DAY_WIDTH : 0;
    const barLeft  = clippedStart * DAY_WIDTH + dragOffset;
    // At the compressed zoom levels, a 1-day bar would be just 3-8px —
    // hard to spot. Floor bar width at 8px so every issue is visible.
    const barWidth = Math.max((clippedEnd - clippedStart) * DAY_WIDTH, 8);
    const overflowLeft  = startOff < 0;
    const overflowRight = endOff > totalDays;

    const y = rowIndex * ROW_HEIGHT;

    // Resolve the row's colour pair (bg/border) for whatever it ends up
    // rendering as — bracket, collapsed-parent solid bar, or leaf bar.
    let rowColor = null;
    if (colorByField) {
      const v = colorValueOf(iss.fields, colorByField);
      rowColor = getValueColor(colorByField, v, colorByValues);
    }

    // Parent expanded = summary bracket — also tinted by colorByField when set
    if (isExpanded) {
      const bracketH = 6;
      const tickH = 10;
      const bracketFill = rowColor ? rowColor.bg     : '#97A0AF';
      const tickFill    = rowColor ? rowColor.border : '#6B778C';
      return (
        <g key={row.key}>
          {/* Main bracket bar */}
          <rect
            x={barLeft} y={y + ROW_HEIGHT / 2 - bracketH / 2}
            width={barWidth} height={bracketH}
            rx={2} fill={bracketFill} opacity={0.55}
          />
          {!overflowLeft && (
            <rect
              x={barLeft} y={y + ROW_HEIGHT / 2 - tickH / 2}
              width={3} height={tickH}
              rx={1} fill={tickFill} opacity={0.7}
            />
          )}
          {!overflowRight && (
            <rect
              x={barLeft + barWidth - 3} y={y + ROW_HEIGHT / 2 - tickH / 2}
              width={3} height={tickH}
              rx={1} fill={tickFill} opacity={0.7}
            />
          )}
        </g>
      );
    }

    // Parent collapsed = solid dark bar (or rowColor); Leaf = blue/colored bar
    const isCollapsedParent = hasKids && isCollapsed;
    const barH   = ROW_HEIGHT - 10;
    const barY   = y + (ROW_HEIGHT - barH) / 2;
    let bgColor     = isCollapsedParent ? '#253858' : DEFAULT_BAR_COLOR;
    let borderColor = isCollapsedParent ? '#172B4D' : DEFAULT_BAR_BORDER;
    if (rowColor) { bgColor = rowColor.bg; borderColor = rowColor.border; }
    const textColor   = '#fff';
    const summary = iss.fields?.summary || '';

    return (
      <g key={row.key}>
        {/* Bar background — draggable */}
        <rect
          x={barLeft} y={barY}
          width={barWidth} height={barH}
          rx={4} fill={bgColor}
          stroke={borderColor} strokeWidth={1}
          style={{ cursor: 'grab', pointerEvents: 'auto' }}
          onMouseDown={(e) => startBarDrag(e, row)}
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

  // Column widths. Each column has a desired width (user-collapsed → 28,
  // user override → that value, else natural 140). If the total exceeds
  // the tree panel, shrink every shrinkable column proportionally to fit,
  // with a hard minimum of COLLAPSED_COL_WIDTH so the name always has
  // room to render (horizontal above VERTICAL_TEXT_THRESHOLD, vertical
  // below). Gradual scaling means names never vanish mid-drag.
  const COLLAPSED_COL_WIDTH = 28;
  const nameColWidth = Math.max(NAME_COL_MIN, Math.min(NAME_COL_MAX, nameWidthUser));
  const { widthByFieldId, autoCollapsed, treeContentWidth } = (() => {
    const desired = {};
    for (const f of extraFields) {
      if (collapsedCols.has(f.id))       desired[f.id] = COLLAPSED_COL_WIDTH;
      else if (colWidthOverrides[f.id])  desired[f.id] = Math.max(COLLAPSED_COL_WIDTH, colWidthOverrides[f.id]);
      else                                desired[f.id] = FIELD_COL_NATURAL;
    }
    const final = { ...desired };
    const autoSet = new Set();
    if (showTimeline) {
      const available = Math.max(0, treeWidth - nameColWidth);
      const desiredSum = extraFields.reduce((a, f) => a + desired[f.id], 0);
      if (desiredSum > available) {
        // Scale all columns proportionally, but never below COLLAPSED_COL_WIDTH.
        const scale = available / desiredSum;
        for (const f of extraFields) {
          const scaled = Math.max(COLLAPSED_COL_WIDTH, Math.floor(desired[f.id] * scale));
          final[f.id] = scaled;
        }
        // If minimums push the total over `available`, further reduce from the
        // right (drop non-minimal widths to COLLAPSED_COL_WIDTH one by one).
        let sum = extraFields.reduce((a, f) => a + final[f.id], 0);
        for (let i = extraFields.length - 1; i >= 0 && sum > available; i--) {
          const fid = extraFields[i].id;
          if (final[fid] > COLLAPSED_COL_WIDTH) {
            sum -= (final[fid] - COLLAPSED_COL_WIDTH);
            final[fid] = COLLAPSED_COL_WIDTH;
          }
        }
        // Mark anything that ended up below the vertical-text threshold
        for (const f of extraFields) {
          if (!collapsedCols.has(f.id) && final[f.id] < 60) autoSet.add(f.id);
        }
      }
    }
    const totalWidth = nameColWidth + extraFields.reduce((a, f) => a + final[f.id], 0);
    return { widthByFieldId: final, autoCollapsed: autoSet, treeContentWidth: totalWidth };
  })();
  const widthOf = (fid) => widthByFieldId[fid] ?? FIELD_COL_NATURAL;
  // Threshold at which a column flips from horizontal text to a vertical
  // strip — avoids the mid-drag state where horizontal text has fully
  // truncated away and the column looks empty.
  const VERTICAL_TEXT_THRESHOLD = 60;
  const isColCollapsed = (fid) => (widthByFieldId[fid] ?? FIELD_COL_NATURAL) < VERTICAL_TEXT_THRESHOLD;
  const leftPanelWidth = showTimeline ? treeWidth : '100%';

  // When the user adds a new column (extraFields grows), auto-expand the tree
  // panel so the new column is visible at its natural width. Don't shrink —
  // user may have deliberately narrowed the panel.
  const prevFieldCountRef = useRef(extraFields.length);
  useEffect(() => {
    if (!showTimeline) return;
    if (extraFields.length > prevFieldCountRef.current && treeContentWidth > treeWidth) {
      setTreeWidth(Math.min(TREE_WIDTH_MAX, treeContentWidth));
    }
    prevFieldCountRef.current = extraFields.length;
  }, [extraFields.length, treeContentWidth, treeWidth, showTimeline]);

  return (
    <div ref={outerRef} style={s.outer}>
      {/* Full-height blue guide line shown during any column resize drag —
          scoped to the Project view (absolute inside s.outer). */}
      {resizeGuideX != null && (
        <div style={{
          position: 'absolute', top: 0, bottom: 0, left: resizeGuideX - 1, width: 2,
          background: '#0073ea', zIndex: 50, pointerEvents: 'none',
          boxShadow: '0 0 0 1px rgba(0,115,234,0.15)',
        }} />
      )}
      {/* Table ↔ Timeline divider — placed strictly after the tree panel's
          right edge (x = treeWidth) so it no longer overlaps the last
          column's own drag handle, which lived around treeWidth-3. */}
      {showTimeline && (
        <div
          onMouseDown={startDividerDrag}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#0073ea'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          style={{
            position: 'absolute', left: treeWidth, top: 0, bottom: 0,
            width: 6, cursor: 'col-resize', zIndex: 14,
            background: 'transparent', transition: 'background 0.12s',
          }}
          title="Drag to change table / timeline split"
        />
      )}
      {/* ── Tree header (sticky top-left) ── */}
      <div style={{ ...s.treeHeader, width: leftPanelWidth, overflow: 'hidden' }}>
        <div style={{ display: 'flex', width: treeContentWidth, height: '100%' }}>
          {/* Name column header — right-edge drag handle resizes just this column. */}
          <div style={{ width: nameColWidth, flexShrink: 0, position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', boxSizing: 'border-box', overflow: 'hidden' }}>
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
            {/* Drag handle on Name column's right edge */}
            <div
              onMouseDown={startNameColDrag}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#0073ea'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              style={{
                position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
                cursor: 'col-resize', zIndex: 15,
                background: 'transparent', transition: 'background 0.12s',
              }}
              title="Drag to resize Name column"
            />
          </div>
          {/* Extra field column headers — single-click sorts, double-click
              collapses, drag reorders. */}
          {extraFields.map(f => {
            const isDragging = dragFieldId === f.id;
            const isDropTarget = dropBeforeFieldId === f.id && dragFieldId !== f.id;
            const isCollapsedCol = isColCollapsed(f.id);
            const w = widthOf(f.id);
            const isSorted = sortField === f.id;
            // Click tracking for single- vs double-click (React fires both)
            return (
              <div
                key={f.id}
                draggable
                onDragStart={(e) => handleColDragStart(e, f.id)}
                onDragOver={(e) => handleColDragOver(e, f.id)}
                onDrop={(e) => handleColDrop(e, f.id)}
                onDragEnd={handleColDragEnd}
                onClick={(e) => handleHeaderClick(e, f.id)}
                onDoubleClick={(e) => handleHeaderDoubleClick(e, f.id)}
                title={isCollapsedCol ? `${f.name} (collapsed — double-click to expand)` : `${f.name} — click to sort, double-click to collapse, drag the right edge to resize`}
                style={{
                  ...s.fieldColHeader,
                  width: w,
                  position: 'relative',
                  cursor: 'pointer',
                  opacity: isDragging ? 0.4 : 1,
                  boxShadow: isDropTarget ? 'inset 2px 0 0 #0073ea' : 'none',
                  userSelect: 'none',
                  padding: isCollapsedCol ? 0 : s.fieldColHeader.padding,
                  color: isSorted ? '#0052CC' : s.fieldColHeader.color,
                }}
              >
                {isCollapsedCol ? (() => {
                  // Vertical text can't rely on text-overflow:ellipsis for
                  // the writing-mode axis, so truncate in JS. Max chars is
                  // the header height (62px) minus ~14px for the sort glyph,
                  // divided by per-char vertical advance (~fontSize).
                  const fontSize = w < 24 ? 8 : 9;
                  const sortGlyph = isSorted ? (sortDir === 'asc' ? '↑' : '↓') : '⇅';
                  const maxChars = Math.max(3, Math.floor((HEADER_HEIGHT - 14) / (fontSize + 1)));
                  const label = f.name.length > maxChars
                    ? f.name.slice(0, maxChars - 1) + '…'
                    : f.name;
                  return (
                    <span style={{
                      writingMode: 'vertical-rl', transform: 'rotate(180deg)',
                      whiteSpace: 'nowrap',
                      fontSize, fontWeight: 700,
                      color: isSorted ? '#0052CC' : '#6B778C',
                      textTransform: 'uppercase', letterSpacing: 0.2,
                      padding: 0, margin: 0,
                    }}>
                      {label} {sortGlyph}
                    </span>
                  );
                })() : (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, width: '100%', minWidth: 0 }}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
                    {/* Always-visible sort indicator so users know the column is sortable */}
                    <span style={{
                      color: isSorted ? '#0052CC' : '#C1C7D0',
                      fontSize: 10, flexShrink: 0, lineHeight: 1,
                    }}>
                      {isSorted ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
                    </span>
                  </span>
                )}
                {/* Right-edge resize handle — always available so a collapsed
                    column can be dragged back open. Sits just inside the
                    column's right edge (right:0) to avoid overlapping the
                    tree/timeline divider on the last column. */}
                <div
                  onMouseDown={(e) => startFieldColDrag(e, f.id)}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#0073ea'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
                    cursor: 'col-resize', zIndex: 15,
                    background: 'transparent', transition: 'background 0.12s',
                  }}
                  title="Drag to resize column"
                />
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
                  onMouseEnter={() => setHoveredKey(row.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                >
                  {/* Name cell — fixed width, never collapses. Owns its own borderBottom. */}
                  <div style={{ width: nameColWidth, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4, paddingLeft: 8 + indent, minWidth: 0, overflow: 'hidden', boxSizing: 'border-box', height: '100%', borderBottom: '1px solid #E1E4E8' }}>
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
                    {(() => {
                      // Match the colorBy scheme regardless of whether the
                      // row has children — Epics/Features should also pick
                      // up their own status / priority / etc. colour.
                      let badgeStyle = s.keyBadge;
                      if (colorByField) {
                        const v = colorValueOf(iss.fields, colorByField);
                        const c = getValueColor(colorByField, v, colorByValues);
                        if (c) {
                          badgeStyle = { ...s.keyBadge, background: `${c.bg}33`, color: c.border };
                        }
                      }
                      return (
                        <span
                          style={{ ...badgeStyle, cursor: 'pointer' }}
                          onClick={(e) => { e.stopPropagation(); router.open(`/browse/${row.key}`); }}
                          title="Open issue in new tab"
                        >{row.key}</span>
                      );
                    })()}
                    <span style={s.summaryText}>{summary}</span>
                    {row.hasKids && (
                      <span style={s.childCount}>({(childrenByKey[row.key] || []).length})</span>
                    )}
                  </div>
                  {/* Extra field cells — width follows header's widthOf(f.id). */}
                  {extraFields.map(f => {
                    const isCollapsedCol = isColCollapsed(f.id);
                    const w = widthOf(f.id);
                    const editorType = isCollapsedCol ? null : getEditorType(f.id, availableFields, sdf, edf);
                    const isEditing = editingCell && editingCell.issueKey === iss.key && editingCell.fieldId === f.id;
                    const cellBase = { ...s.fieldCell, width: w, borderBottom: '1px solid #E1E4E8' };
                    if (isEditing) {
                      return (
                        <div
                          key={f.id}
                          style={{ ...cellBase, padding: 0, position: 'relative', overflow: 'visible' }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <InlineCellEditor
                            editingCell={editingCell}
                            setEditingCell={setEditingCell}
                            onSave={saveEdit}
                            onCancel={cancelEdit}
                            onApplyTransition={applyStatusTransition}
                          />
                        </div>
                      );
                    }
                    return (
                      <div
                        key={f.id}
                        style={{
                          ...cellBase,
                          cursor: editorType ? 'text' : 'default',
                          padding: isCollapsedCol ? 0 : cellBase.padding,
                        }}
                        onClick={editorType ? (e) => { e.stopPropagation(); startEditCell(iss, f.id); } : undefined}
                        title={editorType ? 'Click to edit' : undefined}
                      >
                        {isCollapsedCol ? null : renderFieldValue(iss.fields?.[f.id])}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* (Table ↔ Timeline divider rendered at the outer root so it
              spans header + body — see render below the outer <div>.) */}

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
    background: '#fff', borderBottom: '1px solid #E1E4E8', borderRight: '1px solid #E1E4E8',
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
    borderLeft: '1px solid #E1E4E8', height: '100%',
    display: 'flex', alignItems: 'center',
    whiteSpace: 'nowrap', overflow: 'hidden',
  },
  fieldCell: {
    flexShrink: 0, boxSizing: 'border-box',
    padding: '0 8px', fontSize: '11px', color: '#42526E',
    borderLeft: '1px solid #E1E4E8',
    display: 'flex', alignItems: 'center',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    height: '100%',
  },

  // ── Timeline header (sticky top, right of tree header) — left set dynamically ──
  timelineHeaderWrap: {
    position: 'absolute', top: 0, right: 0,
    height: HEADER_HEIGHT, overflowX: 'hidden',
    background: '#fff', borderBottom: '1px solid #E1E4E8', zIndex: 11,
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
    background: '#fff', borderRight: '1px solid #E1E4E8',
  },

  // ── Tree row ──
  // Row has NO borderBottom — each cell draws its own borderBottom instead.
  // NO gap — gap:4 here used to shift every field column 4px right per cell
  // vs. the header (which had no gap), breaking column-line alignment.
  treeRow: {
    display: 'flex', alignItems: 'center',
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

// ── Inline cell editor ────────────────────────────────────────────────────────
// Sits INSIDE a field cell when that cell is being edited. Renders the
// appropriate input for the field's editor type.
function InlineCellEditor({ editingCell, setEditingCell, onSave, onCancel, onApplyTransition }) {
  const { fieldId, draft, loading, transitions } = editingCell;
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputRef.current) inputRef.current.focus();
  }, []);

  // Close on outside click or Escape for the status popover; other editors
  // handle blur via their own onBlur handlers.
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onCancel(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  function updateDraft(v) {
    setEditingCell(prev => prev ? { ...prev, draft: v } : prev);
  }

  // Status: popover of transition buttons below the cell
  if (fieldId === 'status') {
    return (
      <div style={editorStyles.statusPop}>
        {loading ? (
          <span style={{ fontSize: 11, color: '#97A0AF' }}>Loading…</span>
        ) : transitions && transitions.length > 0 ? (
          <>
            {transitions.map(t => (
              <button
                key={t.id}
                onClick={() => onApplyTransition(t.id, t.to?.name || t.name)}
                style={editorStyles.transBtn}
              >{t.name}</button>
            ))}
            <button onClick={onCancel} style={editorStyles.cancelBtn}>Cancel</button>
          </>
        ) : (
          <>
            <span style={{ fontSize: 11, color: '#97A0AF' }}>No transitions available</span>
            <button onClick={onCancel} style={editorStyles.cancelBtn}>Close</button>
          </>
        )}
      </div>
    );
  }

  // Priority: inline select
  if (fieldId === 'priority') {
    return (
      <select
        ref={inputRef}
        value={draft}
        onChange={(e) => updateDraft(e.target.value)}
        onBlur={onSave}
        onKeyDown={(e) => { if (e.key === 'Enter') onSave(); }}
        style={editorStyles.input}
      >
        {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
      </select>
    );
  }

  // Labels / text / number / date — single <input>
  const isDate = /^\d{4}-\d{2}-\d{2}/.test(draft) || editingCell.fieldId === 'duedate' || editingCell.fieldId === 'customfield_10015';
  const isNumber = !isDate && draft !== '' && !Number.isNaN(Number(draft)) && fieldId !== 'labels';
  const inputType = isDate ? 'date' : (isNumber ? 'number' : 'text');
  return (
    <input
      ref={inputRef}
      type={inputType}
      value={draft}
      onChange={(e) => updateDraft(e.target.value)}
      onBlur={onSave}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSave();
        if (e.key === 'Escape') onCancel();
      }}
      placeholder={fieldId === 'labels' ? 'label1 label2 …' : undefined}
      style={editorStyles.input}
    />
  );
}

const editorStyles = {
  input: {
    width: '100%', height: '100%', boxSizing: 'border-box',
    border: '2px solid #0073ea', borderRadius: 3,
    padding: '0 6px', fontSize: 11, outline: 'none',
    color: '#172B4D', background: '#fff', fontFamily: 'inherit',
  },
  statusPop: {
    position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 20,
    display: 'flex', flexWrap: 'wrap', gap: 4,
    padding: 8, background: '#fff',
    border: '1px solid #DFE1E6', borderRadius: 6,
    boxShadow: '0 6px 16px rgba(9,30,66,0.16)',
    minWidth: 180,
  },
  transBtn: {
    background: '#0052CC', color: '#fff', border: 'none', borderRadius: 3,
    padding: '3px 8px', cursor: 'pointer', fontSize: 11, fontWeight: 600,
  },
  cancelBtn: {
    background: 'none', border: '1px solid #DFE1E6', borderRadius: 3,
    padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#6B778C',
  },
};
