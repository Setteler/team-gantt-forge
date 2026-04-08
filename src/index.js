import Resolver from '@forge/resolver';
import api, { route } from '@forge/api';
import { kvs as storage } from '@forge/kvs';

const resolver = new Resolver();

// ── Jira issues ───────────────────────────────────────────────────────────────

resolver.define('getIssues', async ({ payload }) => {
  const { jql, nextPageToken, extraFields = [] } = payload;

  const baseFields = [
    'summary', 'assignee', 'status', 'priority', 'duedate',
    'customfield_10015', 'labels', 'issuetype', 'project', 'resolution', 'reporter',
  ];
  const allFields = [...new Set([...baseFields, ...extraFields])].join(',');

  const url = nextPageToken
    ? route`/rest/api/3/search/jql?jql=${jql}&fields=${allFields}&maxResults=100&nextPageToken=${nextPageToken}`
    : route`/rest/api/3/search/jql?jql=${jql}&fields=${allFields}&maxResults=100`;

  const response = await api.asUser().requestJira(url);

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Jira API error ${response.status}: ${text}`);
  }

  return response.json();
});

resolver.define('getProjects', async () => {
  const response = await api.asApp().requestJira(
    route`/rest/api/3/project/search?maxResults=100&orderBy=name`
  );
  if (!response.ok) throw new Error(`Failed to fetch projects: ${response.status}`);
  return response.json();
});

resolver.define('getFields', async () => {
  const response = await api.asApp().requestJira(route`/rest/api/3/field`);
  if (!response.ok) return [];
  const fields = await response.json();

  const SKIP_IDS = new Set([
    'description', 'comment', 'attachment', 'worklog', 'timetracking',
    'thumbnail', 'watches', 'votes', 'subtasks', 'issuelinks', 'parent',
    'timespent', 'timeestimate', 'aggregatetimespent', 'aggregatetimeestimate',
    'aggregatetimeoriginalestimate', 'timeoriginalestimate', 'workratio',
    'environment', 'security', 'progress', 'aggregateprogress',
  ]);

  const USEFUL_TYPES = new Set([
    'user', 'option', 'option-with-child', 'array', 'string', 'number',
    'project', 'issuetype', 'status', 'priority', 'resolution',
    'team', 'version', 'component', 'date', 'datetime',
  ]);

  return fields
    .filter(f =>
      f.schema &&
      !SKIP_IDS.has(f.id) &&
      !f.id.startsWith('__') &&
      USEFUL_TYPES.has(f.schema.type)
    )
    .map(f => ({ id: f.id, name: f.name, custom: f.custom || false, schemaType: f.schema.type }))
    .sort((a, b) => {
      if (a.custom !== b.custom) return a.custom ? 1 : -1;
      return a.name.localeCompare(b.name);
    });
});

resolver.define('updateIssueDates', async ({ payload }) => {
  const { key, startDate, dueDate, startDateField = 'customfield_10015', endDateField = 'duedate' } = payload;
  const fields = {};
  if (startDate !== undefined) fields[startDateField] = startDate || null;
  if (dueDate   !== undefined) fields[endDateField]   = dueDate   || null;

  const response = await api.asApp().requestJira(route`/rest/api/3/issue/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });

  return { success: response.ok };
});

// ── Custom events ─────────────────────────────────────────────────────────────
// Events are scoped: folder views share 'custom_events_folder_<folderId>',
// standalone views use 'custom_events_view_<viewId>'.
// The frontend passes folderId (and viewId for standalone) on every event.

function eventsKey(event) {
  return event.folderId
    ? `custom_events_folder_${event.folderId}`
    : `custom_events_view_${event.viewId}`;
}

resolver.define('getCustomEvents', async ({ payload }) => {
  const { viewId, folderId } = payload || {};
  const key = folderId
    ? `custom_events_folder_${folderId}`
    : `custom_events_view_${viewId}`;
  return (await storage.get(key)) || [];
});

resolver.define('saveCustomEvent', async ({ payload }) => {
  const { event } = payload;
  const key = eventsKey(event);
  const events = (await storage.get(key)) || [];
  if (event.id) {
    const idx = events.findIndex(e => e.id === event.id);
    if (idx >= 0) events[idx] = event; else events.push(event);
  } else {
    event.id = `evt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    events.push(event);
  }
  await storage.set(key, events);
  return event;
});

resolver.define('migrateViewEvents', async ({ payload }) => {
  const { viewId, fromFolderId, toFolderId } = payload;
  const fromKey = fromFolderId ? `custom_events_folder_${fromFolderId}` : `custom_events_view_${viewId}`;
  const toKey   = toFolderId   ? `custom_events_folder_${toFolderId}`   : `custom_events_view_${viewId}`;
  if (fromKey === toKey) return { success: true };

  // Move events that belong to this view from the old key to the new key
  const fromEvents = (await storage.get(fromKey)) || [];
  const viewEvents = fromFolderId
    ? fromEvents.filter(e => e.viewId === viewId)
    : fromEvents; // standalone key only has this view's events

  if (viewEvents.length === 0) return { success: true };

  // Remove from source (for folder keys, keep other views' events)
  if (fromFolderId) {
    await storage.set(fromKey, fromEvents.filter(e => e.viewId !== viewId));
  } else {
    await storage.set(fromKey, []);
  }

  // Update folderId on migrated events and merge into destination
  const updated = viewEvents.map(e => ({ ...e, folderId: toFolderId || null }));
  const toEvents = (await storage.get(toKey)) || [];
  // Merge: replace any existing events with same id, append new ones
  const merged = [...toEvents];
  for (const ev of updated) {
    const idx = merged.findIndex(e => e.id === ev.id);
    if (idx >= 0) merged[idx] = ev; else merged.push(ev);
  }
  await storage.set(toKey, merged);
  return { success: true };
});

resolver.define('deleteCustomEvent', async ({ payload }) => {
  const { id, viewId, folderId } = payload;
  const key = folderId
    ? `custom_events_folder_${folderId}`
    : `custom_events_view_${viewId}`;
  const events = (await storage.get(key)) || [];
  await storage.set(key, events.filter(e => e.id !== id));
  return { success: true };
});

// ── Views ─────────────────────────────────────────────────────────────────────

resolver.define('getViews', async () => {
  const views = await storage.get('gantt_views');
  if (!views || views.length === 0) {
    const def = {
      id: 'default', name: 'Gantt',
      selectedProjects: [], statusFilter: 'active',
      groupByField1: 'labels', groupByField2: 'assignee',
      jqlFilter: '', folderId: null, isDefault: true,
    };
    await storage.set('gantt_views', [def]);
    return [def];
  }
  return views.map(v => ({
    folderId: null, groupByField1: 'labels', groupByField2: 'assignee', jqlFilter: '',
    // back-compat: convert old groupBy string
    ...convertOldGroupBy(v),
    ...v,
  }));
});

function convertOldGroupBy(view) {
  if (view.groupByField1) return {};
  const MAP = {
    labels_assignee:    { groupByField1: 'labels',    groupByField2: 'assignee' },
    project_assignee:   { groupByField1: 'project',   groupByField2: 'assignee' },
    issuetype_assignee: { groupByField1: 'issuetype', groupByField2: 'assignee' },
    status_assignee:    { groupByField1: 'status',    groupByField2: 'assignee' },
    assignee_project:   { groupByField1: 'assignee',  groupByField2: 'project'  },
  };
  return MAP[view.groupBy] || { groupByField1: 'labels', groupByField2: 'assignee' };
}

resolver.define('saveView', async ({ payload }) => {
  const { view } = payload;
  const views = (await storage.get('gantt_views')) || [];
  if (view.id) {
    const idx = views.findIndex(v => v.id === view.id);
    if (idx >= 0) views[idx] = view; else views.push(view);
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
  const filtered = views.filter(v => v.id !== id);
  if (filtered.length === 0) return { success: false, reason: 'Cannot delete the last view' };
  await storage.set('gantt_views', filtered);
  return { success: true };
});

// ── Folders ───────────────────────────────────────────────────────────────────

resolver.define('getFolders', async () => {
  return (await storage.get('gantt_folders')) || [];
});

resolver.define('saveFolder', async ({ payload }) => {
  const { folder } = payload;
  const folders = (await storage.get('gantt_folders')) || [];
  if (folder.id) {
    const idx = folders.findIndex(f => f.id === folder.id);
    if (idx >= 0) folders[idx] = folder; else folders.push(folder);
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
  await storage.set('gantt_folders', folders.filter(f => f.id !== id));
  const views = (await storage.get('gantt_views')) || [];
  await storage.set('gantt_views', views.map(v => v.folderId === id ? { ...v, folderId: null } : v));
  return { success: true };
});

export const handler = resolver.getDefinitions();
