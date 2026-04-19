import React, { useState, useEffect, useCallback, useRef } from 'react';
import { invoke, view as forgeView } from '@forge/bridge';
import GanttChart from './components/GanttChart';
import ListView from './components/ListView';
// TreeView and RoadmapView are not imported — those view types have been
// consolidated into the 3 remaining types (Gantt, List, Project).
// The component files are kept in the codebase for potential future re-use.
import ProjectView from './components/ProjectView';
import ViewSidebar from './components/ViewSidebar';
import TeamsModule from './components/TeamsModule';
import RisksModule from './components/RisksModule';
import ObjectivesModule from './components/ObjectivesModule';
import ResourcesModule from './components/ResourcesModule';
import ReportsModule from './components/ReportsModule';
import EventModal from './components/EventModal';
import ConfigPanel from './components/ConfigPanel';
import { getFieldValue } from './utils';
import GadgetMode from './components/GadgetMode';

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
  // Detect if we're running as a dashboard gadget
  const [isGadget, setIsGadget] = useState(null); // null = checking, true/false = resolved
  useEffect(() => {
    forgeView.getContext().then(ctx => {
      const type = ctx?.extension?.type;
      setIsGadget(type === 'jira:dashboardGadget');
    }).catch(() => setIsGadget(false));
  }, []);

  // If gadget mode, delegate to GadgetMode component entirely
  if (isGadget === null) return null; // still checking context
  if (isGadget) return <GadgetMode />;

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
  const [showShareDialog, setShowShareDialog] = useState(false);

  // ── Baselines ──────────────────────────────────────────────────────────────
  const [baselines, setBaselines]             = useState([]);
  const [activeBaselineId, setActiveBaselineId] = useState(null);

  // ── Holidays (global) ─────────────────────────────────────────────────────
  const [holidays, setHolidays] = useState([]);

  // ── Modules ───────────────────────────────────────────────────────────────
  const [activeModuleId, setActiveModuleId] = useState(null);
  const [enabledModuleIds, setEnabledModuleIds] = useState([]);
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
      invoke('getEnabledModules'),
    ]).then(([viewsData, projectsData, foldersData, fieldsData, holidaysData, teamsData, risksData, objectivesData, enabledModulesData]) => {
      setHolidays(holidaysData || []);
      setTeams(teamsData || []);
      setRisks(risksData || []);
      setObjectives(objectivesData || []);
      setEnabledModuleIds(enabledModulesData || []);
      const loadedViews = viewsData || [];
      setViews(loadedViews);
      setFolders(foldersData || []);
      setAvailableFields(fieldsData || []);

      const projects = (projectsData.values || []).map(p => ({ key: p.key, name: p.name }));
      setAvailableProjects(projects);

      // Check URL hash for a persisted view ID, then fall back to default view
      const hashViewId = window.location.hash?.slice(1);
      const hashView = hashViewId ? loadedViews.find(v => v.id === hashViewId) : null;
      const active = hashView || loadedViews.find(v => v.isDefault) || loadedViews[0];
      if (active) {
        applyView(active);
        window.location.hash = '#' + active.id;
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

  // ── Resolve folder-scoped JQL ──────────────────────────────────────────────
  // Direct lookup: if the view belongs to a folder, return that folder's defaultJql.
  function resolveFolderJql(view, allFolders) {
    if (!view?.folderId) return '';
    const folder = allFolders.find(f => f.id === view.folderId);
    return folder?.defaultJql?.trim() || '';
  }

  // ── Fetch issues ──────────────────────────────────────────────────────────
  const fetchIssues = useCallback(async () => {
    if (eventsOnly) {
      setIssues([]);
      setLoading(false);
      return;
    }
    const customJql = jqlFilter.trim();

    // Fallback: if view has no JQL and no projects, try inheriting from folder
    let effectiveJql = customJql;
    if (!effectiveJql && selectedProjects.length === 0) {
      const currentView = views.find(v => v.id === activeViewId);
      effectiveJql = resolveFolderJql(currentView, folders);
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
        // effectiveJql is either the view's own jqlFilter or inherited from its folder
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
    // Also trigger fetch if a folder provides JQL
    const currentView = views.find(v => v.id === activeViewId);
    const folderJql = resolveFolderJql(currentView, folders);
    if (selectedProjects.length > 0 || customJql || folderJql) fetchIssues();
    else {
      // No data source → clear stale issues from the previous view
      setIssues([]);
      setLoading(false);
    }
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
    // Persist active view in URL hash for reload persistence
    window.location.hash = '#' + viewId;
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

  // ── Set default view ──────────────────────────────────────────────────────
  async function setDefaultView(viewId) {
    const updatedViews = views.map(v => ({ ...v, isDefault: v.id === viewId }));
    // Save only views whose isDefault actually changed
    for (const v of updatedViews) {
      if (v.isDefault !== views.find(old => old.id === v.id)?.isDefault) {
        await invoke('saveView', { view: v });
      }
    }
    setViews(updatedViews);
  }

  // ── Folder management ──────────────────────────────────────────────────────
  async function createFolder(name) {
    const saved = await invoke('saveFolder', { folder: { name } });
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
    setFolders(prev => prev.filter(f => f.id !== folderId));
    setViews(prev => prev.map(v => v.folderId === folderId ? { ...v, folderId: null } : v));
  }

  // ── Save folder configuration (name, description, defaultJql) ──────────────
  async function handleSaveFolder(updatedFolder) {
    const saved = await invoke('saveFolder', { folder: updatedFolder });
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
    // Defensive: ignore if module is not enabled
    if (moduleId && !enabledModuleIds.includes(moduleId)) return;
    setActiveModuleId(moduleId || null);
    if (moduleId) {
      setShowConfig(false);
    }
  }

  async function handleSaveEnabledModules(ids) {
    const saved = await invoke('saveEnabledModules', { moduleIds: ids });
    setEnabledModuleIds(saved || []);
    // If the currently active module was removed, clear selection
    if (activeModuleId && !(saved || []).includes(activeModuleId)) {
      setActiveModuleId(null);
    }
    return saved;
  }

  // ── Share dialog ───────────────────────────────────────────────────────────
  const [shareBaseUrl, setShareBaseUrl] = useState('');

  useEffect(() => {
    async function resolveUrl() {
      try {
        const ctx = await forgeView.getContext();
        const siteUrl = ctx?.siteUrl || '';
        const parts = window.location.pathname.split('/').filter(Boolean);
        if (siteUrl && parts.length >= 2 && parts[0].includes('-') && parts[1].includes('-')) {
          setShareBaseUrl(`${siteUrl}/jira/apps/${parts[0]}/${parts[1]}`);
          return;
        }
      } catch {}
      try {
        const parts = window.location.pathname.split('/').filter(Boolean);
        if (parts.length >= 2 && parts[0].includes('-') && parts[1].includes('-')) {
          const origin = document.referrer ? new URL(document.referrer).origin
            : window.location.ancestorOrigins?.[0] || '';
          if (origin) { setShareBaseUrl(`${origin}/jira/apps/${parts[0]}/${parts[1]}`); return; }
        }
      } catch {}
      try { setShareBaseUrl(window.parent.location.href.split('#')[0]); } catch {}
    }
    resolveUrl();
  }, []);

  // Include the current view ID in the share URL so it deep-links
  const shareUrl = shareBaseUrl ? `${shareBaseUrl}#${activeViewId}` : '';

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
            <span style={{
              width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, display: 'inline-block',
              background: viewType === 'list' ? '#00854d' : viewType === 'project' ? '#00B8D9' : '#0073ea',
            }} />
            {activeView.name}
            {isDirty && <span style={styles.dirtyDot} title="Unsaved changes">●</span>}
          </span>
        )}

        {/* Show timeline nav for Gantt, Project, and legacy types that fall back to Gantt */}
        {viewType !== 'list' && !activeModuleId && (
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
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <button
              style={styles.shareLinkBtn}
              onClick={() => setShowShareDialog(true)}
              title="Share this view"
            >Share</button>
          </div>
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
          {/* Critical Path toggle removed — re-add when users have Blocks links */}
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
            onSaveFolder={handleSaveFolder}
            activeModuleId={activeModuleId}
            onSelectModule={handleSelectModule}
            enabledModuleIds={enabledModuleIds}
            onSaveEnabledModules={handleSaveEnabledModules}
            availableFields={availableFields}
            availableProjects={availableProjects}
            onSetDefaultView={setDefaultView}
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
          ) : viewType === 'project' ? (
            <ProjectView
              issues={issues}
              today={today}
              startDateField={startDateField}
              endDateField={endDateField}
              onUpdateIssue={updateIssueDates}
              holidays={holidays}
              scrollToTarget={scrollTarget}
              onVisibleMonthChange={(y, m) => { setVisYear(y); setVisMonth(m); }}
            />
          ) : (
            /* Fallback: timeline/gantt view. Also handles legacy 'tree' and 'roadmap'
               view types — they render as Gantt until the user switches their type. */
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

      {/* ── Share dialog ── */}
      {showShareDialog && (
        <div style={shareStyles.overlay} onClick={() => setShowShareDialog(false)}>
          <div style={shareStyles.modal} onClick={e => e.stopPropagation()}>
            <div style={shareStyles.header}>
              <span style={shareStyles.title}>Share this view</span>
              <button style={shareStyles.close} onClick={() => setShowShareDialog(false)}>✕</button>
            </div>
            <div style={shareStyles.body}>
              <p style={shareStyles.desc}>
                Anyone with access to this Jira site can open this link to view <b>{activeView?.name || 'this view'}</b>.
              </p>
              <div style={shareStyles.urlRow}>
                <input
                  readOnly
                  value={shareUrl}
                  style={shareStyles.urlInput}
                  onFocus={e => e.target.select()}
                />
                <button
                  style={shareStyles.copyBtn}
                  onClick={(e) => {
                    const url = shareUrl;
                    // Forge iframe clipboard fallback: select hidden input + execCommand
                    try { navigator.clipboard.writeText(url); } catch {}
                    const inp = e.currentTarget.previousSibling;
                    inp.select();
                    document.execCommand('copy');
                    e.currentTarget.textContent = 'Copied!';
                    setTimeout(() => { e.currentTarget.textContent = 'Copy'; }, 2000);
                  }}
                >Copy</button>
              </div>
              <p style={shareStyles.hint}>Tip: set a view as the ★ default so others land on it when they open the link.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const shareStyles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(9,30,66,0.54)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
  },
  modal: {
    background: '#fff', borderRadius: '8px', width: '440px', maxWidth: '90vw',
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderBottom: '1px solid #DFE1E6',
  },
  title: { fontWeight: 700, fontSize: '16px', color: '#172B4D' },
  close: {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px',
    color: '#6B778C', width: '28px', height: '28px', display: 'flex',
    alignItems: 'center', justifyContent: 'center', borderRadius: '4px',
  },
  body: { padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' },
  desc: { fontSize: '13px', color: '#42526E', margin: 0, lineHeight: 1.5 },
  urlRow: { display: 'flex', gap: '8px' },
  urlInput: {
    flex: 1, border: '1px solid #DFE1E6', borderRadius: '4px', padding: '8px 10px',
    fontSize: '12px', color: '#172B4D', fontFamily: 'monospace', background: '#F4F5F7',
    outline: 'none',
  },
  copyBtn: {
    background: '#0052CC', color: '#fff', border: 'none', borderRadius: '4px',
    padding: '8px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
    flexShrink: 0, minWidth: '70px',
  },
  hint: { fontSize: '11px', color: '#97A0AF', margin: 0, fontStyle: 'italic' },
};

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
  shareLinkBtn: {
    background: 'none', border: '1px solid #e6e9ef', borderRadius: '6px',
    padding: '5px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
    color: '#676879',
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
