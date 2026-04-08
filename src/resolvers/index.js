import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { storage } from '@forge/kvs';

const resolver = new Resolver();

// ── Jira data ─────────────────────────────────────────────────────────────────

resolver.define('getIssues', async ({ payload }) => {
  const { jql, startAt = 0 } = payload;

  const fields = [
    'summary',
    'assignee',
    'status',
    'priority',
    'duedate',
    'customfield_10015', // Start date
    'labels',
    'issuetype',
    'project',
    'created',
    'updated',
  ].join(',');

  const response = await api
    .asApp()
    .requestJira(
      route`/rest/api/3/search?jql=${jql}&fields=${fields}&maxResults=100&startAt=${startAt}`
    );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jira API error ${response.status}: ${text}`);
  }

  return response.json();
});

resolver.define('getProjects', async () => {
  const response = await api
    .asApp()
    .requestJira(route`/rest/api/3/project/search?maxResults=100&orderBy=name`);

  if (!response.ok) {
    throw new Error(`Failed to fetch projects: ${response.status}`);
  }

  return response.json();
});

// ── Custom events (On-Call, Vacation, OOO, custom) ────────────────────────────

resolver.define('getCustomEvents', async () => {
  const events = await storage.get('custom_events');
  return events || [];
});

resolver.define('saveCustomEvent', async ({ payload }) => {
  const { event } = payload;
  const events = (await storage.get('custom_events')) || [];

  if (event.id) {
    // Update existing
    const idx = events.findIndex((e) => e.id === event.id);
    if (idx >= 0) {
      events[idx] = event;
    } else {
      events.push(event);
    }
  } else {
    // Create new — generate a simple unique id
    event.id = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    events.push(event);
  }

  await storage.set('custom_events', events);
  return event;
});

resolver.define('deleteCustomEvent', async ({ payload }) => {
  const { id } = payload;
  const events = (await storage.get('custom_events')) || [];
  const filtered = events.filter((e) => e.id !== id);
  await storage.set('custom_events', filtered);
  return { success: true };
});

// ── Saved views ───────────────────────────────────────────────────────────────

resolver.define('getViews', async () => {
  const views = await storage.get('gantt_views');
  if (!views || views.length === 0) {
    // Seed a default "Gantt" view on first load
    const defaultView = {
      id: 'default',
      name: 'Gantt',
      selectedProjects: ['DEM', 'PRIOR'],
      statusFilter: 'active',
      isDefault: true,
    };
    await storage.set('gantt_views', [defaultView]);
    return [defaultView];
  }
  return views;
});

resolver.define('saveView', async ({ payload }) => {
  const { view } = payload;
  const views = (await storage.get('gantt_views')) || [];

  if (view.id) {
    const idx = views.findIndex((v) => v.id === view.id);
    if (idx >= 0) {
      views[idx] = view;
    } else {
      views.push(view);
    }
  } else {
    view.id = `view-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    views.push(view);
  }

  await storage.set('gantt_views', views);
  return view;
});

resolver.define('deleteView', async ({ payload }) => {
  const { id } = payload;
  const views = (await storage.get('gantt_views')) || [];
  const filtered = views.filter((v) => v.id !== id);
  // Always keep at least one view
  if (filtered.length === 0) return { success: false, reason: 'Cannot delete the last view' };
  await storage.set('gantt_views', filtered);
  return { success: true };
});

// ── Folders ───────────────────────────────────────────────────────────────────

resolver.define('getFolders', async () => {
  const folders = await storage.get('gantt_folders');
  return folders || [];
});

resolver.define('saveFolder', async ({ payload }) => {
  const { folder } = payload;
  const folders = (await storage.get('gantt_folders')) || [];

  if (folder.id) {
    const idx = folders.findIndex((f) => f.id === folder.id);
    if (idx >= 0) {
      folders[idx] = folder;
    } else {
      folders.push(folder);
    }
  } else {
    folder.id = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    folders.push(folder);
  }

  await storage.set('gantt_folders', folders);
  return folder;
});

resolver.define('deleteFolder', async ({ payload }) => {
  const { id } = payload;
  const folders = (await storage.get('gantt_folders')) || [];
  const filtered = folders.filter((f) => f.id !== id);
  await storage.set('gantt_folders', filtered);
  return { success: true };
});

// ── Demo seed ─────────────────────────────────────────────────────────────────

resolver.define('seedDemoData', async () => {
  const folderId = 'folder-priorizacion';

  // Folder
  await storage.set('gantt_folders', [
    { id: folderId, name: 'Priorización' },
  ]);

  // Views — Gantt (timeline) + On Call (list) + Vacations (list)
  await storage.set('gantt_views', [
    {
      id: 'view-gantt',
      name: 'Gantt',
      folderId,
      viewType: 'timeline',
      selectedProjects: ['DEM', 'PRIOR'],
      statusFilter: 'active',
      groupByField1: 'labels',
      groupByField2: 'assignee',
      startDateField: 'customfield_10015',
      endDateField: 'duedate',
      isDefault: true,
    },
    {
      id: 'view-oncall',
      name: 'On Call',
      folderId,
      viewType: 'list',
      selectedProjects: ['DEM', 'PRIOR'],
      statusFilter: 'active',
      groupByField1: 'labels',
      groupByField2: 'assignee',
      startDateField: 'customfield_10015',
      endDateField: 'duedate',
      listFields: ['summary', 'assignee', 'labels', 'customfield_10015', 'duedate'],
      isDefault: false,
    },
    {
      id: 'view-vacations',
      name: 'Vacations',
      folderId,
      viewType: 'list',
      selectedProjects: ['DEM', 'PRIOR'],
      statusFilter: 'active',
      groupByField1: 'labels',
      groupByField2: 'assignee',
      startDateField: 'customfield_10015',
      endDateField: 'duedate',
      listFields: ['summary', 'assignee', 'labels', 'customfield_10015', 'duedate'],
      isDefault: false,
    },
  ]);

  // Custom events — Cards squad
  const events = [
    // On-Call
    { id: 'evt-seed-1',  type: 'oncall',   title: 'On-Call',   summary: '', folderId, groupValues: { labels: 'Cards', assignee: 'Juan David Canal Vera' },   startDate: '2026-04-06', endDate: '2026-04-10' },
    { id: 'evt-seed-2',  type: 'oncall',   title: 'On-Call',   summary: '', folderId, groupValues: { labels: 'Cards', assignee: 'William Hung' },              startDate: '2026-04-13', endDate: '2026-04-17' },
    { id: 'evt-seed-3',  type: 'oncall',   title: 'On-Call',   summary: '', folderId, groupValues: { labels: 'APMs',  assignee: 'Dani Perea' },                startDate: '2026-04-20', endDate: '2026-04-24' },
    { id: 'evt-seed-4',  type: 'oncall',   title: 'On-Call',   summary: '', folderId, groupValues: { labels: 'APMs',  assignee: 'Ever Daniel Rivera (Ludu)' }, startDate: '2026-04-27', endDate: '2026-05-01' },
    // Vacation
    { id: 'evt-seed-5',  type: 'vacation', title: 'Vacation',  summary: '', folderId, groupValues: { labels: 'Cards', assignee: 'Daniel Betancurth (Beta)' },  startDate: '2026-04-14', endDate: '2026-04-25' },
    { id: 'evt-seed-6',  type: 'vacation', title: 'Vacation',  summary: '', folderId, groupValues: { labels: 'Cards', assignee: 'Juan David Canal Vera' },     startDate: '2026-04-21', endDate: '2026-05-02' },
    { id: 'evt-seed-7',  type: 'vacation', title: 'Vacation',  summary: '', folderId, groupValues: { labels: 'Cards', assignee: 'William Hung' },              startDate: '2026-04-28', endDate: '2026-05-09' },
    // OOO
    { id: 'evt-seed-8',  type: 'ooo',      title: 'OOO',       summary: '', folderId, groupValues: { labels: 'Cards', assignee: 'William Hung' },              startDate: '2026-05-04', endDate: '2026-05-08' },
    { id: 'evt-seed-9',  type: 'ooo',      title: 'OOO',       summary: '', folderId, groupValues: { labels: 'APMs',  assignee: 'Dani Perea' },                startDate: '2026-04-07', endDate: '2026-04-11' },
    { id: 'evt-seed-10', type: 'ooo',      title: 'OOO',       summary: '', folderId, groupValues: { labels: 'APMs',  assignee: 'Denys Coste' },               startDate: '2026-04-21', endDate: '2026-04-30' },
    // Custom
    { id: 'evt-seed-11', type: 'custom',   title: 'AI JP Project', summary: '2 weeks', folderId, groupValues: { labels: 'Cards', assignee: 'Daniel Betancurth (Beta)' }, startDate: '2026-04-01', endDate: '2026-04-14' },
  ];

  await storage.set('custom_events', events);
  return { success: true, folders: 1, views: 3, events: events.length };
});

export const handler = resolver.getDefinitions();
