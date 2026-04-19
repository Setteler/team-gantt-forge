import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { invoke, view as forgeView } from '@forge/bridge';
import GanttChart from './GanttChart';
import ListView from './ListView';
import ProjectView from './ProjectView';
import { getFieldValue } from '../utils';

const DEFAULT_CONFIG = {
  selectedProjects: [],
  statusFilter: 'active',
  jqlFilter: '',
  groupByField1: 'labels',
  groupByField2: 'assignee',
  startDateField: 'customfield_10015',
  endDateField: 'duedate',
  listFields: ['summary','status','assignee','customfield_10015','duedate'],
  viewType: 'timeline',
  orderByField: 'duedate',
  orderByDir: 'ASC',
  eventsOnly: false,
};

function extractGroupOptions(issues, fieldId) {
  const seen = new Set();
  for (const issue of issues) {
    const v = getFieldValue(issue.fields, fieldId);
    if (v) seen.add(v);
  }
  return Array.from(seen).sort();
}

function resolveFolderJql(v, allFolders) {
  if (!v?.folderId) return '';
  const folder = allFolders.find(f => f.id === v.folderId);
  return folder?.defaultJql?.trim() || '';
}

export default function GadgetMode() {
  const [isEdit, setIsEdit] = useState(false);
  const [viewId, setViewId] = useState('');
  const [views, setViews] = useState([]);
  const [folders, setFolders] = useState([]);
  const [issues, setIssues] = useState([]);
  const [customEvents, setCustomEvents] = useState([]);
  const [availableFields, setAvailableFields] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load context + data
  useEffect(() => {
    forgeView.getContext().then(ctx => {
      setIsEdit(ctx?.extension?.entryPoint === 'edit');
      const config = ctx?.extension?.gadgetConfiguration;
      if (config?.viewId) setViewId(config.viewId);
    });
    Promise.all([
      invoke('getViews'),
      invoke('getFolders'),
      invoke('getFields'),
      invoke('getHolidays'),
    ]).then(([v, f, fields, h]) => {
      setViews(v || []);
      setFolders(f || []);
      setAvailableFields(fields || []);
      setHolidays(h || []);
    });
  }, []);

  const selectedView = views.find(v => v.id === viewId);

  // Derive config from selected view
  const config = selectedView ? { ...DEFAULT_CONFIG, ...selectedView } : DEFAULT_CONFIG;

  // Fetch issues
  useEffect(() => {
    if (isEdit || !selectedView) { setLoading(false); return; }

    const customJql = (config.jqlFilter || '').trim();
    const projects = config.selectedProjects || [];
    let effectiveJql = customJql;
    if (!effectiveJql && projects.length === 0) {
      effectiveJql = resolveFolderJql(selectedView, folders);
    }
    if (!effectiveJql && projects.length === 0) {
      setIssues([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const orderClause = `ORDER BY ${config.orderByField || 'duedate'} ${config.orderByDir || 'ASC'}`;
    let jql;
    if (effectiveJql) {
      jql = effectiveJql.includes('ORDER BY') ? effectiveJql : `${effectiveJql} ${orderClause}`;
    } else {
      const statusClause = config.statusFilter === 'active' ? 'AND statusCategory != Done' : '';
      jql = `project in (${projects.join(', ')}) ${statusClause} ${orderClause}`.trim();
    }

    const extraFields = [config.groupByField1, config.groupByField2, config.startDateField, config.endDateField]
      .filter(f => f && !['summary','assignee','status','priority','duedate','customfield_10015','labels','issuetype','project','resolution','reporter'].includes(f));

    async function fetchAll() {
      const all = [];
      let nextPageToken;
      for (let i = 0; i < 10; i++) {
        const result = await invoke('getIssues', { jql, nextPageToken, extraFields });
        all.push(...(result.issues || []));
        if (result.isLast || !result.nextPageToken) break;
        nextPageToken = result.nextPageToken;
      }
      return all;
    }

    fetchAll().then(data => { setIssues(data); setLoading(false); }).catch(() => setLoading(false));

    // Also load custom events
    invoke('getCustomEvents', { viewId: selectedView.id, folderId: selectedView.folderId || null })
      .then(data => setCustomEvents(data || []));
  }, [viewId, selectedView, isEdit, folders]);

  // ── Edit mode: view picker ───────────────────────────────────────────────
  if (isEdit) {
    return (
      <div style={s.editRoot}>
        <div style={s.editTitle}>Choose a view to display</div>
        {views.length === 0 ? (
          <div style={s.loading}>Loading views...</div>
        ) : (
          <div style={s.viewList}>
            {views.map(v => {
              const folder = folders.find(f => f.id === v.folderId);
              const active = v.id === viewId;
              return (
                <div key={v.id}
                  style={{ ...s.viewCard, borderColor: active ? '#0052CC' : '#DFE1E6', background: active ? '#DEEBFF' : '#fff' }}
                  onClick={() => setViewId(v.id)}
                >
                  <span style={s.viewName}>{v.name}</span>
                  <span style={{ ...s.badge, background: active ? '#0052CC' : '#F4F5F7', color: active ? '#fff' : '#6B778C' }}>
                    {v.viewType === 'list' ? 'List' : v.viewType === 'project' ? 'Project' : 'Gantt'}
                  </span>
                  {folder && <span style={s.viewFolder}>📁 {folder.name}</span>}
                  {active && <span style={s.check}>✓</span>}
                </div>
              );
            })}
          </div>
        )}
        <button
          style={{ ...s.saveBtn, opacity: viewId ? 1 : 0.5 }}
          disabled={!viewId}
          onClick={() => forgeView.submit({ viewId })}
        >Save</button>
      </div>
    );
  }

  // ── Render mode: show the actual view ────────────────────────────────────
  if (!selectedView) {
    return (
      <div style={s.empty}>
        <p style={{ fontWeight: 600, fontSize: '14px' }}>No view selected</p>
        <p style={{ color: '#6B778C', fontSize: '12px', marginTop: '4px' }}>Edit this gadget to choose a Team Gantt view.</p>
      </div>
    );
  }

  if (loading) {
    return <div style={s.loading}>Loading...</div>;
  }

  const today = new Date();
  const fieldLabel = (id) => availableFields.find(f => f.id === id)?.name || id;

  const viewContent = (() => {
    if (config.viewType === 'list') {
      return (
        <ListView
          issues={issues}
          customEvents={customEvents}
          listFields={config.listFields}
          availableFields={availableFields}
          startDateField={config.startDateField}
          endDateField={config.endDateField}
          groupByField1={config.groupByField1}
          groupByField2={config.groupByField2}
          groupByField1Label={fieldLabel(config.groupByField1)}
          groupByField2Label={fieldLabel(config.groupByField2)}
          groupOptions1={extractGroupOptions(issues, config.groupByField1)}
          groupOptions2={extractGroupOptions(issues, config.groupByField2)}
        />
      );
    }
    if (config.viewType === 'project') {
      return (
        <ProjectView
          issues={issues}
          today={today}
          startDateField={config.startDateField}
          endDateField={config.endDateField}
          holidays={holidays}
        />
      );
    }
    // Default: Gantt timeline
    return (
      <GanttChart
        issues={issues}
        customEvents={customEvents}
        today={today}
        groupByField1={config.groupByField1}
        groupByField2={config.groupByField2}
        groupByField1Label={fieldLabel(config.groupByField1)}
        groupByField2Label={fieldLabel(config.groupByField2)}
        startDateField={config.startDateField}
        endDateField={config.endDateField}
        holidays={holidays}
        showCriticalPath={false}
      />
    );
  })();

  // Auto-resize the gadget iframe to fit content
  const rootRef = useRef(null);
  useEffect(() => {
    if (!rootRef.current) return;
    const resize = () => {
      const h = Math.max(400, rootRef.current.scrollHeight || 500);
      try { forgeView.resize({ height: `${h}px` }); } catch {}
    };
    resize();
    // Re-check after a short delay (content may still be rendering)
    const t1 = setTimeout(resize, 500);
    const t2 = setTimeout(resize, 1500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [issues, loading, viewId]);

  return (
    <div ref={rootRef} style={s.gadgetRoot}>
      {viewContent}
    </div>
  );
}

const s = {
  gadgetRoot: { display: 'flex', flexDirection: 'column', height: '100vh', fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif", fontSize: '13px', color: '#323338', background: '#fafbfd' },
  loading: { color: '#6B778C', padding: '40px', textAlign: 'center', fontSize: '13px' },
  empty: { textAlign: 'center', padding: '40px', color: '#42526E' },

  // Edit
  editRoot: { padding: '20px', fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif" },
  editTitle: { fontWeight: 700, fontSize: '16px', color: '#172B4D', marginBottom: '12px' },
  viewList: { display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px', maxHeight: '350px', overflowY: 'auto' },
  viewCard: { border: '2px solid', borderRadius: '6px', padding: '10px 12px', cursor: 'pointer', position: 'relative', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' },
  viewName: { fontWeight: 600, fontSize: '14px', color: '#172B4D' },
  badge: { fontSize: '10px', fontWeight: 700, borderRadius: '3px', padding: '2px 6px', textTransform: 'uppercase' },
  viewFolder: { fontSize: '11px', color: '#6B778C', width: '100%' },
  check: { position: 'absolute', top: '10px', right: '12px', fontSize: '16px', fontWeight: 700, color: '#0052CC' },
  saveBtn: { background: '#0052CC', color: '#fff', border: 'none', borderRadius: '4px', padding: '8px 20px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
};
