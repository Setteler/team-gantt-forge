import React, { useState, useMemo } from 'react';
import { router } from '@forge/bridge';
import { getFieldValue } from '../utils';

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(date) {
  if (!date) return '';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

const STATUS_BG   = { 'To Do':'#DFE1E6','In Progress':'#DEEBFF','In Review':'#EAE6FF','Review':'#EAE6FF','Done':'#E3FCEF','Canceled':'#F4F5F7','Blocked':'#FFEBE6' };
const STATUS_TEXT  = { 'To Do':'#42526E','In Progress':'#0747A6','In Review':'#403294','Review':'#403294','Done':'#006644','Canceled':'#97A0AF','Blocked':'#BF2600' };

function getParentKey(issue) {
  // Next-gen / team-managed: fields.parent.key
  const parent = issue.fields?.parent;
  if (parent?.key) return parent.key;
  // Company-managed epic link: customfield_10014 (string key)
  const epicLink = issue.fields?.customfield_10014;
  if (typeof epicLink === 'string' && epicLink) return epicLink;
  return null;
}

export default function TreeView({
  issues, customEvents, availableFields,
  startDateField, endDateField, listFields,
  onEditEvent, onAddEvent, onSaveEvent,
}) {
  const [collapsed, setCollapsed] = useState(new Set());

  const sdf = startDateField || 'customfield_10015';
  const edf = endDateField || 'duedate';

  // Build tree structure
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

  // Compute rollup dates for a node (min start, max end among all descendants)
  function getRollupDates(key, visited) {
    if (visited.has(key)) return { minStart: null, maxEnd: null };
    visited.add(key);

    const iss = issueByKey[key];
    let minStart = parseDate(iss?.fields?.[sdf]);
    let maxEnd = parseDate(iss?.fields?.[edf]);

    const kids = childrenByKey[key] || [];
    for (const ck of kids) {
      const child = getRollupDates(ck, visited);
      if (child.minStart && (!minStart || child.minStart < minStart)) minStart = child.minStart;
      if (child.maxEnd && (!maxEnd || child.maxEnd > maxEnd)) maxEnd = child.maxEnd;
    }

    return { minStart, maxEnd };
  }

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

  const allExpanded = collapsed.size === 0;

  // Recursive row renderer
  function renderRows(keys, depth, visited) {
    return keys.map(key => {
      if (visited.has(key)) return null; // cycle protection
      const nextVisited = new Set(visited);
      nextVisited.add(key);

      const iss = issueByKey[key];
      if (!iss) return null;

      const kids = childrenByKey[key] || [];
      const hasKids = kids.length > 0;
      const isCollapsed = collapsed.has(key);

      const status = getFieldValue(iss.fields, 'status') || '';
      const assignee = getFieldValue(iss.fields, 'assignee') || '';
      const summary = getFieldValue(iss.fields, 'summary') || iss.fields?.summary || '';
      const startStr = iss.fields?.[sdf];
      const endStr = iss.fields?.[edf];
      const startDate = parseDate(startStr);
      const endDate = parseDate(endStr);

      // Show rollup dates when collapsed with children
      let rollupStart = null;
      let rollupEnd = null;
      if (hasKids && isCollapsed) {
        const rollup = getRollupDates(key, new Set());
        rollupStart = rollup.minStart;
        rollupEnd = rollup.maxEnd;
      }

      const indent = depth * 20;

      return (
        <React.Fragment key={key}>
          <tr
            style={{ ...s.row, cursor: 'pointer' }}
            onClick={() => router.open(`/browse/${key}`)}
            onMouseEnter={e => e.currentTarget.style.background = '#F4F5F7'}
            onMouseLeave={e => e.currentTarget.style.background = '#fff'}
          >
            {/* Expand/collapse + key */}
            <td style={{ ...s.td, paddingLeft: 12 + indent, whiteSpace: 'nowrap', width: '200px' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {hasKids ? (
                  <span
                    style={s.toggle}
                    onClick={e => { e.stopPropagation(); toggleNode(key); }}
                  >
                    {isCollapsed ? '\u25B8' : '\u25BE'}
                  </span>
                ) : (
                  <span style={{ width: '14px', display: 'inline-block' }} />
                )}
                <span style={s.keyBadge}>{key}</span>
              </span>
            </td>

            {/* Summary */}
            <td style={{ ...s.td, maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {summary}
              {hasKids && (
                <span style={s.childCount}>({kids.length})</span>
              )}
            </td>

            {/* Status */}
            <td style={s.td}>
              {status && (
                <span style={{
                  background: STATUS_BG[status] || '#DFE1E6',
                  color: STATUS_TEXT[status] || '#42526E',
                  borderRadius: '3px', padding: '1px 6px', fontSize: '11px', fontWeight: 600,
                }}>
                  {status}
                </span>
              )}
            </td>

            {/* Date range */}
            <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
              {startDate || endDate ? (
                <span style={{ fontSize: '12px' }}>
                  {fmtDate(startDate) || '?'} {'\u2192'} {fmtDate(endDate) || '?'}
                </span>
              ) : ''}
              {rollupStart || rollupEnd ? (
                <span style={s.rollup}>
                  {' '}({fmtDate(rollupStart) || '?'} {'\u2192'} {fmtDate(rollupEnd) || '?'})
                </span>
              ) : ''}
            </td>

            {/* Assignee */}
            <td style={{ ...s.td, whiteSpace: 'nowrap' }}>
              {assignee || '\u2014'}
            </td>
          </tr>

          {/* Render children recursively when expanded */}
          {hasKids && !isCollapsed && renderRows(kids, depth + 1, nextVisited)}
        </React.Fragment>
      );
    });
  }

  const totalIssues = issues.length;
  const rootCount = roots.length;

  return (
    <div style={s.outer}>
      {/* Toolbar */}
      <div style={s.toolbar}>
        <span style={s.stats}>
          {totalIssues} issue{totalIssues !== 1 ? 's' : ''} &middot; {rootCount} root{rootCount !== 1 ? 's' : ''}
        </span>
        <button style={s.toggleAllBtn} onClick={allExpanded ? collapseAll : expandAll}>
          {allExpanded ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {/* Table */}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, width: '200px' }}>Key</th>
              <th style={s.th}>Summary</th>
              <th style={{ ...s.th, width: '120px' }}>Status</th>
              <th style={{ ...s.th, width: '260px' }}>Dates</th>
              <th style={{ ...s.th, width: '140px' }}>Assignee</th>
            </tr>
          </thead>
          <tbody>
            {totalIssues === 0 ? (
              <tr>
                <td colSpan={5} style={{ ...s.td, textAlign: 'center', color: '#97A0AF', padding: '40px' }}>
                  No issues to display
                </td>
              </tr>
            ) : (
              renderRows(roots.map(r => r.key), 0, new Set())
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s = {
  outer: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' },
  toolbar: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '8px 16px', borderBottom: '1px solid #e6e9ef', flexShrink: 0,
  },
  stats: { fontSize: '12px', color: '#6B778C', fontWeight: 500 },
  toggleAllBtn: {
    background: '#fff', border: '1px solid #DFE1E6', borderRadius: '6px',
    padding: '4px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 500,
    color: '#323338',
  },
  tableWrap: { flex: 1, overflowY: 'auto', overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: {
    position: 'sticky', top: 0, background: '#F4F5F7', borderBottom: '2px solid #DFE1E6',
    padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700,
    color: '#6B778C', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap',
  },
  td: {
    padding: '7px 12px', borderBottom: '1px solid #F4F5F7', color: '#172B4D', verticalAlign: 'middle',
  },
  row: { background: '#fff' },
  toggle: {
    cursor: 'pointer', fontSize: '12px', color: '#6B778C', width: '14px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    userSelect: 'none', flexShrink: 0,
  },
  keyBadge: {
    background: '#DEEBFF', color: '#0747A6', borderRadius: '3px',
    padding: '2px 7px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap',
  },
  childCount: { marginLeft: '6px', fontSize: '11px', color: '#97A0AF', fontWeight: 400 },
  rollup: { color: '#97A0AF', fontSize: '11px', fontStyle: 'italic' },
};
