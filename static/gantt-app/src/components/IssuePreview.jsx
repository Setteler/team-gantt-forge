import React from 'react';
import { view } from '@forge/bridge';

const PRIORITY_ICON = { Highest: '🔴', High: '🟠', Medium: '🟡', Low: '🔵', Lowest: '⚪' };
const STATUS_COLORS = {
  'To Do':       { bg: '#DFE1E6', text: '#42526E' },
  'In Progress': { bg: '#DEEBFF', text: '#0747A6' },
  'In Review':   { bg: '#EAE6FF', text: '#403294' },
  'Review':      { bg: '#EAE6FF', text: '#403294' },
  'Done':        { bg: '#E3FCEF', text: '#006644' },
  'Canceled':    { bg: '#F4F5F7', text: '#97A0AF' },
  'Blocked':     { bg: '#FFEBE6', text: '#BF2600' },
};

const BUILTIN_FIELD_LABELS = {
  summary: 'Summary', status: 'Status', assignee: 'Assignee', priority: 'Priority',
  issuetype: 'Type', labels: 'Labels', duedate: 'Due Date', customfield_10015: 'Start Date',
  reporter: 'Reporter', resolution: 'Resolution', project: 'Project',
};

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

function getFieldLabel(fieldId, availableFields) {
  return availableFields?.find(f => f.id === fieldId)?.name || BUILTIN_FIELD_LABELS[fieldId] || fieldId;
}

function renderFieldValue(fieldId, fields, sdf, edf) {
  if (fieldId === 'status') {
    const s = fields.status?.name || '—';
    const col = STATUS_COLORS[s] || STATUS_COLORS['To Do'];
    return (
      <span style={{ background: col.bg, color: col.text, borderRadius: '3px', padding: '2px 8px', fontSize: '12px', fontWeight: 600 }}>
        {s}
      </span>
    );
  }
  if (fieldId === 'priority') {
    const p = fields.priority?.name || '—';
    return <>{PRIORITY_ICON[p] || '·'} {p}</>;
  }
  if (fieldId === 'assignee')   return fields.assignee?.displayName || 'Unassigned';
  if (fieldId === 'reporter')   return fields.reporter?.displayName || '—';
  if (fieldId === 'project')    return fields.project?.name || '—';
  if (fieldId === 'issuetype')  return fields.issuetype?.name || '—';
  if (fieldId === 'resolution') return fields.resolution?.name || '—';
  if (fieldId === sdf || fieldId === 'customfield_10015') return fmtDate(parseDate(fields[sdf]));
  if (fieldId === edf || fieldId === 'duedate')           return fmtDate(parseDate(fields[edf]));
  if (fieldId === 'labels') {
    const labels = fields.labels || [];
    if (!labels.length) return '—';
    return (
      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
        {labels.map(l => (
          <span key={l} style={{ background: '#F4F5F7', color: '#42526E', borderRadius: '3px', padding: '2px 6px', fontSize: '11px' }}>{l}</span>
        ))}
      </div>
    );
  }
  // Generic fallback for custom fields
  const v = fields[fieldId];
  if (v == null) return '—';
  if (typeof v === 'string') return v || '—';
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) {
    const vals = v.map(x => (typeof x === 'string' ? x : x?.displayName || x?.name || x?.value)).filter(Boolean);
    return vals.length ? vals.join(', ') : '—';
  }
  return v.displayName || v.name || v.value || '—';
}

const WIDE_FIELDS = new Set(['labels', 'project', 'assignee', 'reporter', 'resolution', 'summary']);

// Default fields shown when no previewFields configured
const DEFAULT_PREVIEW_FIELDS = ['status', 'priority', 'assignee', 'reporter', 'customfield_10015', 'duedate', 'project', 'labels'];

export default function IssuePreview({ issue, startDateField, endDateField, previewFields, availableFields, onClose }) {
  const { key, fields } = issue;
  const sdf = startDateField || 'customfield_10015';
  const edf = endDateField   || 'duedate';

  // Use configured previewFields (from listFields), exclude summary (shown separately)
  const fieldsToShow = (previewFields?.length ? previewFields : DEFAULT_PREVIEW_FIELDS)
    .filter(f => f !== 'summary');

  return (
    <>
      {/* Backdrop — click to close */}
      <div style={s.backdrop} onClick={onClose} />

      {/* Drawer panel */}
      <div style={s.panel}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
            <span style={s.keyBadge}>{key}</span>
            {fields.issuetype?.name && <span style={s.typeBadge}>{fields.issuetype.name}</span>}
          </div>
          <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
            <button style={s.openBtn} onClick={() => view.open({ type: 'jiraIssue', key })}>
              Open in Jira ↗
            </button>
            <button style={s.closeBtn} onClick={onClose}>✕</button>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={s.body}>
          <p style={s.summary}>{fields.summary || '(No summary)'}</p>

          <div style={s.grid}>
            {fieldsToShow.map(fieldId => {
              const label = getFieldLabel(fieldId, availableFields);
              const value = renderFieldValue(fieldId, fields, sdf, edf);
              const wide = WIDE_FIELDS.has(fieldId);
              return (
                <Field key={fieldId} label={label} wide={wide}>
                  {value}
                </Field>
              );
            })}
          </div>

          <div style={s.hint}>
            Fields shown match your list view columns (⚙ Configure → Columns). Double-click the bar to open and edit in Jira.
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, children, wide }) {
  return (
    <div style={{ gridColumn: wide ? '1 / -1' : 'auto', padding: '10px 0', borderBottom: '1px solid #F4F5F7' }}>
      <div style={{ fontSize: '11px', fontWeight: 600, color: '#97A0AF', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ fontSize: '13px', color: '#172B4D' }}>{children}</div>
    </div>
  );
}

const s = {
  backdrop: {
    position: 'fixed', inset: 0, background: 'rgba(9,30,66,0.25)', zIndex: 8999,
  },
  panel: {
    position: 'fixed', right: 0, top: 0, bottom: 0, width: '420px', maxWidth: '92vw',
    background: '#fff', boxShadow: '-6px 0 24px rgba(0,0,0,0.14)',
    zIndex: 9000, display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '14px 16px', borderBottom: '1px solid #DFE1E6', flexShrink: 0,
  },
  keyBadge: {
    background: '#DEEBFF', color: '#0747A6', borderRadius: '4px',
    padding: '3px 8px', fontWeight: 700, fontSize: '13px', whiteSpace: 'nowrap',
  },
  typeBadge: {
    background: '#F4F5F7', color: '#6B778C', borderRadius: '4px',
    padding: '3px 8px', fontSize: '12px', whiteSpace: 'nowrap',
  },
  openBtn: {
    background: '#0052CC', color: '#fff', border: 'none', borderRadius: '4px',
    padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, whiteSpace: 'nowrap',
  },
  closeBtn: {
    background: 'none', border: '1px solid #DFE1E6', borderRadius: '4px',
    width: '30px', height: '30px', cursor: 'pointer', fontSize: '14px', color: '#6B778C',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  body: { flex: 1, overflowY: 'auto', padding: '16px 20px' },
  summary: { fontWeight: 700, fontSize: '17px', color: '#172B4D', lineHeight: 1.45, margin: '0 0 20px 0' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr' },
  hint: { marginTop: '20px', fontSize: '11px', color: '#97A0AF', fontStyle: 'italic', lineHeight: 1.5 },
};
