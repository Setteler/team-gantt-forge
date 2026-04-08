import React, { useState, useRef } from 'react';
import { router } from '@forge/bridge';
import { getFieldValue } from '../utils';

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(date) {
  if (!date) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

const STATUS_BG   = { 'To Do':'#DFE1E6','In Progress':'#DEEBFF','In Review':'#EAE6FF','Review':'#EAE6FF','Done':'#E3FCEF','Canceled':'#F4F5F7','Blocked':'#FFEBE6' };
const STATUS_TEXT = { 'To Do':'#42526E','In Progress':'#0747A6','In Review':'#403294','Review':'#403294','Done':'#006644','Canceled':'#97A0AF','Blocked':'#BF2600' };
const EVENT_TYPES = [
  { value: 'oncall',   label: '🔔 On-Call' },
  { value: 'vacation', label: '🏖️ Vacation' },
  { value: 'ooo',      label: 'OOO' },
  { value: 'custom',   label: '📌 Custom' },
];
const EVENT_TYPE_LABEL = { vacation:'🏖️ Vacation', oncall:'🔔 On-Call', ooo:'OOO', custom:'📌' };
const DEFAULT_FIELDS = ['summary','status','assignee','customfield_10015','duedate'];
const BUILTIN_COL_LABELS = {
  summary:'Summary', status:'Status', assignee:'Assignee', priority:'Priority',
  issuetype:'Type', labels:'Labels', duedate:'Due Date', customfield_10015:'Start Date',
  reporter:'Reporter', resolution:'Resolution',
};

export default function ListView({
  issues, customEvents, listFields, availableFields,
  startDateField, endDateField,
  groupByField1, groupByField2, groupByField1Label, groupByField2Label,
  groupOptions1, groupOptions2,
  onEditEvent, onPreviewIssue, onAddEvent, onSaveEvent,
}) {
  const [sortCol, setSortCol]           = useState(null);
  const [sortDir, setSortDir]           = useState(1);
  const [typeFilter, setTypeFilter]     = useState('all');
  const [collapsedG1, setCollapsedG1]   = useState({});
  const [collapsedG2, setCollapsedG2]   = useState({});

  // Inline cell editing state (for custom events)
  const [editingCell, setEditingCell] = useState({ id: null, col: null, val: '' });
  const inputRef = useRef(null);

  // Inline add state
  const [inlineAdd, setInlineAdd]   = useState(false);
  const [newType, setNewType]       = useState('oncall');
  const [newSummary, setNewSummary] = useState('');
  const [newGroup1, setNewGroup1]   = useState('');
  const [newGroup2, setNewGroup2]   = useState('');
  const [newStart, setNewStart]     = useState('');
  const [newEnd, setNewEnd]         = useState('');
  const [saving, setSaving]         = useState(false);

  const sdf = startDateField || 'customfield_10015';
  const edf = endDateField   || 'duedate';
  const columns = listFields?.length ? listFields : DEFAULT_FIELDS;

  function getLabel(fieldId) {
    if (fieldId === sdf) return BUILTIN_COL_LABELS[fieldId] || 'Start Date';
    if (fieldId === edf) return BUILTIN_COL_LABELS[fieldId] || 'Due Date';
    return availableFields?.find(f => f.id === fieldId)?.name || BUILTIN_COL_LABELS[fieldId] || fieldId;
  }

  const issueRows = issues.map(iss => ({ _type: 'jira',   _key: iss.key, _raw: iss }));
  const eventRows = (customEvents || []).map(evt => ({ _type: 'custom', _key: evt.id,  _raw: evt }));

  const filtered = [...issueRows, ...eventRows].filter(row =>
    typeFilter === 'all' ? true : typeFilter === 'issues' ? row._type === 'jira' : row._type === 'custom'
  );

  function getCellVal(row, col) {
    if (row._type === 'jira') return getFieldValue(row._raw.fields, col) || '';
    const evt = row._raw;
    if (col === sdf || col === 'customfield_10015') return evt.startDate || '';
    if (col === edf  || col === 'duedate')          return evt.endDate   || '';
    if (col === 'summary') return evt.summary || evt.title || evt.type || '';
    if (col === 'assignee') return evt.groupValues?.[groupByField2] ?? evt.developer ?? '';
    if (col === 'labels')   return evt.groupValues?.[groupByField1] ?? evt.squad ?? '';
    return evt.groupValues?.[col] ?? '';
  }

  function getGroupVal(row, fieldId) {
    if (!fieldId) return null;
    if (row._type === 'jira') return getFieldValue(row._raw.fields, fieldId) || '(No group)';
    const evt = row._raw;
    // Check explicit groupValues map first, then legacy per-field fallbacks
    return evt.groupValues?.[fieldId]
      || (fieldId === 'assignee' ? (evt.developer || null) : null)
      || (fieldId === 'labels'   ? (evt.squad    || null) : null)
      || '(No group)';
  }

  const sorted = sortCol
    ? [...filtered].sort((a, b) => {
        const av = getCellVal(a, sortCol), bv = getCellVal(b, sortCol);
        return sortDir * (av < bv ? -1 : av > bv ? 1 : 0);
      })
    : filtered;

  // Build grouped structure: Map<g1 -> Map<g2 -> rows[]>>
  const useGrouping = !!groupByField1;
  const groupedData = [];
  if (useGrouping) {
    const g1Map = new Map();
    for (const row of sorted) {
      const g1 = getGroupVal(row, groupByField1);
      if (!g1Map.has(g1)) g1Map.set(g1, new Map());
      const g2Map = g1Map.get(g1);
      const g2 = groupByField2 ? getGroupVal(row, groupByField2) : '__all__';
      if (!g2Map.has(g2)) g2Map.set(g2, []);
      g2Map.get(g2).push(row);
    }
    // Sort group keys: (No group) last
    const sortKeys = arr => arr.sort((a, b) => {
      if (a === '(No group)') return 1;
      if (b === '(No group)') return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    });
    for (const [g1, g2Map] of [...g1Map.entries()].sort(([a],[b]) => {
      if (a === '(No group)') return 1;
      if (b === '(No group)') return -1;
      return a < b ? -1 : a > b ? 1 : 0;
    })) {
      const g2Entries = [...g2Map.entries()].sort(([a],[b]) => {
        if (a === '(No group)' || a === '__all__') return 1;
        if (b === '(No group)' || b === '__all__') return -1;
        return a < b ? -1 : a > b ? 1 : 0;
      });
      groupedData.push({ g1, g2Entries });
    }
  }

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => -d);
    else { setSortCol(col); setSortDir(1); }
  }

  // Start editing a cell in a custom event row
  function startCellEdit(e, row, col) {
    e.stopPropagation();
    if (row._type !== 'custom') return;
    // Don't edit status column — it's a badge
    if (col === 'status') return;
    const currentVal = getCellVal(row, col);
    setEditingCell({ id: row._key, col, val: currentVal });
    // Focus input on next tick
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  async function commitCellEdit(row) {
    const evt = row._raw;
    const { col, val } = editingCell;
    setEditingCell({ id: null, col: null, val: '' });
    if (!onSaveEvent) return;

    let updated = { ...evt };
    if (col === 'summary') {
      updated.summary = val;
    } else if (col === sdf || col === 'customfield_10015') {
      updated.startDate = val;
    } else if (col === edf || col === 'duedate') {
      updated.endDate = val;
    } else if (col === 'assignee') {
      updated.groupValues = { ...(evt.groupValues || {}), [groupByField2 || 'assignee']: val };
    } else if (col === 'labels') {
      updated.groupValues = { ...(evt.groupValues || {}), [groupByField1 || 'labels']: val };
    } else {
      updated.groupValues = { ...(evt.groupValues || {}), [col]: val };
    }
    await onSaveEvent(updated);
  }

  function handleCellKeyDown(e, row) {
    if (e.key === 'Enter') { e.preventDefault(); commitCellEdit(row); }
    if (e.key === 'Escape') setEditingCell({ id: null, col: null, val: '' });
  }

  function renderCell(row, col) {
    // Editing mode for custom event cells
    if (row._type === 'custom' && editingCell.id === row._key && editingCell.col === col) {
      const isDate = (col === sdf || col === edf || col === 'customfield_10015' || col === 'duedate');
      const isGroup1 = (col === 'labels');
      const isGroup2 = (col === 'assignee');
      const opts = isGroup1 ? groupOptions1 : isGroup2 ? groupOptions2 : null;

      if (isDate) {
        return (
          <input
            ref={inputRef}
            type="date"
            value={editingCell.val}
            style={s.cellInput}
            onChange={e => setEditingCell(prev => ({ ...prev, val: e.target.value }))}
            onBlur={() => commitCellEdit(row)}
            onKeyDown={e => handleCellKeyDown(e, row)}
          />
        );
      }
      if (opts?.length > 0) {
        return (
          <select
            ref={inputRef}
            value={editingCell.val}
            style={s.cellInput}
            onChange={e => setEditingCell(prev => ({ ...prev, val: e.target.value }))}
            onBlur={() => commitCellEdit(row)}
            onKeyDown={e => handleCellKeyDown(e, row)}
          >
            <option value="">—</option>
            {opts.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        );
      }
      return (
        <input
          ref={inputRef}
          type="text"
          value={editingCell.val}
          style={s.cellInput}
          onChange={e => setEditingCell(prev => ({ ...prev, val: e.target.value }))}
          onBlur={() => commitCellEdit(row)}
          onKeyDown={e => handleCellKeyDown(e, row)}
        />
      );
    }

    // Normal display
    if (row._type === 'jira') {
      const val = getFieldValue(row._raw.fields, col);
      if (col === 'status') {
        const s2 = val || '—';
        return <span style={{ background: STATUS_BG[s2]||'#DFE1E6', color: STATUS_TEXT[s2]||'#42526E', borderRadius:'3px', padding:'1px 6px', fontSize:'11px', fontWeight:600 }}>{s2}</span>;
      }
      if (col === sdf || col === edf) return fmtDate(parseDate(val));
      return val || '—';
    }

    const evt = row._raw;
    if (col === 'summary') {
      const note = evt.summary || '';
      const label = EVENT_TYPE_LABEL[evt.type] || evt.type;
      const display = evt.type === 'custom' && evt.title ? `${label} — ${evt.title}` : label;
      return (
        <span style={{ color:'#403294', fontWeight:500 }}>
          {display}
          {note ? <span style={{ fontWeight:400, color:'#6B778C', marginLeft:6 }}>{note}</span> : ''}
        </span>
      );
    }
    if (col === 'status') return <span style={{ background:'#EAE6FF', color:'#403294', borderRadius:'3px', padding:'1px 6px', fontSize:'11px', fontWeight:600 }}>Event</span>;
    if (col === sdf || col === 'customfield_10015') return fmtDate(parseDate(evt.startDate));
    if (col === edf  || col === 'duedate')          return fmtDate(parseDate(evt.endDate));
    if (col === 'assignee') return evt.groupValues?.[groupByField2] ?? evt.developer ?? '—';
    if (col === 'labels')   return evt.groupValues?.[groupByField1] ?? evt.squad ?? '—';
    return evt.groupValues?.[col] ?? '—';
  }

  async function handleInlineSave() {
    if (!newStart || !newEnd || !onSaveEvent) return;
    setSaving(true);
    try {
      const typeObj = EVENT_TYPES.find(t => t.value === newType);
      const resolvedTitle = typeObj ? typeObj.label.replace(/^[^\s]+\s?/, '').trim() : newType;
      await onSaveEvent({
        type: newType,
        title: resolvedTitle,
        summary: newSummary,
        groupValues: { [groupByField1 || 'labels']: newGroup1, [groupByField2 || 'assignee']: newGroup2 },
        startDate: newStart,
        endDate: newEnd,
      });
      setNewType('oncall'); setNewSummary(''); setNewGroup1(''); setNewGroup2(''); setNewStart(''); setNewEnd('');
      setInlineAdd(false);
    } finally {
      setSaving(false);
    }
  }

  const eventCount = (customEvents || []).length;
  const colCount   = columns.length + 1;
  const g1Label    = groupByField1Label || groupByField1 || 'Group';
  const g2Label    = groupByField2Label || groupByField2 || 'Sub-group';

  return (
    <div style={s.outer}>
      {/* Filter + add toolbar */}
      <div style={s.toolbar}>
        <div style={{ display: 'flex', gap: '4px' }}>
          {[
            { f: 'all',    label: `All (${issues.length + eventCount})` },
            { f: 'issues', label: `Issues (${issues.length})` },
            { f: 'events', label: `Events (${eventCount})` },
          ].map(({ f, label }) => (
            <button key={f}
              style={{ ...s.filterBtn, background: typeFilter === f ? '#0073ea' : '#fff', color: typeFilter === f ? '#fff' : '#6B778C', borderColor: typeFilter === f ? '#0073ea' : '#DFE1E6' }}
              onClick={() => setTypeFilter(f)}
            >{label}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={{ ...s.th, ...s.keyTh }}>Key / Type</th>
              {columns.map(col => (
                <th key={col} style={s.th} onClick={() => handleSort(col)}>
                  {getLabel(col)}{sortCol === col ? <span style={{ marginLeft:4, opacity:0.55 }}>{sortDir===1?'↑':'↓'}</span> : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {useGrouping ? (
              groupedData.length === 0 ? (
                <tr><td colSpan={colCount} style={{ ...s.td, textAlign:'center', color:'#97A0AF', padding:'40px' }}>No items</td></tr>
              ) : groupedData.map(({ g1, g2Entries }) => {
                const g1Collapsed = !!collapsedG1[g1];
                const totalG1 = g2Entries.reduce((sum, [, rows]) => sum + rows.length, 0);
                const hasSubGroups = groupByField2 && g2Entries.some(([k]) => k !== '__all__');
                return (
                  <React.Fragment key={g1}>
                    {/* Level-1 group header */}
                    <tr style={{ background: '#F4F5F7', cursor: 'pointer' }}
                      onClick={() => setCollapsedG1(prev => ({ ...prev, [g1]: !prev[g1] }))}>
                      <td colSpan={colCount} style={{ ...s.td, fontWeight: 700, color: '#172B4D', fontSize: '12px', padding: '6px 12px', borderBottom: '1px solid #DFE1E6' }}>
                        <span style={{ marginRight: 6, fontSize: 10, opacity: 0.6 }}>{g1Collapsed ? '▶' : '▼'}</span>
                        <span style={{ color: '#0073ea' }}>{g1Label}:</span> {g1}
                        <span style={{ marginLeft: 8, fontWeight: 400, color: '#97A0AF', fontSize: '11px' }}>({totalG1})</span>
                      </td>
                    </tr>
                    {!g1Collapsed && g2Entries.map(([g2, rows]) => {
                      const g2Key = `${g1}||${g2}`;
                      const g2Collapsed = !!collapsedG2[g2Key];
                      return (
                        <React.Fragment key={g2Key}>
                          {/* Level-2 group header (only if sub-grouping is active) */}
                          {hasSubGroups && g2 !== '__all__' && (
                            <tr style={{ background: '#FAFBFC', cursor: 'pointer' }}
                              onClick={() => setCollapsedG2(prev => ({ ...prev, [g2Key]: !prev[g2Key] }))}>
                              <td colSpan={colCount} style={{ ...s.td, fontWeight: 600, color: '#42526E', fontSize: '11px', padding: '5px 12px 5px 28px', borderBottom: '1px solid #F4F5F7' }}>
                                <span style={{ marginRight: 6, fontSize: 9, opacity: 0.6 }}>{g2Collapsed ? '▶' : '▼'}</span>
                                <span style={{ color: '#6B778C' }}>{g2Label}:</span> {g2}
                                <span style={{ marginLeft: 8, fontWeight: 400, color: '#97A0AF', fontSize: '11px' }}>({rows.length})</span>
                              </td>
                            </tr>
                          )}
                          {!g2Collapsed && rows.map((row, idx) => {
                            const isJira = row._type === 'jira';
                            const rowBg = idx % 2 === 0 ? '#fff' : '#FAFBFC';
                            return (
                              <tr key={row._key}
                                style={{ background: rowBg, cursor: isJira ? 'pointer' : 'default' }}
                                onClick={isJira ? () => router.open(`/browse/${row._key}`) : undefined}
                                onMouseEnter={e => e.currentTarget.style.background = '#EDF3FF'}
                                onMouseLeave={e => e.currentTarget.style.background = rowBg}
                              >
                                <td style={{ ...s.td, ...s.keyTd, paddingLeft: hasSubGroups ? '40px' : '24px' }}>
                                  {isJira
                                    ? <span style={s.keyBadge}>{row._key}</span>
                                    : <span style={s.eventBadge}>{EVENT_TYPE_LABEL[row._raw.type] || 'Event'}</span>
                                  }
                                </td>
                                {columns.map(col => (
                                  <td key={col} style={{
                                    ...s.td,
                                    cursor: !isJira && col !== 'status' ? 'text' : undefined,
                                    background: editingCell.id === row._key && editingCell.col === col ? '#F0F7FF' : undefined,
                                    padding: editingCell.id === row._key && editingCell.col === col ? '4px 8px' : undefined,
                                  }} onClick={!isJira ? (e) => startCellEdit(e, row, col) : undefined}>
                                    {renderCell(row, col)}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    })}
                  </React.Fragment>
                );
              })
            ) : (
              <>
                {sorted.map((row, idx) => {
                  const isJira = row._type === 'jira';
                  const rowBg = idx % 2 === 0 ? '#fff' : '#FAFBFC';
                  return (
                    <tr key={row._key}
                      style={{ background: rowBg, cursor: isJira ? 'pointer' : 'default' }}
                      onClick={isJira ? () => router.open(`/browse/${row._key}`) : undefined}
                      onMouseEnter={e => e.currentTarget.style.background = '#EDF3FF'}
                      onMouseLeave={e => e.currentTarget.style.background = rowBg}
                    >
                      <td style={{ ...s.td, ...s.keyTd }}>
                        {isJira
                          ? <span style={s.keyBadge}>{row._key}</span>
                          : <span style={s.eventBadge}>{EVENT_TYPE_LABEL[row._raw.type] || 'Event'}</span>
                        }
                      </td>
                      {columns.map(col => (
                        <td key={col} style={{
                          ...s.td,
                          cursor: !isJira && col !== 'status' ? 'text' : undefined,
                          background: editingCell.id === row._key && editingCell.col === col ? '#F0F7FF' : undefined,
                          padding: editingCell.id === row._key && editingCell.col === col ? '4px 8px' : undefined,
                        }} onClick={!isJira ? (e) => startCellEdit(e, row, col) : undefined}>
                          {renderCell(row, col)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
                {sorted.length === 0 && (
                  <tr><td colSpan={colCount} style={{ ...s.td, textAlign:'center', color:'#97A0AF', padding:'40px' }}>No items</td></tr>
                )}
              </>
            )}

            {/* Inline add row */}
            {inlineAdd && typeFilter !== 'issues' && (
              <tr style={{ background: '#F0F7FF' }}>
                <td colSpan={colCount} style={{ padding: '8px 12px', borderBottom: '1px solid #DFE1E6' }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={newType} onChange={e => setNewType(e.target.value)} style={s.inlineInput}
                      onKeyDown={e => e.key === 'Enter' && handleInlineSave()}>
                      {EVENT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <input
                      style={{ ...s.inlineInput, minWidth: '150px', flex: 1 }}
                      placeholder="Summary / notes…"
                      value={newSummary}
                      onChange={e => setNewSummary(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleInlineSave()}
                    />
                    {(groupOptions1?.length > 0) ? (
                      <select value={newGroup1} onChange={e => setNewGroup1(e.target.value)} style={s.inlineInput}
                        onKeyDown={e => e.key === 'Enter' && handleInlineSave()}>
                        <option value="">— {g1Label} —</option>
                        {groupOptions1.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : (
                      <input style={s.inlineInput} placeholder={g1Label} value={newGroup1} onChange={e => setNewGroup1(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleInlineSave()} />
                    )}
                    {(groupOptions2?.length > 0) ? (
                      <select value={newGroup2} onChange={e => setNewGroup2(e.target.value)} style={s.inlineInput}
                        onKeyDown={e => e.key === 'Enter' && handleInlineSave()}>
                        <option value="">— {g2Label} —</option>
                        {groupOptions2.map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : (
                      <input style={s.inlineInput} placeholder={g2Label} value={newGroup2} onChange={e => setNewGroup2(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleInlineSave()} />
                    )}
                    <input type="date" value={newStart} onChange={e => setNewStart(e.target.value)} style={s.inlineInput} title="Start date"
                      onKeyDown={e => e.key === 'Enter' && handleInlineSave()} />
                    <input type="date" value={newEnd}   onChange={e => setNewEnd(e.target.value)}   style={s.inlineInput} title="End date"
                      onKeyDown={e => e.key === 'Enter' && handleInlineSave()} />
                    <button
                      style={s.inlineSaveBtn}
                      disabled={!newStart || !newEnd || saving}
                      onClick={handleInlineSave}
                    >{saving ? '…' : '✓ Add'}</button>
                    <button style={s.inlineCancelBtn} onClick={() => setInlineAdd(false)}>✕</button>
                  </div>
                </td>
              </tr>
            )}

            {/* Add event row trigger */}
            {!inlineAdd && typeFilter !== 'issues' && (
              <tr>
                <td colSpan={colCount} style={{ padding: '4px 12px', borderBottom: 'none' }}>
                  <button style={s.addRowBtn} onClick={() => setInlineAdd(true)}>
                    + Add event
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const s = {
  outer:        { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#fff' },
  toolbar:      { display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #e6e9ef', gap: '8px', flexShrink: 0 },
  filterBtn:    { border: '1px solid', borderRadius: '6px', padding: '4px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 },
  tableWrap:    { flex: 1, overflowY: 'auto', overflowX: 'auto' },
  table:        { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th:           { position: 'sticky', top: 0, background: '#F4F5F7', borderBottom: '2px solid #DFE1E6', padding: '8px 12px', textAlign: 'left', fontSize: '11px', fontWeight: 700, color: '#6B778C', textTransform: 'uppercase', letterSpacing: '0.4px', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' },
  keyTh:        { width: '120px' },
  td:           { padding: '8px 12px', borderBottom: '1px solid #F4F5F7', color: '#172B4D', verticalAlign: 'middle', whiteSpace: 'nowrap', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis' },
  keyTd:        { width: '120px' },
  keyBadge:     { background: '#DEEBFF', color: '#0747A6', borderRadius: '3px', padding: '2px 7px', fontSize: '11px', fontWeight: 700 },
  eventBadge:   { background: '#EAE6FF', color: '#403294', borderRadius: '3px', padding: '2px 7px', fontSize: '11px', fontWeight: 600 },
  cellInput:    { border: '1px solid #0052CC', borderRadius: '3px', padding: '3px 6px', fontSize: '13px', outline: 'none', color: '#172B4D', background: '#fff', width: '100%', boxSizing: 'border-box', minWidth: '80px' },
  inlineInput:  { border: '1px solid #0052CC', borderRadius: '3px', padding: '4px 7px', fontSize: '12px', outline: 'none', color: '#172B4D', background: '#fff', height: '28px', boxSizing: 'border-box' },
  inlineSaveBtn:{ background: '#0073ea', color: '#fff', border: 'none', borderRadius: '3px', padding: '4px 10px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, height: '28px', whiteSpace: 'nowrap' },
  inlineCancelBtn:{ background: 'none', border: '1px solid #DFE1E6', borderRadius: '3px', padding: '4px 8px', cursor: 'pointer', fontSize: '12px', color: '#6B778C', height: '28px' },
  addRowBtn:    { background: 'none', border: 'none', color: '#0073ea', cursor: 'pointer', fontSize: '12px', fontWeight: 500, padding: '6px 4px', width: '100%', textAlign: 'left' },
};
