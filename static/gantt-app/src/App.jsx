import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@forge/bridge';
import GanttChart from './components/GanttChart';
import ListView from './components/ListView';
import TreeView from './components/TreeView';
import RoadmapView from './components/RoadmapView';
import ViewSidebar from './components/ViewSidebar';
import TeamsModule from './components/TeamsModule';
import RisksModule from './components/RisksModule';
import ObjectivesModule from './components/ObjectivesModule';
import ResourcesModule from './components/ResourcesModule';
import ReportsModule from './components/ReportsModule';
import EventModal from './components/EventModal';
import ConfigPanel from './components/ConfigPanel';
import { getFieldValue } from './utils';

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function extractGroupOptions(issues, fieldId) {
  const seen = new Set();
  for (const issue of issues) {
    const v = getFieldValue(issue.fields, fieldId);
    if (v) seen.add(v);
  }
  return Array.from(seen).sort();
}

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

export default function App() {
  const today = new Date();

  const [issues, setIssues]                     = useState([]);
  const [customEvents, setCustomEvents]           = useState([]);
  const [availableProjects, setAvailableProjects] = useState([]);
  const [availableFields, setAvailableFields]     = useState([]);
  const [loading, setLoading]                     = useState(true);
  const [error, setError]                         = useState(null);
  const [issuesTruncated, setIssuesTruncated]     = useState(false);

  const [views, setViews]     = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeViewId, setActiveViewId] = useState('default');
  const [showSidebar, setShowSidebar] = useState(true);

  // Per-view config (local state — saved explicitly via ConfigPanel)
  const [selectedProjects, setSelectedProjects] = useState(DEFAULT_CONFIG.selectedProjects);
  const [statusFilter, setStatusFilter]         = useState(DEFAULT_CONFIG.statusFilter);
  const [jqlFilter, setJqlFilter]               = useState(DEFAULT_CONFIG.jqlFilter);
  const [groupByField1, setGroupByField1]       = useState(DEFAULT_CONFIG.groupByField1);
  const [groupByField2, setGroupByField2]       = useState(DEFAULT_CONFIG.groupByField2);
  const [startDateField, setStartDateField]     = useState(DEFAULT_CONFIG.startDateField);
  const [endDateField, setEndDateField]         = useState(DEFAULT_CONFIG.endDateField);
  const [listFields, setListFields]             = useState(DEFAULT_CONFIG.listFields);
  const [viewType, setViewType]                 = useState(DEFAULT_CONFIG.viewType);
  const [orderByField, setOrderByField]         = useState(DEFAULT_CONFIG.orderByField);
  const [orderByDir, setOrderByDir]             = useState(DEFAULT_CONFIG.orderByDir);
  const [eventsOnly, setEventsOnly]             = useState(DEFAULT_CONFIG.eventsOnly);

  // Scroll navigation for timeline
  const [scrollTarget, setScrollTarget] = useState(null);
  const [visYear, setVisYear]   = useState(today.getFullYear());
  const [visMonth, setVisMonth] = useState(today.getMonth());

  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent]     = useState(null);
  const [pendingCreate, setPendingCreate]   = useState(null);
  const [showConfig, setShowConfig]         = useState(false);
  const [ganttFilter, setGanttFilter]       = useState('all');
  const [showCriticalPath, setShowCriticalPath] = useState(true);

  // ── Baselines ──────────────────────────────────────────────────────────────
  const [baselines, setBaselines]             = useState([]);
  const [activeBaselineId, setActiveBaselineId] = useState(null);

  // ── Holidays (global) ─────────────────────────────────────────────────────
  const [holidays, setHolidays] = useState([]);

  // ── Modules ───────────────────────────────────────────────────────────────
  const [activeModuleId, setActiveModuleId] = useState(null);
  const [teams, setTeams] = useState([]);
  const [risks, setRisks] = useState([]);
  const [objectives, setObjectives] = useState([]);

  // ── Load everything on mount ──────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      invoke('getViews'),
      invoke('getProjects'),
      invoke('getFolders'),
      invoke('getFields'),
      invoke('getHolidays'),
      invoke('getTeams'),
      invoke('getRisks'),
      invoke('getObjectives'),
    ]).then(([viewsData, projectsData, foldersData, fieldsData, holidaysData, teamsData, risksData, objectivesData]) => {
      setHolidays(holidaysData || []);
      setTeams(teamsData || []);
      setRisks(risksData || []);
      setObjectives(objectivesData || []);
      const loadedViews = viewsData || [];
      setViews(loadedViews);
      setFolders(foldersData || []);
      setAvailableFields(fieldsData || []);

      const projects = (projectsData.values || []).map(p => ({ key: p.key, name: p.name }));
      setAvailableProjects(projects);

      const active = loadedViews.find(v => v.isDefault) || loadedViews[0];
      if (active) {
        applyView(active);
        invoke('getCustomEvents', { viewId: active.id, folderId: active.folderId || null })
          .then(eventsData => setCustomEvents(eventsData || []));
        invoke('getBaselines', { viewId: active.id, folderId: active.folderId || null })
          .then(data => { setBaselines(data || []); setActiveBaselineId(null); });
      }
    }).catch(() => {});
  }, []);

  function applyView(view) {
    setActiveViewId(view.id);
    setSelectedProjects(view.selectedProjects || []);
    setStatusFilter(view.statusFilter || 'active');
    setJqlFilter(view.jqlFilter || '');
    setGroupByField1(view.groupByField1 || 'labels');
    setGroupByField2(view.groupByField2 || 'assignee');
    setStartDateField(view.startDateField || 'customfield_10015');
    setEndDateField(view.endDateField || 'duedate');
    setListFields(view.listFields || DEFAULT_CONFIG.listFields);
    setViewType(view.viewType || 'timeline');
    setOrderByField(view.orderByField || 'duedate');
    setOrderByDir(view.orderByDir || 'ASC');
    setEventsOnly(view.eventsOnly || false);
  }

  // ── Dirty state — has config diverged from saved view? ────────────────────
  const savedView = views.find(v => v.id === activeViewId);
  const isDirty = savedView && (
    JSON.stringify(selectedProjects) !== JSON.stringify(savedView.selectedProjects || []) ||
    statusFilter   !== (savedView.statusFilter   || 'active') ||
    jqlFilter      !== (savedView.jqlFilter      || '') ||
    groupByField1  !== (savedView.groupByField1  || 'labels') ||
    groupByField2  !== (savedView.groupByField2  || 'assignee') ||
    startDateField !== (savedView.startDateField || 'customfield_10015') ||
    endDateField   !== (savedView.endDateField   || 'duedate') ||
    JSON.stringify(listFields) !== JSON.stringify(savedView.listFields || DEFAULT_CONFIG.listFields) ||
    viewType       !== (savedView.viewType       || 'timeline') ||
    orderByField   !== (savedView.orderByField   || 'duedate') ||
    orderByDir     !== (savedView.orderByDir     || 'ASC') ||
    eventsOnly     !== (savedView.eventsOnly     || false)
  );

  // ── Resolve Box-scoped JQL ────────────────────────────────────────────────
  // Walks up the Box (folder) hierarchy starting from the view's folderId.
  // Returns the first non-empty defaultJql found, or '' if none.
  // Cycle-safe: keeps a visited set so a malformed parentId chain can't loop.
  function resolveBoxJql(view, allFolders) {
    if (!view || !view.folderId) return '';
    const folderMap = {};
    for (const f of allFolders) folderMap[f.id] = f;

    let currentId = view.folderId;
    const visited = new Set();
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const box = folderMap[currentId];
      if (!box) break; // orphan reference
      if (box.defaultJql && box.defaultJql.trim()) return box.defaultJql.trim();
      currentId = box.parentId || null;
    }
    return '';
  }

  // ── Fetch issues ──────────────────────────────────────────────────────────
  const fetchIssues = useCallback(async () => {
    if (eventsOnly) {
      setIssues([]);
      setLoading(false);
      return;
    }
    const customJql = jqlFilter.trim();

    // Fallback: if view has no JQL and no projects, try inheriting from parent Box chain
    let effectiveJql = customJql;
    if (!effectiveJql && selectedProjects.length === 0) {
      const currentView = views.find(v => v.id === activeViewId);
      effectiveJql = resolveBoxJql(currentView, folders);
    }

    if (!effectiveJql && selectedProjects.length === 0) {
      setIssues([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setIssuesTruncated(false);

    try {
      const orderClause = `ORDER BY ${orderByField || 'duedate'} ${orderByDir || 'ASC'}`;
      let jql;
      if (effectiveJql) {
        // effectiveJql is either the view's own jqlFilter or inherited from a parent Box
        jql = effectiveJql.includes('ORDER BY') ? effectiveJql : `${effectiveJql} ${orderClause}`;
      } else {
        const projectClause = selectedProjects.join(', ');
        const statusClause = statusFilter === 'active' ? 'AND statusCategory != Done' : '';
        jql = [`project in (${projectClause})`, statusClause, orderClause]
          .filter(Boolean).join(' ');
      }

      const defaultFields = ['summary','assignee','status','priority','duedate','customfield_10015','labels','issuetype','project','resolution','reporter'];
      const extraFields = [groupByField1, groupByField2, startDateField, endDateField].filter(f =>
        f && !defaultFields.includes(f)
      );

      const allIssues = [];
      let nextPageToken = undefined;
      let pageCount = 0;
      const PAGE_LIMIT = 10;

      while (pageCount < PAGE_LIMIT) {
        const result = await invoke('getIssues', { jql, nextPageToken, extraFields });
        allIssues.push(...(result.issues || []));
        if (result.isLast || !result.nextPageToken) break;
        nextPageToken = result.nextPageToken;
        pageCount++;
        if (pageCount === PAGE_LIMIT) {
          setIssuesTruncated(true);
          break;
        }
      }

      setIssues(allIssues);
    } catch (err) {
      setError(err.message || 'Failed to load issues');
    } finally {
      setLoading(false);
    }
  }, [selectedProjects, statusFilter, jqlFilter, groupByField1, groupByField2, startDateField, endDateField, orderByField, orderByDir, eventsOnly, views, activeViewId, folders]);

  useEffect(() => {
    const customJql = jqlFilter.trim();
    // Also trigger fetch if a parent Box provides JQL via inheritance
    const currentView = views.find(v => v.id === activeViewId);
    const boxJql = resolveBoxJql(currentView, folders);
    if (selectedProjects.length > 0 || customJql || boxJql) fetchIssues();
    else setLoading(false);
  }, [fetchIssues]);

  // ── View management ───────────────────────────────────────────────────────
  function switchView(viewId) {
    if (isDirty) {
      if (!window.confirm('You have unsaved config changes. Switch anyway and discard them?')) return;
    }
    const view = views.find(v => v.id === viewId);
    if (!view) return;
    setActiveModuleId(null);
    applyView(view);
    setShowConfig(false);
    invoke('getCustomEvents', { viewId: view.id, folderId: view.folderId || null })
      .then(eventsData => setCustomEvents(eventsData || []));
    invoke('getBaselines', { viewId: view.id, folderId: view.folderId || null })
      .then(data => { setBaselines(data || []); setActiveBaselineId(null); });
  }

  async function createView(name, folderId = null, newViewType = 'timeline') {
    // New views always start with clean defaults — no config inheritance
    const newView = {
      name,
      ...DEFAULT_CONFIG,
      viewType: newViewType,
      folderId,
      isDefault: false,
    };
    const saved = await invoke('saveView', { view: newView });
    setViews(prev => [...prev, saved]);
    setActiveModuleId(null);
    applyView(saved);
    setActiveViewId(saved.id);
    invoke('getCustomEvents', { viewId: saved.id, folderId: saved.folderId || null })
      .then(eventsData => setCustomEvents(eventsData || []));
    invoke('getBaselines', { viewId: saved.id, folderId: saved.folderId || null })
      .then(data => { setBaselines(data || []); setActiveBaselineId(null); });
  }

  async function renameView(viewId, newName) {
    const view = views.find(v => v.id === viewId);
    if (!view) return;
    const updated = { ...view, name: newName };
    await invoke('saveView', { view: updated });
    setViews(prev => prev.map(v => v.id === viewId ? updated : v));
  }

  async function deleteView(viewId) {
    const result = await invoke('deleteView', { id: viewId });
    if (!result.success) return;
    const updated = views.filter(v => v.id !== viewId);
    setViews(updated);
    if (activeViewId === viewId && updated.length > 0) switchView(updated[0].id);
  }

  async function moveViewToFolder(viewId, folderId) {
    const view = views.find(v => v.id === viewId);
    if (!view) return;
    const oldFolderId = view.folderId || null;
    if (oldFolderId === (folderId || null)) return;

    // Migrate events and baselines from old storage key to new storage key
    await invoke('migrateViewEvents', { viewId, fromFolderId: oldFolderId, toFolderId: folderId || null });
    await invoke('migrateViewBaselines', { viewId, fromFolderId: oldFolderId, toFolderId: folderId || null });

    const updated = { ...view, folderId: folderId || null };
    await invoke('saveView', { view: updated });
    setViews(prev => prev.map(v => v.id === viewId ? updated : v));

    // Reload events and baselines for active view if it's the one being moved
    if (viewId === activeViewId) {
      invoke('getCustomEvents', { viewId, folderId: folderId || null })
        .then(eventsData => setCustomEvents(eventsData || []));
      invoke('getBaselines', { viewId, folderId: folderId || null })
        .then(data => setBaselines(data || []));
    }
  }

  async function saveCurrentView() {
    const view = views.find(v => v.id === activeViewId);
    if (!view) return;
    const updated = {
      ...view,
      selectedProjects, statusFilter, jqlFilter,
      groupByField1, groupByField2, startDateField, endDateField,
      listFields, viewType, orderByField, orderByDir, eventsOnly,
    };
    await invoke('saveView', { view: updated });
    setViews(prev => prev.map(v => v.id === activeViewId ? updated : v));
    setShowConfig(false);
  }

  // ── Folder / Box management ────────────────────────────────────────────────
  async function createFolder(name, boxType = 'custom', parentId = null) {
    const saved = await invoke('saveFolder', { folder: { name, boxType, parentId } });
    setFolders(prev => [...prev, saved]);
    return saved;
  }

  async function renameFolder(folderId, newName) {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    const updated = { ...folder, name: newName };
    await invoke('saveFolder', { folder: updated });
    setFolders(prev => prev.map(f => f.id === folderId ? updated : f));
  }

  async function deleteFolder(folderId) {
    await invoke('deleteFolder', { id: folderId });
    setFolders(prev => {
      // Remove the folder, un-parent its children
      return prev
        .filter(f => f.id !== folderId)
        .map(f => f.parentId === folderId ? { ...f, parentId: null } : f);
    });
    setViews(prev => prev.map(v => v.folderId === folderId ? { ...v, folderId: null } : v));
  }

  async function moveBoxToParent(boxId, newParentId) {
    const folder = folders.find(f => f.id === boxId);
    if (!folder) return;
    const updated = { ...folder, parentId: newParentId || null };
    await invoke('saveFolder', { folder: updated });
    setFolders(prev => prev.map(f => f.id === boxId ? updated : f));
  }

  // ── Save Box configuration (name, description, defaultJql) ────────────────
  async function handleSaveBox(updatedBox) {
    const saved = await invoke('saveFolder', { folder: updatedBox });
    setFolders(prev => prev.map(f => f.id === saved.id ? saved : f));
  }

  // ── Custom event CRUD ─────────────────────────────────────────────────────
  function openCreateEvent() {
    setPendingCreate(null);
    setEditingEvent(null);
    setShowEventModal(true);
  }

  function openEditEvent(event) {
    setPendingCreate(null);
    setEditingEvent(event);
    setShowEventModal(true);
  }

  function handleCreateEvent({ startDate, endDate, g1, g2 }) {
    setEditingEvent(null);
    setPendingCreate({ startDate, endDate, group1Value: g1, group2Value: g2 });
    setShowEventModal(true);
  }

  function closeEventModal() {
    setShowEventModal(false);
    setEditingEvent(null);
    setPendingCreate(null);
  }

  async function saveEvent(eventData) {
    const activeView = views.find(v => v.id === activeViewId);
    const folderId = activeView?.folderId ?? null;
    const withFolder = { ...eventData, folderId, viewId: activeViewId };
    const saved = await invoke('saveCustomEvent', { event: withFolder });
    setCustomEvents(prev => eventData.id
      ? prev.map(e => e.id === eventData.id ? saved : e)
      : [...prev, saved]
    );
    closeEventModal();
  }

  async function deleteEvent(id) {
    const activeView = views.find(v => v.id === activeViewId);
    await invoke('deleteCustomEvent', { id, viewId: activeViewId, folderId: activeView?.folderId || null });
    setCustomEvents(prev => prev.filter(e => e.id !== id));
  }

  async function updateEventDates(event, newStartDate, newEndDate) {
    const updated = { ...event, startDate: newStartDate, endDate: newEndDate };
    setCustomEvents(prev => prev.map(e => e.id === event.id ? updated : e));
    const saved = await invoke('saveCustomEvent', { event: updated });
    setCustomEvents(prev => prev.map(e => e.id === event.id ? saved : e));
  }

  async function updateIssueDates(key, newStartDate, newEndDate) {
    setIssues(prev => prev.map(iss => {
      if (iss.key !== key) return iss;
      return {
        ...iss,
        fields: {
          ...iss.fields,
          [startDateField || 'customfield_10015']: newStartDate,
          [endDateField   || 'duedate']:            newEndDate,
        },
      };
    }));
    await invoke('updateIssueDates', {
      key,
      startDate: newStartDate,
      dueDate: newEndDate,
      startDateField: startDateField || 'customfield_10015',
      endDateField: endDateField || 'duedate',
    });
  }

  // ── Baseline management ───────────────────────────────────────────────────
  async function createBaseline(name) {
    const activeView = views.find(v => v.id === activeViewId);
    const folderId = activeView?.folderId ?? null;
    const sdf = startDateField || 'customfield_10015';
    const edf = endDateField || 'duedate';

    // Snapshot current issue dates from UI state
    const issueSnapshot = {};
    for (const issue of issues) {
      const sd = issue.fields[sdf] || null;
      const ed = issue.fields[edf] || null;
      if (sd || ed) {
        issueSnapshot[issue.key] = { startDate: sd, endDate: ed };
      }
    }

    // Snapshot current custom event dates from UI state
    const eventSnapshot = customEvents.map(evt => ({
      id: evt.id,
      startDate: evt.startDate || null,
      endDate: evt.endDate || null,
    }));

    const baseline = {
      name,
      viewId: activeViewId,
      folderId,
      createdAt: Date.now(),
      snapshot: {
        issues: issueSnapshot,
        events: eventSnapshot,
      },
    };

    const saved = await invoke('saveBaseline', { baseline });
    setBaselines(prev => [...prev, saved]);
    setActiveBaselineId(saved.id);
  }

  async function deleteBaseline(id) {
    const activeView = views.find(v => v.id === activeViewId);
    await invoke('deleteBaseline', { id, viewId: activeViewId, folderId: activeView?.folderId || null });
    setBaselines(prev => prev.filter(b => b.id !== id));
    if (activeBaselineId === id) setActiveBaselineId(null);
  }

  // ── Holiday management (global) ────────────────────────────────────────────
  async function saveHolidaysList(updatedList) {
    const saved = await invoke('saveHolidays', { holidays: updatedList });
    setHolidays(saved || []);
  }

  // ── Team management ────────────────────────────────────────────────────────
  async function saveTeam(teamData) {
    const saved = await invoke('saveTeam', { team: teamData });
    setTeams(prev => {
      const idx = prev.findIndex(t => t.id === saved.id);
      if (idx >= 0) return prev.map(t => t.id === saved.id ? saved : t);
      return [...prev, saved];
    });
  }

  async function deleteTeam(id) {
    await invoke('deleteTeam', { id });
    setTeams(prev => prev.filter(t => t.id !== id));
  }

  // ── Risk management ───────────────────────────────────────────────────────
  async function saveRisk(riskData) {
    const saved = await invoke('saveRisk', { risk: riskData });
    setRisks(prev => {
      const idx = prev.findIndex(r => r.id === saved.id);
      if (idx >= 0) return prev.map(r => r.id === saved.id ? saved : r);
      return [...prev, saved];
    });
  }

  async function deleteRisk(id) {
    await invoke('deleteRisk', { id });
    setRisks(prev => prev.filter(r => r.id !== id));
  }

  // ── Objective management ───────────────────────────────────────────────────
  async function saveObjective(objData) {
    const saved = await invoke('saveObjective', { objective: objData });
    setObjectives(prev => {
      const idx = prev.findIndex(o => o.id === saved.id);
      if (idx >= 0) return prev.map(o => o.id === saved.id ? saved : o);
      return [...prev, saved];
    });
  }

  async function deleteObjective(id) {
    await invoke('deleteObjective', { id });
    setObjectives(prev => prev.filter(o => o.id !== id));
  }

  // ── Module selection ──────────────────────────────────────────────────────
  function handleSelectModule(moduleId) {
    setActiveModuleId(moduleId || null);
    if (moduleId) {
      setShowConfig(false);
    }
  }

  // ── Timeline navigation ───────────────────────────────────────────────────
  function navigateTo(year, month) {
    setVisYear(year);
    setVisMonth(month);
    setScrollTarget({ year, month, seq: Date.now() });
  }

  function navigateMonth(delta) {
    const d = new Date(visYear, visMonth + delta, 1);
    navigateTo(d.getFullYear(), d.getMonth());
  }

  function jumpToToday() {
    navigateTo(today.getFullYear(), today.getMonth());
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const activeView = views.find(v => v.id === activeViewId);

  const fieldLabel = (id) => availableFields.find(f => f.id === id)?.name || id;
  const groupByField1Label = fieldLabel(groupByField1);
  const groupByField2Label = fieldLabel(groupByField2);

  const groupOptions1 = extractGroupOptions(issues, groupByField1);
  const groupOptions2 = extractGroupOptions(issues, groupByField2);

  const activeBaseline = activeBaselineId ? baselines.find(b => b.id === activeBaselineId) || null : null;

  const monthLabel = `${MONTH_NAMES[visMonth]} ${visYear}`;

  return (
    <div style={styles.root}>
      {/* ── Toolbar ── */}
      <div style={styles.toolbar}>
        <button style={styles.sidebarToggle} onClick={() => setShowSidebar(v => !v)} title="Toggle sidebar">☰</button>
        <span style={styles.appTitle}>Team Gantt</span>
        {activeModuleId === 'teams' ? (
          <span style={styles.viewName}>&#128101; Teams</span>
        ) : activeModuleId === 'risks' ? (
          <span style={styles.viewName}>&#9888;&#65039; Risks</span>
        ) : activeModuleId === 'objectives' ? (
          <span style={styles.viewName}>&#127919; Objectives</span>
        ) : activeModuleId === 'resources' ? (
          <span style={styles.viewName}>&#128202; Resources</span>
        ) : activeModuleId === 'reports' ? (
          <span style={styles.viewName}>&#128200; Reports</span>
        ) : activeView && (
          <span style={styles.viewName}>
            {viewType === 'tree' ? '⊞ ' : viewType === 'list' ? '≡ ' : viewType === 'roadmap' ? '▧ ' : '▤ '}{activeView.name}
            {isDirty && <span style={styles.dirtyDot} title="Unsaved changes">●</span>}
          </span>
        )}

        {viewType === 'timeline' && !activeModuleId && (
          <div style={styles.navGroup}>
            <button style={styles.navBtn} onClick={() => navigateMonth(-1)}>‹</button>
            <span style={styles.monthLabel}>{monthLabel}</span>
            <button style={styles.navBtn} onClick={() => navigateMonth(1)}>›</button>
            <button style={styles.todayBtn} onClick={jumpToToday}>Today</button>
          </div>
        )}

        {!activeModuleId && (
        <div style={styles.toolbarRight}>
          <button style={styles.addEventBtn} onClick={openCreateEvent}>+ Add Event</button>
          <button
            style={{ ...styles.configBtn, background: isDirty ? '#FFFAE6' : '#fff', borderColor: isDirty ? '#FF8B00' : '#DFE1E6' }}
            onClick={() => setShowConfig(v => !v)}
            title={isDirty ? 'Configure view (unsaved changes)' : 'Configure view'}
          >Configure{isDirty ? ' ·' : ''}</button>
          <button style={styles.refreshBtn} onClick={fetchIssues} title="Refresh">⟳</button>
        </div>
        )}
      </div>

      {/* ── Gantt filter bar ── */}
      {viewType === 'timeline' && !activeModuleId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 16px', background: '#fff', borderBottom: '1px solid #e6e9ef', flexShrink: 0 }}>
          {[
            { f: 'all',    label: `All (${issues.length + customEvents.length})` },
            { f: 'issues', label: `Issues (${issues.length})` },
            { f: 'events', label: `Events (${customEvents.length})` },
          ].map(({ f, label }) => (
            <button key={f}
              style={{
                padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
                border: '1px solid', cursor: 'pointer',
                background: ganttFilter === f ? '#0073ea' : '#fff',
                color: ganttFilter === f ? '#fff' : '#6B778C',
                borderColor: ganttFilter === f ? '#0073ea' : '#DFE1E6',
              }}
              onClick={() => setGanttFilter(f)}
            >{label}</button>
          ))}
          <div style={{ width: '1px', height: '20px', background: '#DFE1E6', margin: '0 4px' }} />
          <button
            style={{
              padding: '4px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: 500,
              border: '1px solid', cursor: 'pointer',
              background: showCriticalPath ? '#E2445C' : '#fff',
              color: showCriticalPath ? '#fff' : '#6B778C',
              borderColor: showCriticalPath ? '#E2445C' : '#DFE1E6',
              display: 'flex', alignItems: 'center', gap: '4px',
            }}
            onClick={() => setShowCriticalPath(v => !v)}
            title="Highlight the longest chain of dependent issues"
          >
            <span style={{ fontSize: '10px' }}>{showCriticalPath ? '■' : '□'}</span> Critical Path
          </button>
        </div>
      )}

      {/* ── Truncation warning ── */}
      {issuesTruncated && !activeModuleId && (
        <div style={styles.truncationBanner}>
          ⚠ Showing first 1,000 issues only. Refine your filter to see all results.
          <button style={styles.retryBtn} onClick={() => setIssuesTruncated(false)}>✕</button>
        </div>
      )}

      {/* ── Layout ── */}
      <div style={styles.layout}>
        {showSidebar && (
          <ViewSidebar
            views={views}
            folders={folders}
            activeViewId={activeModuleId ? null : activeViewId}
            onSwitch={switchView}
            onCreate={createView}
            onRename={renameView}
            onDelete={deleteView}
            onMoveToFolder={moveViewToFolder}
            onCreateFolder={createFolder}
            onRenameFolder={renameFolder}
            onDeleteFolder={deleteFolder}
            onMoveBoxToParent={moveBoxToParent}
            onSaveBox={handleSaveBox}
            activeModuleId={activeModuleId}
            onSelectModule={handleSelectModule}
          />
        )}

        <div style={styles.content}>
          {activeModuleId === 'teams' ? (
            <TeamsModule teams={teams} onSaveTeam={saveTeam} onDeleteTeam={deleteTeam} />
          ) : activeModuleId === 'risks' ? (
            <RisksModule risks={risks} onSaveRisk={saveRisk} onDeleteRisk={deleteRisk} />
          ) : activeModuleId === 'objectives' ? (
            <ObjectivesModule objectives={objectives} issues={issues} onSaveObjective={saveObjective} onDeleteObjective={deleteObjective} />
          ) : activeModuleId === 'resources' ? (
            <ResourcesModule issues={issues} teams={teams} startDateField={startDateField} endDateField={endDateField} />
          ) : activeModuleId === 'reports' ? (
            <ReportsModule issues={issues} startDateField={startDateField} endDateField={endDateField} />
          ) : (
          <>
          {error && (
            <div style={styles.errorBanner}>
              ⚠️ {error}
              <button style={styles.retryBtn} onClick={fetchIssues}>Retry</button>
            </div>
          )}
          {loading ? (
            <div style={styles.loadingWrap}>
              <div style={styles.spinner} />
              <p style={styles.loadingText}>Loading issues…</p>
            </div>
          ) : viewType === 'list' ? (
            <ListView
              issues={issues}
              customEvents={customEvents}
              listFields={listFields}
              availableFields={availableFields}
              startDateField={startDateField}
              endDateField={endDateField}
              groupByField1={groupByField1}
              groupByField2={groupByField2}
              groupByField1Label={groupByField1Label}
              groupByField2Label={groupByField2Label}
              groupOptions1={groupOptions1}
              groupOptions2={groupOptions2}
              onEditEvent={openEditEvent}
              onAddEvent={openCreateEvent}
              onSaveEvent={saveEvent}
            />
          ) : viewType === 'tree' ? (
            <TreeView
              issues={issues}
              customEvents={customEvents}
              availableFields={availableFields}
              startDateField={startDateField}
              endDateField={endDateField}
              listFields={listFields}
              onEditEvent={openEditEvent}
              onAddEvent={openCreateEvent}
              onSaveEvent={saveEvent}
            />
          ) : viewType === 'roadmap' ? (
            <RoadmapView
              issues={issues}
              today={today}
              groupByField1={groupByField1}
              groupByField2={groupByField2}
              groupByField1Label={groupByField1Label}
              groupByField2Label={groupByField2Label}
              startDateField={startDateField}
              endDateField={endDateField}
            />
          ) : (
            <GanttChart
              issues={ganttFilter === 'events' ? [] : issues}
              customEvents={ganttFilter === 'issues' ? [] : customEvents}
              today={today}
              groupByField1={groupByField1}
              groupByField2={groupByField2}
              groupByField1Label={groupByField1Label}
              groupByField2Label={groupByField2Label}
              startDateField={startDateField}
              endDateField={endDateField}
              scrollToTarget={scrollTarget}
              onVisibleMonthChange={(y, m) => { setVisYear(y); setVisMonth(m); }}
              onEditEvent={openEditEvent}
              onDeleteEvent={deleteEvent}
              onUpdateEvent={updateEventDates}
              onUpdateIssue={updateIssueDates}
              onCreateEvent={handleCreateEvent}
              onPreviewIssue={null}
              previewFields={listFields}
              availableFields={availableFields}
              showCriticalPath={showCriticalPath}
              activeBaseline={activeBaseline}
              holidays={holidays}
            />
          )}
          </>
          )}
        </div>

        {showConfig && (
          <ConfigPanel
            availableProjects={availableProjects}
            availableFields={availableFields}
            selectedProjects={selectedProjects}
            statusFilter={statusFilter}
            jqlFilter={jqlFilter}
            groupByField1={groupByField1}
            groupByField2={groupByField2}
            startDateField={startDateField}
            endDateField={endDateField}
            viewType={viewType}
            listFields={listFields}
            onProjectsChange={setSelectedProjects}
            onStatusFilterChange={setStatusFilter}
            onJqlFilterChange={setJqlFilter}
            onGroupByField1Change={setGroupByField1}
            onGroupByField2Change={setGroupByField2}
            onStartDateFieldChange={setStartDateField}
            onEndDateFieldChange={setEndDateField}
            onListFieldsChange={setListFields}
            onViewTypeChange={setViewType}
            orderByField={orderByField}
            orderByDir={orderByDir}
            onOrderByFieldChange={setOrderByField}
            onOrderByDirChange={setOrderByDir}
            eventsOnly={eventsOnly}
            onEventsOnlyChange={setEventsOnly}
            onSave={saveCurrentView}
            onClose={() => setShowConfig(false)}
            baselines={baselines}
            activeBaselineId={activeBaselineId}
            onCreateBaseline={createBaseline}
            onDeleteBaseline={deleteBaseline}
            onSetActiveBaseline={setActiveBaselineId}
            holidays={holidays}
            onSaveHolidays={saveHolidaysList}
          />
        )}
      </div>

      {showEventModal && (
        <EventModal
          event={editingEvent}
          groupByField1={groupByField1}
          groupByField2={groupByField2}
          groupByField1Label={groupByField1Label}
          groupByField2Label={groupByField2Label}
          groupOptions1={groupOptions1}
          groupOptions2={groupOptions2}
          initialStartDate={pendingCreate?.startDate}
          initialEndDate={pendingCreate?.endDate}
          initialGroup1Value={pendingCreate?.group1Value}
          initialGroup2Value={pendingCreate?.group2Value}
          onSave={saveEvent}
          onClose={closeEventModal}
        />
      )}
    </div>
  );
}

const styles = {
  root: {
    display: 'flex', flexDirection: 'column', height: '100vh',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
    fontSize: '13px', color: '#323338', background: '#f6f7fb',
  },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '0 16px',
    height: '56px', background: '#fff', borderBottom: '1px solid #e6e9ef',
    flexShrink: 0, flexWrap: 'wrap',
  },
  sidebarToggle: {
    background: 'none', border: '1px solid #e6e9ef', borderRadius: '6px',
    width: '32px', height: '32px', cursor: 'pointer', fontSize: '14px',
    color: '#676879', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  appTitle: { fontWeight: 800, fontSize: '15px', color: '#323338', letterSpacing: '-0.3px' },
  viewName: {
    fontSize: '13px', color: '#676879', fontWeight: 500,
    borderLeft: '1px solid #e6e9ef', paddingLeft: '10px',
    display: 'flex', alignItems: 'center', gap: '5px',
  },
  dirtyDot: { color: '#fdab3d', fontSize: '10px', lineHeight: 1 },
  navGroup: { display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' },
  navBtn: {
    background: 'none', border: '1px solid #e6e9ef', borderRadius: '6px',
    width: '30px', height: '30px', cursor: 'pointer', fontSize: '16px',
    color: '#323338', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  monthLabel: { fontWeight: 700, fontSize: '14px', minWidth: '150px', textAlign: 'center', color: '#323338' },
  todayBtn: {
    background: '#0073ea', color: '#fff', border: 'none', borderRadius: '6px',
    padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
    letterSpacing: '0.2px',
  },
  toolbarRight: { display: 'flex', alignItems: 'center', gap: '8px', marginLeft: 'auto' },
  addEventBtn: {
    background: '#0073ea', color: '#fff', border: 'none', borderRadius: '6px',
    padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 700,
    letterSpacing: '0.2px',
  },
  configBtn: {
    border: '1px solid #e6e9ef', borderRadius: '6px', padding: '5px 12px',
    cursor: 'pointer', fontSize: '12px', color: '#323338', fontWeight: 600,
    background: '#fff',
  },
  refreshBtn: {
    background: 'none', border: '1px solid #e6e9ef', borderRadius: '6px',
    width: '30px', height: '30px', cursor: 'pointer', fontSize: '16px', color: '#676879',
  },
  truncationBanner: {
    background: '#fff3c7', color: '#8a6800', padding: '6px 16px',
    display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px',
    flexShrink: 0, borderBottom: '1px solid #ffcb00',
  },
  layout: { flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' },
  content: { flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  errorBanner: {
    background: '#ffe1e1', color: '#bf2040', padding: '8px 16px',
    display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', flexShrink: 0,
  },
  retryBtn: {
    background: 'none', border: '1px solid currentColor', borderRadius: '6px',
    padding: '2px 8px', cursor: 'pointer', fontSize: '11px', color: 'inherit', marginLeft: 'auto',
  },
  loadingWrap: { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '14px' },
  spinner: {
    width: '28px', height: '28px', borderRadius: '50%',
    border: '3px solid #e6e9ef', borderTopColor: '#0073ea',
    animation: 'spin 0.8s linear infinite',
  },
  loadingText: { color: '#676879', margin: 0, fontSize: '13px', fontWeight: 500 },
};
