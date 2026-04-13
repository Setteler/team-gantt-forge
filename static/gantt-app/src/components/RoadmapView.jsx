import React, { useRef, useState, useEffect, useMemo } from 'react';

const LEFT_WIDTH     = 260;
const QUARTER_WIDTH  = 120;
const GROUP_HEIGHT   = 32;
const SUB_HEIGHT     = 28;
const ITEM_HEIGHT    = 36;
const HEADER_HEIGHT  = 56;
const BAR_H          = 22;
const BAR_VPAD       = 7;

const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];

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
  let s = parseDate(item.fields?.[sdf]);
  let e = parseDate(item.fields?.[edf]);
  if (!s && !e) { const r = new Date(); s = addDays(r, -3); e = addDays(r, 3); }
  if (!s) s = addDays(e, -7);
  if (!e) e = addDays(s, 7);
  return { s, e };
}

/** Convert a Date into a fractional quarter offset from bufferStart.
 *  e.g. Jan 1 2024 with bufferStart Jan 1 2022 => 8.0, Feb 15 2024 => ~8.5 */
function dateToQuarterOffset(date, bufferStartYear) {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-11
  const d = date.getDate();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const monthFrac = m + (d - 1) / daysInMonth; // 0..11.97
  return (y - bufferStartYear) * 4 + monthFrac / 3;
}

function groupItems(issues, f1, f2) {
  const g = {};
  for (const iss of issues) {
    const g1 = getFieldValue(iss.fields, f1) || 'None';
    const g2 = getFieldValue(iss.fields, f2) || 'None';
    if (!g[g1]) g[g1] = {};
    if (!g[g1][g2]) g[g1][g2] = [];
    g[g1][g2].push(iss);
  }
  return g;
}

export default function RoadmapView({
  issues, today,
  groupByField1, groupByField2,
  groupByField1Label, groupByField2Label,
  startDateField, endDateField,
}) {
  const scrollRef = useRef(null);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [collapsedSubs, setCollapsedSubs]     = useState(new Set());

  const sdf = startDateField || 'customfield_10015';
  const edf = endDateField   || 'duedate';
  const f1  = groupByField1  || 'labels';
  const f2  = groupByField2  || 'assignee';

  // 8-year buffer: 4 years back, 4 years forward = 32 quarters
  const bufferStartYear = today.getFullYear() - 4;
  const totalQuarters   = 32;
  const totalWidth      = totalQuarters * QUARTER_WIDTH;

  // Current quarter for highlighting
  const currentQIdx = (today.getFullYear() - bufferStartYear) * 4 + Math.floor(today.getMonth() / 3);
  const todayOffset = dateToQuarterOffset(today, bufferStartYear) * QUARTER_WIDTH;

  // Scroll to today on mount
  useEffect(() => {
    if (!scrollRef.current) return;
    const off = Math.max(0, todayOffset - scrollRef.current.clientWidth / 2);
    scrollRef.current.scrollLeft = off;
  }, []);

  // Sync header scroll with body scroll
  const handleScroll = (e) => {
    const h = document.getElementById('roadmap-header-scroll');
    if (h) h.scrollLeft = e.currentTarget.scrollLeft;
  };

  // Group and build rows
  const grouped    = useMemo(() => groupItems(issues, f1, f2), [issues, f1, f2]);
  const groupNames = useMemo(() => Object.keys(grouped).sort(), [grouped]);

  const rows = useMemo(() => {
    const r = [];
    for (const g1 of groupNames) {
      const color    = getSquadColor(g1);
      const allItems = Object.values(grouped[g1]).flat();
      r.push({ type: 'group', g1, color, count: allItems.length });
      if (!collapsedGroups.has(g1)) {
        const subNames = Object.keys(grouped[g1]).sort();
        for (const g2 of subNames) {
          const items  = grouped[g1][g2];
          const subKey = `${g1}||${g2}`;
          r.push({ type: 'sub', g1, g2, color, count: items.length, subKey });
          if (!collapsedSubs.has(subKey)) {
            for (const item of items) {
              r.push({ type: 'item', g1, g2, color, item, subKey });
            }
          }
        }
      }
    }
    return r;
  }, [grouped, groupNames, collapsedGroups, collapsedSubs]);

  function toggleGroup(g1) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      next.has(g1) ? next.delete(g1) : next.add(g1);
      return next;
    });
  }

  function toggleSub(subKey) {
    setCollapsedSubs(prev => {
      const next = new Set(prev);
      next.has(subKey) ? next.delete(subKey) : next.add(subKey);
      return next;
    });
  }

  // Render header: year row + quarter row
  function renderHeader() {
    const yearEls = [];
    const quarterEls = [];

    for (let y = 0; y < 8; y++) {
      const year = bufferStartYear + y;
      yearEls.push(
        <div key={year} style={{
          position: 'absolute', left: y * 4 * QUARTER_WIDTH, width: 4 * QUARTER_WIDTH,
          height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 700, fontSize: '12px', color: '#323338',
          borderRight: '1px solid #e6e9ef', borderBottom: '1px solid #e6e9ef',
          background: '#fff',
        }}>{year}</div>
      );

      for (let q = 0; q < 4; q++) {
        const qIdx = y * 4 + q;
        const isCurrent = qIdx === currentQIdx;
        quarterEls.push(
          <div key={`q-${qIdx}`} style={{
            position: 'absolute', left: qIdx * QUARTER_WIDTH, width: QUARTER_WIDTH,
            height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '11px', fontWeight: 600,
            color: isCurrent ? '#6554C0' : '#676879',
            background: isCurrent ? '#EDE7F6' : '#FAFBFC',
            borderRight: '1px solid #e6e9ef',
          }}>{QUARTER_LABELS[q]}</div>
        );
      }
    }

    return (
      <div style={{ position: 'relative', height: HEADER_HEIGHT, width: totalWidth }}>
        <div style={{ position: 'relative', height: 22 }}>{yearEls}</div>
        <div style={{ position: 'relative', height: 28 }}>{quarterEls}</div>
      </div>
    );
  }

  // Today line element
  const todayLineEl = todayOffset >= 0 && todayOffset <= totalWidth
    ? <div style={{ position: 'absolute', left: todayOffset, top: 0, bottom: 0, width: 2, background: '#E2445C', zIndex: 4, pointerEvents: 'none', borderRadius: 1 }} />
    : null;

  // Quarter grid lines
  const quarterGridEls = useMemo(() => {
    const els = [];
    for (let i = 0; i <= totalQuarters; i++) {
      els.push(<div key={i} style={{ position: 'absolute', left: i * QUARTER_WIDTH, top: 0, bottom: 0, width: 1, background: '#e6e9ef', pointerEvents: 'none' }} />);
    }
    return els;
  }, [totalQuarters]);

  const headerLabel = `${(groupByField1Label || f1).toUpperCase()} / ${(groupByField2Label || f2).toUpperCase()}`;

  if (issues.length === 0) {
    return (
      <div style={styles.emptyState}>
        <div style={{ fontSize: '48px' }}>🗺</div>
        <div style={{ fontWeight: 600, fontSize: '16px', color: '#172B4D' }}>No issues found</div>
        <div style={{ color: '#6B778C', fontSize: '13px' }}>Configure a JQL filter or select projects in Configure.</div>
      </div>
    );
  }

  return (
    <div style={styles.outer}>
      {/* Left header */}
      <div style={styles.leftHeader}>
        <span style={{ fontWeight: 700, fontSize: '11px', color: '#676879', letterSpacing: '0.3px', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{headerLabel}</span>
        <span style={{ fontSize: '11px', color: '#97A0AF', flexShrink: 0, marginLeft: '6px' }}>{issues.length} issue{issues.length !== 1 ? 's' : ''}</span>
      </div>

      {/* Timeline header (scrolls in sync with body) */}
      <div style={{ position: 'absolute', left: LEFT_WIDTH, top: 0, right: 0, height: HEADER_HEIGHT, overflowX: 'hidden', background: '#fff', borderBottom: '2px solid #e6e9ef', zIndex: 10 }} id="roadmap-header-scroll">
        {renderHeader()}
      </div>

      {/* Body */}
      <div
        ref={scrollRef}
        style={{ position: 'absolute', left: 0, top: HEADER_HEIGHT, right: 0, bottom: 0, overflowY: 'auto', overflowX: 'auto' }}
        onScroll={handleScroll}
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
                    <span style={{ fontSize: '9px', flexShrink: 0 }}>{collapsedGroups.has(row.g1) ? '\u25B6' : '\u25BC'}</span>
                    <span style={{ fontWeight: 700, fontSize: '11px', letterSpacing: '0.4px', textTransform: 'uppercase', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.g1}</span>
                    <span style={{ fontSize: '10px', fontWeight: 600, background: col.border + '22', borderRadius: '10px', padding: '1px 6px', flexShrink: 0, color: col.text }}>{row.count}</span>
                  </div>
                );
              }
              if (row.type === 'sub') {
                const col = row.color;
                const isCol = collapsedSubs.has(row.subKey);
                return (
                  <div key={`lS-${row.g1}-${row.g2}`}
                    style={{ height: SUB_HEIGHT, display: 'flex', alignItems: 'center', gap: '6px', padding: '0 8px 0 16px', background: '#fff', borderLeft: `3px solid ${col.border}55`, borderBottom: '1px solid #f0f1f3', cursor: 'pointer', userSelect: 'none', overflow: 'hidden' }}
                    onClick={() => toggleSub(row.subKey)}
                  >
                    <span style={{ fontSize: '8px', color: '#6B778C', flexShrink: 0 }}>{isCol ? '\u25B6' : '\u25BC'}</span>
                    <span style={{ fontSize: '12px', fontWeight: 600, flex: 1, color: '#323338', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.g2}</span>
                    <span style={{ fontSize: '10px', color: '#c3c6d4', flexShrink: 0 }}>{row.count}</span>
                  </div>
                );
              }
              // item row — show issue key in left column
              const key = row.item.key || row.item.id || '';
              return (
                <div key={`lI-${key}-${idx}`}
                  style={{ height: ITEM_HEIGHT, display: 'flex', alignItems: 'center', padding: '0 8px 0 24px', background: idx % 2 === 0 ? '#fff' : '#fafbfd', borderLeft: `2px solid ${row.color.border}30`, borderBottom: '1px solid #f4f5f7', overflow: 'hidden' }}
                >
                  <span style={{ fontSize: '11px', fontWeight: 600, color: '#0052CC', flexShrink: 0, marginRight: '6px' }}>{key}</span>
                  <span style={{ fontSize: '11px', color: '#323338', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.item.fields?.summary || ''}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Timeline body */}
          <div style={{ width: totalWidth, flexShrink: 0, position: 'relative' }}>
            {quarterGridEls}
            {todayLineEl}
            {rows.map((row, idx) => {
              const rowH = row.type === 'group' ? GROUP_HEIGHT : row.type === 'sub' ? SUB_HEIGHT : ITEM_HEIGHT;
              if (row.type === 'group') {
                return (
                  <div key={`rG-${row.g1}`} style={{ position: 'relative', height: rowH, background: row.color.bg, borderBottom: `1px solid ${row.color.border}20`, opacity: 0.8 }} />
                );
              }
              if (row.type === 'sub') {
                return (
                  <div key={`rS-${row.g1}-${row.g2}`} style={{ position: 'relative', height: rowH, background: '#fff', borderBottom: '1px solid #f0f1f3' }} />
                );
              }
              // item row — render bar
              const { s, e } = getItemDates(row.item, sdf, edf);
              const startOff = dateToQuarterOffset(s, bufferStartYear) * QUARTER_WIDTH;
              const endOff   = dateToQuarterOffset(e, bufferStartYear) * QUARTER_WIDTH;
              const barLeft  = Math.max(0, startOff);
              const barWidth = Math.max(endOff - startOff, QUARTER_WIDTH * 0.15); // min visible width
              const col      = row.color;
              const issueKey = row.item.key || '';
              const summary  = row.item.fields?.summary || '';

              return (
                <div key={`rI-${issueKey}-${idx}`} style={{ position: 'relative', height: rowH, background: idx % 2 === 0 ? '#fff' : '#fafbfd', borderBottom: '1px solid #f4f5f7' }}>
                  <div style={{
                    position: 'absolute',
                    left: barLeft,
                    width: barWidth,
                    top: BAR_VPAD,
                    height: BAR_H,
                    background: col.bg,
                    border: `1px solid ${col.border}`,
                    borderRadius: 4,
                    display: 'flex',
                    alignItems: 'center',
                    overflow: 'hidden',
                    paddingLeft: 6,
                    paddingRight: 4,
                    gap: 4,
                    cursor: 'default',
                    zIndex: 2,
                  }}>
                    <span style={{
                      fontSize: '9px', fontWeight: 700, color: col.text,
                      background: col.border + '22', borderRadius: 3, padding: '1px 4px',
                      flexShrink: 0, whiteSpace: 'nowrap',
                    }}>{issueKey}</span>
                    <span style={{
                      fontSize: '10px', color: col.text, overflow: 'hidden',
                      textOverflow: 'ellipsis', whiteSpace: 'nowrap', opacity: 0.85,
                    }}>{summary}</span>
                  </div>
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
  outer: {
    position: 'relative', flex: 1, overflow: 'hidden', background: '#fff',
  },
  leftHeader: {
    position: 'absolute', left: 0, top: 0, width: LEFT_WIDTH, height: HEADER_HEIGHT,
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '0 12px', background: '#fff', borderBottom: '2px solid #e6e9ef',
    borderRight: '2px solid #e6e9ef', zIndex: 11, boxSizing: 'border-box',
    overflow: 'hidden',
  },
  emptyState: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', gap: '10px', color: '#6B778C', padding: '60px 20px',
  },
};
