import React, { useState, useEffect } from 'react';
import { invoke, view, router } from '@forge/bridge';

const STATUS_COLORS = {
  'To Do':       '#DFE1E6',
  'In Progress': '#0073ea',
  'In Review':   '#a25ddc',
  'Review':      '#a25ddc',
  'Done':        '#00c875',
  'Canceled':    '#c1c7d0',
  'Blocked':     '#e2445c',
  'Backlog':     '#97A0AF',
};

function getStatusColor(name) {
  return STATUS_COLORS[name] || '#0052CC';
}

export default function App() {
  const [context, setContext] = useState(null);
  const [isEdit, setIsEdit] = useState(false);
  const [jql, setJql] = useState('');
  const [gadgetTitle, setGadgetTitle] = useState('Team Gantt');
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load context and determine edit vs. render mode
  useEffect(() => {
    view.getContext().then(ctx => {
      setContext(ctx);
      const config = ctx?.extension?.gadgetConfiguration;
      const editMode = ctx?.extension?.entryPoint === 'edit';
      setIsEdit(editMode);
      if (config?.jql) setJql(config.jql);
      if (config?.title) setGadgetTitle(config.title);
    });
  }, []);

  // Fetch issues when not in edit mode
  useEffect(() => {
    if (isEdit || !jql) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    invoke('getIssues', { jql, extraFields: [] })
      .then(result => {
        setIssues(result.issues || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err.message || 'Failed to load');
        setLoading(false);
      });
  }, [jql, isEdit]);

  // ── Edit mode ────────────────────────────────────────────────────────────
  if (isEdit) {
    return (
      <div style={s.editRoot}>
        <div style={s.editTitle}>Configure Gadget</div>
        <label style={s.label}>
          <span style={s.labelText}>Gadget title</span>
          <input
            style={s.input}
            value={gadgetTitle}
            onChange={e => setGadgetTitle(e.target.value)}
            placeholder="Team Gantt"
          />
        </label>
        <label style={s.label}>
          <span style={s.labelText}>JQL Filter</span>
          <textarea
            style={s.textarea}
            value={jql}
            onChange={e => setJql(e.target.value)}
            placeholder='project = MYPROJECT AND status != Done'
            spellCheck={false}
          />
          <span style={s.hint}>Issues matching this JQL will appear in the gadget.</span>
        </label>
        <button
          style={s.saveBtn}
          onClick={() => {
            view.submit({ jql, title: gadgetTitle });
          }}
        >Save</button>
      </div>
    );
  }

  // ── Render mode ──────────────────────────────────────────────────────────
  if (!jql) {
    return (
      <div style={s.root}>
        <div style={s.header}>{gadgetTitle}</div>
        <div style={s.empty}>
          <p>No JQL configured.</p>
          <p style={s.hint}>Edit this gadget to set a JQL filter.</p>
        </div>
      </div>
    );
  }

  // Status breakdown
  const statusMap = {};
  for (const iss of issues) {
    const name = iss.fields?.status?.name || 'Unknown';
    statusMap[name] = (statusMap[name] || 0) + 1;
  }
  const statuses = Object.entries(statusMap).sort((a, b) => b[1] - a[1]);
  const total = issues.length;

  // Upcoming due dates (next 5)
  const now = new Date();
  const upcoming = issues
    .filter(iss => iss.fields?.duedate)
    .map(iss => ({ key: iss.key, summary: iss.fields.summary, due: iss.fields.duedate }))
    .sort((a, b) => a.due.localeCompare(b.due))
    .filter(iss => iss.due >= now.toISOString().slice(0, 10))
    .slice(0, 5);

  // Done count for progress
  const doneCount = issues.filter(iss => iss.fields?.status?.name === 'Done').length;
  const progressPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <div style={s.root}>
      <div style={s.header}>
        <span style={s.headerTitle}>{gadgetTitle}</span>
        <span style={s.headerCount}>{total} issues</span>
      </div>

      {loading ? (
        <div style={s.loading}>Loading...</div>
      ) : error ? (
        <div style={s.error}>{error}</div>
      ) : (
        <>
          {/* Progress bar */}
          <div style={s.section}>
            <div style={s.sectionTitle}>Progress</div>
            <div style={s.progressRow}>
              <div style={s.progressBar}>
                <div style={{ ...s.progressFill, width: `${progressPct}%` }} />
              </div>
              <span style={s.progressLabel}>{progressPct}%</span>
            </div>
            <div style={s.progressDetail}>{doneCount} of {total} done</div>
          </div>

          {/* Status breakdown bar */}
          {statuses.length > 0 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>Status breakdown</div>
              <div style={s.statusBar}>
                {statuses.map(([name, count]) => (
                  <div
                    key={name}
                    title={`${name}: ${count}`}
                    style={{
                      flex: count, height: '8px',
                      background: getStatusColor(name),
                      borderRadius: '4px',
                      minWidth: '4px',
                    }}
                  />
                ))}
              </div>
              <div style={s.statusLegend}>
                {statuses.map(([name, count]) => (
                  <span key={name} style={s.legendItem}>
                    <span style={{ ...s.legendDot, background: getStatusColor(name) }} />
                    {name} ({count})
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming due dates */}
          {upcoming.length > 0 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>Upcoming due dates</div>
              {upcoming.map(iss => (
                <div key={iss.key} style={s.issueRow}>
                  <span style={s.issueKey}>{iss.key}</span>
                  <span style={s.issueSummary}>{iss.summary}</span>
                  <span style={s.issueDue}>{iss.due}</span>
                </div>
              ))}
            </div>
          )}

          {/* Open full app */}
          <button
            style={s.openBtn}
            onClick={() => router.open('/jira/apps/fa18fadb-8536-4e8a-b8a3-86cf7a1f9068')}
          >Open Team Gantt →</button>
        </>
      )}
    </div>
  );
}

const s = {
  root: { padding: '16px', minHeight: '200px' },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' },
  headerTitle: { fontWeight: 700, fontSize: '15px', color: '#172B4D' },
  headerCount: { fontSize: '12px', color: '#6B778C', fontWeight: 500 },
  loading: { color: '#6B778C', padding: '20px 0', textAlign: 'center' },
  error: { color: '#DE350B', padding: '10px', background: '#FFEBE6', borderRadius: '4px', fontSize: '12px' },
  empty: { textAlign: 'center', padding: '30px 0', color: '#6B778C' },
  section: { marginBottom: '16px' },
  sectionTitle: { fontSize: '11px', fontWeight: 700, color: '#6B778C', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' },

  // Progress
  progressRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  progressBar: { flex: 1, height: '8px', background: '#F4F5F7', borderRadius: '4px', overflow: 'hidden' },
  progressFill: { height: '100%', background: '#00c875', borderRadius: '4px', transition: 'width 0.3s' },
  progressLabel: { fontSize: '13px', fontWeight: 700, color: '#172B4D', minWidth: '36px', textAlign: 'right' },
  progressDetail: { fontSize: '11px', color: '#97A0AF', marginTop: '2px' },

  // Status bar
  statusBar: { display: 'flex', gap: '2px', borderRadius: '4px', overflow: 'hidden', marginBottom: '6px' },
  statusLegend: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#42526E' },
  legendDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },

  // Issues
  issueRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', borderBottom: '1px solid #F4F5F7' },
  issueKey: { fontSize: '11px', fontWeight: 700, color: '#0052CC', background: '#DEEBFF', borderRadius: '3px', padding: '1px 5px', flexShrink: 0 },
  issueSummary: { fontSize: '12px', color: '#172B4D', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  issueDue: { fontSize: '11px', color: '#6B778C', flexShrink: 0 },

  // Open button
  openBtn: {
    display: 'block', width: '100%', marginTop: '12px', padding: '8px',
    background: '#0052CC', color: '#fff', border: 'none', borderRadius: '4px',
    cursor: 'pointer', fontSize: '13px', fontWeight: 600, textAlign: 'center',
  },

  // Edit mode
  editRoot: { padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' },
  editTitle: { fontWeight: 700, fontSize: '16px', color: '#172B4D' },
  label: { display: 'flex', flexDirection: 'column', gap: '4px' },
  labelText: { fontSize: '11px', fontWeight: 600, color: '#6B778C', textTransform: 'uppercase', letterSpacing: '0.4px' },
  input: { border: '1px solid #DFE1E6', borderRadius: '4px', padding: '7px 10px', fontSize: '13px', color: '#172B4D', outline: 'none' },
  textarea: { border: '1px solid #DFE1E6', borderRadius: '4px', padding: '7px 10px', fontSize: '12px', color: '#172B4D', outline: 'none', fontFamily: 'monospace', minHeight: '60px', resize: 'vertical' },
  hint: { fontSize: '11px', color: '#97A0AF' },
  saveBtn: { background: '#0052CC', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, alignSelf: 'flex-start' },
};
