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

const VIEW_TYPE_LABELS = { timeline: 'Gantt', list: 'List', project: 'Project', tree: 'Tree', roadmap: 'Roadmap' };

export default function App() {
  const [isEdit, setIsEdit] = useState(false);
  const [views, setViews] = useState([]);
  const [folders, setFolders] = useState([]);
  const [selectedViewId, setSelectedViewId] = useState('');
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load context
  useEffect(() => {
    view.getContext().then(ctx => {
      const config = ctx?.extension?.gadgetConfiguration;
      const editMode = ctx?.extension?.entryPoint === 'edit';
      setIsEdit(editMode);
      if (config?.viewId) setSelectedViewId(config.viewId);
    });
    // Load views for both modes
    Promise.all([invoke('getViews'), invoke('getFolders')]).then(([v, f]) => {
      setViews(v || []);
      setFolders(f || []);
    });
  }, []);

  // In render mode, fetch issues from the selected view's config
  const selectedView = views.find(v => v.id === selectedViewId);

  useEffect(() => {
    if (isEdit || !selectedView) { setLoading(false); return; }

    // Build JQL from the view's config (same logic as the main app)
    const customJql = (selectedView.jqlFilter || '').trim();
    const projects = selectedView.selectedProjects || [];
    const statusFilter = selectedView.statusFilter || 'active';

    let jql;
    if (customJql) {
      jql = customJql;
    } else if (projects.length > 0) {
      const statusClause = statusFilter === 'active' ? 'AND statusCategory != Done' : '';
      jql = `project in (${projects.join(', ')}) ${statusClause}`.trim();
    } else {
      // Try folder JQL
      if (selectedView.folderId) {
        const folder = folders.find(f => f.id === selectedView.folderId);
        if (folder?.defaultJql?.trim()) jql = folder.defaultJql.trim();
      }
    }

    if (!jql) {
      setIssues([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    // Fetch up to 200 issues for the summary (2 pages)
    async function fetchAll() {
      const all = [];
      let nextPageToken;
      for (let i = 0; i < 2; i++) {
        const result = await invoke('getIssues', { jql, nextPageToken, extraFields: [] });
        all.push(...(result.issues || []));
        if (result.isLast || !result.nextPageToken) break;
        nextPageToken = result.nextPageToken;
      }
      return all;
    }

    fetchAll()
      .then(data => { setIssues(data); setLoading(false); })
      .catch(err => { setError(err.message || 'Failed to load'); setLoading(false); });
  }, [selectedViewId, selectedView, isEdit, folders]);

  // ── Edit mode: pick a view ──────────────────────────────────────────────
  if (isEdit) {
    return (
      <div style={s.editRoot}>
        <div style={s.editTitle}>Choose a view</div>
        <p style={s.editDesc}>Pick which Team Gantt view to display on this dashboard.</p>

        {views.length === 0 ? (
          <div style={s.emptyViews}>Loading views...</div>
        ) : (
          <div style={s.viewList}>
            {views.map(v => {
              const folder = folders.find(f => f.id === v.folderId);
              const active = v.id === selectedViewId;
              return (
                <div
                  key={v.id}
                  style={{ ...s.viewOption, background: active ? '#DEEBFF' : '#fff', borderColor: active ? '#0052CC' : '#DFE1E6' }}
                  onClick={() => setSelectedViewId(v.id)}
                >
                  <div style={s.viewOptionHeader}>
                    <span style={s.viewOptionName}>{v.name}</span>
                    <span style={{ ...s.viewTypeBadge, background: active ? '#0052CC' : '#F4F5F7', color: active ? '#fff' : '#6B778C' }}>
                      {VIEW_TYPE_LABELS[v.viewType] || v.viewType}
                    </span>
                  </div>
                  {folder && <span style={s.viewFolder}>📁 {folder.name}</span>}
                  {v.jqlFilter && <span style={s.viewJql}>{v.jqlFilter.slice(0, 60)}{v.jqlFilter.length > 60 ? '...' : ''}</span>}
                  {active && <span style={s.checkmark}>✓</span>}
                </div>
              );
            })}
          </div>
        )}

        <button
          style={{ ...s.saveBtn, opacity: selectedViewId ? 1 : 0.5 }}
          disabled={!selectedViewId}
          onClick={() => view.submit({ viewId: selectedViewId })}
        >Save</button>
      </div>
    );
  }

  // ── Render mode ──────────────────────────────────────────────────────────
  if (!selectedView) {
    return (
      <div style={s.root}>
        <div style={s.empty}>
          <p style={{ fontWeight: 600 }}>No view selected</p>
          <p style={s.hint}>Edit this gadget to choose a Team Gantt view.</p>
        </div>
      </div>
    );
  }

  const viewLabel = VIEW_TYPE_LABELS[selectedView.viewType] || selectedView.viewType;

  // Stats
  const statusMap = {};
  for (const iss of issues) {
    const name = iss.fields?.status?.name || 'Unknown';
    statusMap[name] = (statusMap[name] || 0) + 1;
  }
  const statuses = Object.entries(statusMap).sort((a, b) => b[1] - a[1]);
  const total = issues.length;
  const doneCount = issues.filter(iss => iss.fields?.status?.name === 'Done').length;
  const progressPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const now = new Date();
  const upcoming = issues
    .filter(iss => iss.fields?.duedate)
    .map(iss => ({ key: iss.key, summary: iss.fields.summary, due: iss.fields.duedate }))
    .sort((a, b) => a.due.localeCompare(b.due))
    .filter(iss => iss.due >= now.toISOString().slice(0, 10))
    .slice(0, 5);

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={s.header}>
        <div>
          <span style={s.headerTitle}>{selectedView.name}</span>
          <span style={s.headerBadge}>{viewLabel}</span>
        </div>
        <span style={s.headerCount}>{total} issues</span>
      </div>

      {loading ? (
        <div style={s.loading}>Loading...</div>
      ) : error ? (
        <div style={s.error}>{error}</div>
      ) : total === 0 ? (
        <div style={s.empty}><p>No issues match this view's filter.</p></div>
      ) : (
        <>
          {/* Progress */}
          <div style={s.section}>
            <div style={s.progressRow}>
              <div style={s.progressBar}>
                <div style={{ ...s.progressFill, width: `${progressPct}%` }} />
              </div>
              <span style={s.progressLabel}>{progressPct}%</span>
            </div>
            <div style={s.progressDetail}>{doneCount} of {total} done</div>
          </div>

          {/* Status bar */}
          {statuses.length > 0 && (
            <div style={s.section}>
              <div style={s.statusBar}>
                {statuses.map(([name, count]) => (
                  <div key={name} title={`${name}: ${count}`}
                    style={{ flex: count, height: '8px', background: getStatusColor(name), borderRadius: '4px', minWidth: '4px' }}
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

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div style={s.section}>
              <div style={s.sectionTitle}>Upcoming</div>
              {upcoming.map(iss => (
                <div key={iss.key} style={s.issueRow}>
                  <span style={s.issueKey}>{iss.key}</span>
                  <span style={s.issueSummary}>{iss.summary}</span>
                  <span style={s.issueDue}>{iss.due}</span>
                </div>
              ))}
            </div>
          )}

          <button style={s.openBtn}
            onClick={() => router.open('/jira/apps/fa18fadb-8536-4e8a-b8a3-86cf7a1f9068')}
          >Open in Team Gantt →</button>
        </>
      )}
    </div>
  );
}

const s = {
  root: { padding: '16px', minHeight: '180px', fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif" },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' },
  headerTitle: { fontWeight: 700, fontSize: '15px', color: '#172B4D' },
  headerBadge: { marginLeft: '8px', fontSize: '10px', fontWeight: 700, background: '#F4F5F7', color: '#6B778C', borderRadius: '3px', padding: '2px 6px', textTransform: 'uppercase' },
  headerCount: { fontSize: '12px', color: '#6B778C', fontWeight: 500 },
  loading: { color: '#6B778C', padding: '20px 0', textAlign: 'center' },
  error: { color: '#DE350B', padding: '10px', background: '#FFEBE6', borderRadius: '4px', fontSize: '12px' },
  empty: { textAlign: 'center', padding: '30px 0', color: '#6B778C', fontSize: '13px' },
  section: { marginBottom: '14px' },
  sectionTitle: { fontSize: '11px', fontWeight: 700, color: '#6B778C', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' },
  progressRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  progressBar: { flex: 1, height: '8px', background: '#F4F5F7', borderRadius: '4px', overflow: 'hidden' },
  progressFill: { height: '100%', background: '#00c875', borderRadius: '4px', transition: 'width 0.3s' },
  progressLabel: { fontSize: '13px', fontWeight: 700, color: '#172B4D', minWidth: '36px', textAlign: 'right' },
  progressDetail: { fontSize: '11px', color: '#97A0AF', marginTop: '2px' },
  statusBar: { display: 'flex', gap: '2px', borderRadius: '4px', overflow: 'hidden', marginBottom: '6px' },
  statusLegend: { display: 'flex', flexWrap: 'wrap', gap: '8px' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#42526E' },
  legendDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  issueRow: { display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0', borderBottom: '1px solid #F4F5F7' },
  issueKey: { fontSize: '11px', fontWeight: 700, color: '#0052CC', background: '#DEEBFF', borderRadius: '3px', padding: '1px 5px', flexShrink: 0 },
  issueSummary: { fontSize: '12px', color: '#172B4D', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  issueDue: { fontSize: '11px', color: '#6B778C', flexShrink: 0 },
  openBtn: { display: 'block', width: '100%', marginTop: '12px', padding: '8px', background: '#0052CC', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, textAlign: 'center' },
  hint: { fontSize: '11px', color: '#97A0AF', marginTop: '4px' },

  // Edit mode
  editRoot: { padding: '20px', fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif" },
  editTitle: { fontWeight: 700, fontSize: '16px', color: '#172B4D', marginBottom: '4px' },
  editDesc: { fontSize: '13px', color: '#42526E', marginBottom: '16px' },
  emptyViews: { color: '#6B778C', padding: '20px 0', textAlign: 'center' },
  viewList: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', maxHeight: '300px', overflowY: 'auto' },
  viewOption: { border: '2px solid', borderRadius: '6px', padding: '10px 12px', cursor: 'pointer', position: 'relative', transition: 'border-color 0.15s' },
  viewOptionHeader: { display: 'flex', alignItems: 'center', gap: '8px' },
  viewOptionName: { fontWeight: 600, fontSize: '14px', color: '#172B4D' },
  viewTypeBadge: { fontSize: '10px', fontWeight: 700, borderRadius: '3px', padding: '2px 6px', textTransform: 'uppercase' },
  viewFolder: { display: 'block', fontSize: '11px', color: '#6B778C', marginTop: '4px' },
  viewJql: { display: 'block', fontSize: '11px', color: '#97A0AF', fontFamily: 'monospace', marginTop: '2px' },
  checkmark: { position: 'absolute', top: '10px', right: '12px', fontSize: '16px', fontWeight: 700, color: '#0052CC' },
  saveBtn: { background: '#0052CC', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 20px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
};
