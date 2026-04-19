import React, { useState, useCallback, useRef, useEffect } from 'react';

function TimelineIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1" y="2.5" width="7" height="2" rx="1" fill={color} opacity="0.85"/>
      <rect x="4" y="6" width="8" height="2" rx="1" fill={color} opacity="0.85"/>
      <rect x="2" y="9.5" width="5" height="2" rx="1" fill={color} opacity="0.85"/>
    </svg>
  );
}

function ListIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1" y="2.5" width="2" height="2" rx="0.5" fill={color} opacity="0.7"/>
      <rect x="4.5" y="2.5" width="8.5" height="2" rx="1" fill={color} opacity="0.85"/>
      <rect x="1" y="6" width="2" height="2" rx="0.5" fill={color} opacity="0.7"/>
      <rect x="4.5" y="6" width="8.5" height="2" rx="1" fill={color} opacity="0.85"/>
      <rect x="1" y="9.5" width="2" height="2" rx="0.5" fill={color} opacity="0.7"/>
      <rect x="4.5" y="9.5" width="8.5" height="2" rx="1" fill={color} opacity="0.85"/>
    </svg>
  );
}

function TreeIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1" y="2" width="9" height="2" rx="1" fill={color} opacity="0.85"/>
      <rect x="3.5" y="6" width="8" height="2" rx="1" fill={color} opacity="0.7"/>
      <rect x="6" y="10" width="6.5" height="2" rx="1" fill={color} opacity="0.55"/>
    </svg>
  );
}

function RoadmapIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      <rect x="1" y="2" width="12" height="2" rx="1" fill={color} opacity="0.35"/>
      <rect x="1" y="6" width="12" height="2" rx="1" fill={color} opacity="0.35"/>
      <rect x="1" y="10" width="12" height="2" rx="1" fill={color} opacity="0.35"/>
      <rect x="2" y="2.5" width="5" height="1.2" rx="0.6" fill={color} opacity="0.9"/>
      <rect x="4" y="6.5" width="7" height="1.2" rx="0.6" fill={color} opacity="0.9"/>
      <rect x="1.5" y="10.5" width="4" height="1.2" rx="0.6" fill={color} opacity="0.9"/>
    </svg>
  );
}

function ProjectIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
      {/* Tree hierarchy lines on left */}
      <rect x="1" y="2" width="4" height="1.5" rx="0.75" fill={color} opacity="0.85"/>
      <rect x="2.5" y="5.5" width="3.5" height="1.5" rx="0.75" fill={color} opacity="0.65"/>
      <rect x="2.5" y="9" width="3.5" height="1.5" rx="0.75" fill={color} opacity="0.65"/>
      <rect x="1" y="12" width="4" height="1.5" rx="0.75" fill={color} opacity="0.85"/>
      {/* Gantt bars on right */}
      <rect x="7" y="2" width="5" height="1.5" rx="0.75" fill={color} opacity="0.9"/>
      <rect x="8" y="5.5" width="5" height="1.5" rx="0.75" fill={color} opacity="0.7"/>
      <rect x="7.5" y="9" width="4" height="1.5" rx="0.75" fill={color} opacity="0.7"/>
      <rect x="7" y="12" width="6" height="1.5" rx="0.75" fill={color} opacity="0.9"/>
      {/* Vertical connector on left side */}
      <rect x="1.5" y="3.5" width="0.8" height="2" fill={color} opacity="0.4"/>
      <rect x="1.5" y="7" width="0.8" height="2" fill={color} opacity="0.4"/>
    </svg>
  );
}

const VIEW_TYPE_META = {
  timeline: { label: 'Gantt',    Icon: TimelineIcon, color: '#0073ea' },
  list:     { label: 'List',     Icon: ListIcon,     color: '#00854d' },
  tree:     { label: 'Tree',     Icon: TreeIcon,     color: '#FF8B00' },
  roadmap:  { label: 'Roadmap',  Icon: RoadmapIcon,  color: '#6554C0' },
  project:  { label: 'Project',  Icon: ProjectIcon,  color: '#00B8D9' },
};

const MODULES = [
  { id: 'teams', label: 'Teams', icon: '\uD83D\uDC65', description: 'Manage teams and member capacity' },
  { id: 'risks', label: 'Risks', icon: '\u26A0\uFE0F', description: 'Track risks with probability/impact matrix' },
  { id: 'objectives', label: 'Objectives', icon: '\uD83C\uDFAF', description: 'OKRs with auto-progress from Jira' },
  { id: 'resources', label: 'Resources', icon: '\uD83D\uDCCA', description: 'Capacity heatmap across weeks' },
  { id: 'reports', label: 'Reports', icon: '\uD83D\uDCC8', description: 'Burndown, throughput, status charts' },
];

export default function ViewSidebar({
  views, folders, activeViewId,
  onSwitch, onCreate, onRename, onDelete,
  onMoveToFolder, onCreateFolder, onRenameFolder, onDeleteFolder,
  onSaveFolder,
  activeModuleId, onSelectModule,
  enabledModuleIds = [], onSaveEnabledModules,
}) {
  const [creatingNew, setCreatingNew] = useState(false);
  const [newViewName, setNewViewName] = useState('');
  const [newViewFolderId, setNewViewFolderId] = useState(null);
  const [newViewType, setNewViewType] = useState('timeline');
  const [renamingViewId, setRenamingViewId] = useState(null);
  const [renameViewValue, setRenameViewValue] = useState('');
  const [hoveredViewId, setHoveredViewId] = useState(null);

  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');
  const [hoveredFolderId, setHoveredFolderId] = useState(null);
  const [collapsedFolders, setCollapsedFolders] = useState(new Set());

  // Module picker state
  const [showModulePicker, setShowModulePicker] = useState(false);
  const [hoveredModuleId, setHoveredModuleId] = useState(null);
  const modulePickerRef = useRef(null);

  // Close module picker on outside click or Escape
  useEffect(() => {
    if (!showModulePicker) return;
    function handleClick(e) {
      if (modulePickerRef.current && !modulePickerRef.current.contains(e.target)) {
        setShowModulePicker(false);
      }
    }
    function handleKey(e) {
      if (e.key === 'Escape') setShowModulePicker(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showModulePicker]);

  // Folder config modal state
  const [configFolderId, setConfigFolderId] = useState(null);

  // View drag-and-drop state
  const [draggingViewId, setDraggingViewId] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null); // folderId or 'root'

  async function handleCreateView() {
    const name = newViewName.trim();
    if (!name) return;
    await onCreate(name, newViewFolderId, newViewType);
    setCreatingNew(false);
    setNewViewName('');
    setNewViewFolderId(null);
    setNewViewType('timeline');
  }

  async function handleRenameView(viewId) {
    const name = renameViewValue.trim();
    if (!name) { setRenamingViewId(null); return; }
    await onRename(viewId, name);
    setRenamingViewId(null);
  }

  async function handleRenameFolder(folderId) {
    const name = renameFolderValue.trim();
    if (!name) { setRenamingFolderId(null); return; }
    await onRenameFolder(folderId, name);
    setRenamingFolderId(null);
  }

  async function handleCreateFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    await onCreateFolder(name);
    setCreatingFolder(false);
    setNewFolderName('');
  }

  function toggleFolder(folderId) {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
  }

  // ── View Drag handlers ────────────────────────────────────────────────────
  function handleDragStart(e, viewId) {
    setDraggingViewId(viewId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `view:${viewId}`);
  }

  function handleDragEnd() {
    setDraggingViewId(null);
    setDragOverTarget(null);
  }

  function handleDragOverFolder(e, folderId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggingViewId) {
      setDragOverTarget(folderId);
    }
  }

  function handleDragOverRoot(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggingViewId) {
      setDragOverTarget('root');
    }
  }

  function handleDropOnFolder(e, folderId) {
    e.preventDefault();
    e.stopPropagation();
    if (draggingViewId) {
      onMoveToFolder(draggingViewId, folderId);
    }
    setDraggingViewId(null);
    setDragOverTarget(null);
  }

  function handleDropOnRoot(e) {
    e.preventDefault();
    if (draggingViewId) onMoveToFolder(draggingViewId, null);
    setDraggingViewId(null);
    setDragOverTarget(null);
  }

  // ── Flat Folder Renderer ──────────────────────────────────────────────────
  function renderFolders() {
    return folders.map(folder => {
      const folderViews = views.filter(v => v.folderId === folder.id);
      const isCollapsed = collapsedFolders.has(folder.id);
      const isRenamingFolder = renamingFolderId === folder.id;
      const isDragTarget = dragOverTarget === folder.id;
      const isConfigOpen = configFolderId === folder.id;

      return (
        <div
          key={folder.id}
          onDragOver={(e) => handleDragOverFolder(e, folder.id)}
          onDrop={(e) => handleDropOnFolder(e, folder.id)}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              if (dragOverTarget === folder.id) setDragOverTarget(null);
            }
          }}
        >
          {/* Folder row */}
          <div
            style={{
              ...styles.folderRow,
              background: isDragTarget ? '#E3FCEF' : hoveredFolderId === folder.id ? '#F4F5F7' : 'transparent',
              outline: isDragTarget ? '2px dashed #00875A' : 'none',
              outlineOffset: '-2px',
              borderRadius: '4px',
            }}
            onMouseEnter={() => setHoveredFolderId(folder.id)}
            onMouseLeave={() => setHoveredFolderId(null)}
            onClick={() => !isRenamingFolder && toggleFolder(folder.id)}
          >
            <span style={styles.folderIcon}>{isCollapsed ? '\u25B8' : '\u25BE'}</span>
            <span style={{ fontSize: '12px', flexShrink: 0 }}>{'\uD83D\uDCC1'}</span>
            {isRenamingFolder ? (
              <input
                autoFocus
                style={{ ...styles.renameInput, flex: 1 }}
                value={renameFolderValue}
                onChange={(e) => setRenameFolderValue(e.target.value)}
                onBlur={() => handleRenameFolder(folder.id)}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameFolder(folder.id);
                  if (e.key === 'Escape') setRenamingFolderId(null);
                }}
              />
            ) : (
              <span style={styles.folderName}>{folder.name}</span>
            )}
            {/* Filter indicator */}
            {folder.defaultJql && folder.defaultJql.trim() && !isRenamingFolder && (
              <span style={{ fontSize: '10px', color: '#6B778C', opacity: 0.7 }} title="Has default filter">{'\uD83D\uDD0D'}</span>
            )}
            {hoveredFolderId === folder.id && !isRenamingFolder && (
              <div style={styles.viewActions} onClick={e => e.stopPropagation()}>
                <button style={styles.actionBtn} title="Settings" onClick={() => setConfigFolderId(configFolderId === folder.id ? null : folder.id)}>{'\u2699'}</button>
                <button style={styles.actionBtn} title="Rename" onClick={() => { setRenamingFolderId(folder.id); setRenameFolderValue(folder.name); }}>{'\u270F'}</button>
                <button
                  style={{ ...styles.actionBtn, color: '#DE350B' }}
                  title="Delete"
                  onClick={() => {
                    if (window.confirm(`Delete folder "${folder.name}"? Views inside will move to root.`)) {
                      onDeleteFolder(folder.id);
                    }
                  }}
                >{'\uD83D\uDDD1'}</button>
              </div>
            )}
          </div>

          {/* Folder config modal (inline) */}
          {isConfigOpen && (
            <FolderConfigModal
              folder={folder}
              onSave={(updated) => {
                if (onSaveFolder) onSaveFolder(updated);
                setConfigFolderId(null);
              }}
              onClose={() => setConfigFolderId(null)}
            />
          )}

          {/* Views inside folder */}
          {!isCollapsed && (
            <>
              {folderViews.map(v => (
                <ViewRow
                  key={v.id}
                  view={v}
                  isActive={v.id === activeViewId}
                  isRenaming={renamingViewId === v.id}
                  renameValue={renameViewValue}
                  hovered={hoveredViewId === v.id}
                  depth={1}
                  canDelete={views.length > 1}
                  isDragging={draggingViewId === v.id}
                  onHover={setHoveredViewId}
                  onSwitch={onSwitch}
                  onStartRename={() => { setRenamingViewId(v.id); setRenameViewValue(v.name); }}
                  onRenameChange={setRenameViewValue}
                  onRenameConfirm={() => handleRenameView(v.id)}
                  onRenameCancel={() => setRenamingViewId(null)}
                  onDelete={onDelete}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                />
              ))}
              <button
                style={{ ...styles.createViewBtn, paddingLeft: '28px', fontSize: '11px' }}
                onClick={() => { setNewViewFolderId(folder.id); setCreatingNew(true); }}
              >
                + Add view
              </button>
            </>
          )}
        </div>
      );
    });
  }

  const rootViews = views.filter(v => !v.folderId);

  return (
    <div style={styles.sidebar}>
      <div style={styles.sidebarHeader}>
        <span>Views</span>
        <button style={styles.headerBtn} onClick={() => setCreatingFolder(true)} title="New folder">
          + Folder
        </button>
      </div>

      {/* ── Flat Folders ── */}
      {renderFolders()}

      {/* ── Root views (not in any folder) ── */}
      <div
        onDragOver={handleDragOverRoot}
        onDrop={handleDropOnRoot}
        onDragLeave={() => {
          if (dragOverTarget === 'root') setDragOverTarget(null);
        }}
        style={{
          outline: dragOverTarget === 'root' ? '2px dashed #0052CC' : 'none',
          outlineOffset: '-2px',
          borderRadius: '4px',
          minHeight: rootViews.length === 0 && draggingViewId ? '32px' : undefined,
        }}
      >
        {rootViews.map(v => (
          <ViewRow
            key={v.id}
            view={v}
            isActive={v.id === activeViewId}
            isRenaming={renamingViewId === v.id}
            renameValue={renameViewValue}
            hovered={hoveredViewId === v.id}
            depth={0}
            canDelete={views.length > 1}
            folders={folders}
            isDragging={draggingViewId === v.id}
            onHover={setHoveredViewId}
            onSwitch={onSwitch}
            onStartRename={() => { setRenamingViewId(v.id); setRenameViewValue(v.name); }}
            onRenameChange={setRenameViewValue}
            onRenameConfirm={() => handleRenameView(v.id)}
            onRenameCancel={() => setRenamingViewId(null)}
            onDelete={onDelete}
            onMoveToFolder={onMoveToFolder}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          />
        ))}
      </div>

      <div style={styles.divider} />

      {/* ── Modules section ── */}
      <div style={styles.sidebarHeader}>
        <span>Modules</span>
        <button
          style={styles.headerBtn}
          onClick={() => setShowModulePicker(prev => !prev)}
          title="Add or remove modules"
        >
          + Add
        </button>
      </div>

      {/* Module picker (inline dropdown) */}
      {showModulePicker && (
        <div ref={modulePickerRef} style={modulePickerStyles.container}>
          <div style={modulePickerStyles.title}>Available Modules</div>
          {MODULES.map(mod => {
            const isEnabled = enabledModuleIds.includes(mod.id);
            return (
              <div key={mod.id} style={modulePickerStyles.row}>
                <span style={{ fontSize: '14px', flexShrink: 0 }}>{mod.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: 600, color: '#172B4D' }}>{mod.label}</div>
                  <div style={{ fontSize: '10px', color: '#6B778C', lineHeight: '1.3' }}>{mod.description}</div>
                </div>
                <button
                  style={{
                    ...modulePickerStyles.toggleBtn,
                    background: isEnabled ? '#E3FCEF' : '#fff',
                    color: isEnabled ? '#00875A' : '#0073ea',
                    borderColor: isEnabled ? '#ABF5D1' : '#DFE1E6',
                  }}
                  onClick={() => {
                    const next = isEnabled
                      ? enabledModuleIds.filter(id => id !== mod.id)
                      : [...enabledModuleIds, mod.id];
                    if (onSaveEnabledModules) onSaveEnabledModules(next);
                  }}
                >
                  {isEnabled ? 'Enabled \u2713' : 'Enable'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Enabled modules list */}
      {enabledModuleIds.length === 0 && !showModulePicker && (
        <div style={{ padding: '8px 12px', fontSize: '11px', color: '#97A0AF', lineHeight: '1.4' }}>
          Add modules to extend your workspace.
        </div>
      )}
      {enabledModuleIds.map(modId => {
        const mod = MODULES.find(m => m.id === modId);
        if (!mod) return null;
        const isActive = activeModuleId === mod.id;
        const isHovered = hoveredModuleId === mod.id;
        return (
          <div
            key={mod.id}
            style={{
              ...styles.viewItem,
              paddingLeft: '10px',
              background: isActive ? '#DEEBFF' : 'transparent',
              color: isActive ? '#0073ea' : '#172B4D',
              cursor: 'pointer',
            }}
            onClick={() => onSelectModule && onSelectModule(mod.id)}
            onMouseEnter={(e) => {
              setHoveredModuleId(mod.id);
              if (!isActive) e.currentTarget.style.background = '#F4F5F7';
            }}
            onMouseLeave={(e) => {
              setHoveredModuleId(null);
              if (!isActive) e.currentTarget.style.background = 'transparent';
            }}
          >
            <span style={{ fontSize: '14px', flexShrink: 0 }}>{mod.icon}</span>
            <span style={{ fontSize: '13px', fontWeight: 500, flex: 1 }}>{mod.label}</span>
            {isHovered && (
              <button
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: '12px', color: '#6B778C', padding: '2px 4px',
                  borderRadius: '3px', lineHeight: 1, flexShrink: 0,
                }}
                title={`Remove ${mod.label} module`}
                onClick={(e) => {
                  e.stopPropagation();
                  const next = enabledModuleIds.filter(id => id !== mod.id);
                  if (onSaveEnabledModules) onSaveEnabledModules(next);
                  // If removing the active module, clear selection
                  if (isActive && onSelectModule) onSelectModule(null);
                }}
              >
                {'\u2715'}
              </button>
            )}
          </div>
        );
      })}

      <div style={styles.divider} />

      {/* ── Create folder form ── */}
      {creatingFolder && (
        <div style={{ ...styles.newViewForm, flexDirection: 'column', gap: '6px', alignItems: 'stretch' }}>
          <input
            autoFocus
            style={styles.newViewInput}
            placeholder="Folder name..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
            }}
          />
          <div style={{ display: 'flex', gap: '4px' }}>
            <button style={styles.createConfirmBtn} onClick={handleCreateFolder}>Create</button>
            <button style={styles.createCancelBtn} onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}>Cancel</button>
          </div>
        </div>
      )}

      {/* ── Create view ── */}
      {creatingNew ? (
        <div style={{ ...styles.newViewForm, flexDirection: 'column', gap: '6px', alignItems: 'stretch' }}>
          <input
            autoFocus
            style={styles.newViewInput}
            placeholder="View name..."
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateView();
              if (e.key === 'Escape') { setCreatingNew(false); setNewViewName(''); setNewViewFolderId(null); setNewViewType('timeline'); }
            }}
          />
          {/* View type toggle */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {['timeline', 'list', 'tree', 'roadmap', 'project'].map(vt => {
              const { label, Icon } = VIEW_TYPE_META[vt];
              const active = newViewType === vt;
              return (
                <button
                  key={vt}
                  style={{
                    flex: 1, border: '1px solid', borderRadius: '3px', padding: '5px 6px',
                    cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                    background: active ? VIEW_TYPE_META[vt].color : '#fff',
                    color: active ? '#fff' : '#6B778C',
                    borderColor: active ? VIEW_TYPE_META[vt].color : '#DFE1E6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                  }}
                  onClick={() => setNewViewType(vt)}
                >
                  <Icon size={12} color={active ? '#fff' : VIEW_TYPE_META[vt].color} /> {label}
                </button>
              );
            })}
          </div>
          {folders.length > 0 && (
            <select
              style={styles.folderSelect}
              value={newViewFolderId || ''}
              onChange={(e) => setNewViewFolderId(e.target.value || null)}
            >
              <option value="">No folder</option>
              {folders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          )}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button style={styles.createConfirmBtn} onClick={handleCreateView}>Create</button>
            <button style={styles.createCancelBtn} onClick={() => { setCreatingNew(false); setNewViewName(''); setNewViewFolderId(null); setNewViewType('timeline'); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button style={styles.createViewBtn} onClick={() => setCreatingNew(true)}>
          + Create view
        </button>
      )}
    </div>
  );
}

// ── Folder Config Modal Component ───────────────────────────────────────────

function FolderConfigModal({ folder, onSave, onClose }) {
  const [name, setName] = useState(folder.name || '');
  const [description, setDescription] = useState(folder.description || '');
  const [defaultJql, setDefaultJql] = useState(folder.defaultJql || '');
  const [showHelp, setShowHelp] = useState(false);

  function handleSave() {
    onSave({ ...folder, name: name.trim() || folder.name, description, defaultJql });
  }

  return (
    <div style={{
      margin: '2px 8px 4px',
      background: '#FAFBFC', border: '1px solid #DFE1E6', borderRadius: '6px',
      padding: '10px 12px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
    }}>
      <div style={{ fontSize: '11px', fontWeight: 700, color: '#42526E', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        {'\u2699'} Folder Settings
      </div>

      {/* Name */}
      <label style={folderConfigStyles.label}>Name</label>
      <input
        style={folderConfigStyles.input}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
      />

      {/* Description */}
      <label style={folderConfigStyles.label}>Description <span style={{ fontWeight: 400, color: '#97A0AF' }}>(optional)</span></label>
      <textarea
        style={folderConfigStyles.textarea}
        rows={2}
        placeholder="Brief description of this folder..."
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      {/* Default JQL */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
        <label style={{ ...folderConfigStyles.label, marginTop: 0, marginBottom: 0 }}>Default JQL</label>
        <button
          style={{
            background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px',
            color: '#6B778C', padding: '0 2px', lineHeight: 1,
          }}
          title="Help"
          onClick={() => setShowHelp(!showHelp)}
        >?</button>
      </div>
      {showHelp && (
        <div style={{
          fontSize: '10px', color: '#6B778C', background: '#F4F5F7', borderRadius: '3px',
          padding: '6px 8px', margin: '4px 0', lineHeight: '1.5',
        }}>
          Views in this folder without their own filter will use this JQL.
        </div>
      )}
      <textarea
        style={folderConfigStyles.textarea}
        rows={3}
        placeholder='e.g. project = "MY-PROJECT" AND type = Story'
        value={defaultJql}
        onChange={(e) => setDefaultJql(e.target.value)}
      />

      {/* Actions */}
      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
        <button
          style={{
            background: '#0073ea', color: '#fff', border: 'none', borderRadius: '4px',
            padding: '5px 14px', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
          }}
          onClick={handleSave}
        >Save</button>
        <button
          style={{
            background: 'none', border: '1px solid #DFE1E6', borderRadius: '4px',
            padding: '5px 10px', cursor: 'pointer', fontSize: '11px', color: '#6B778C',
          }}
          onClick={onClose}
        >Cancel</button>
      </div>
    </div>
  );
}

const folderConfigStyles = {
  label: {
    display: 'block', fontSize: '10px', fontWeight: 600, color: '#6B778C',
    textTransform: 'uppercase', letterSpacing: '0.3px', marginTop: '6px', marginBottom: '3px',
  },
  input: {
    width: '100%', border: '1px solid #DFE1E6', borderRadius: '4px', padding: '5px 8px',
    fontSize: '12px', outline: 'none', color: '#172B4D', boxSizing: 'border-box',
  },
  textarea: {
    width: '100%', border: '1px solid #DFE1E6', borderRadius: '4px', padding: '5px 8px',
    fontSize: '12px', outline: 'none', color: '#172B4D', resize: 'vertical',
    fontFamily: 'inherit', boxSizing: 'border-box', marginTop: '3px',
  },
};

const modulePickerStyles = {
  container: {
    margin: '2px 8px 6px',
    background: '#FAFBFC', border: '1px solid #DFE1E6', borderRadius: '6px',
    padding: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  title: {
    fontSize: '10px', fontWeight: 700, color: '#6B778C', textTransform: 'uppercase',
    letterSpacing: '0.3px', padding: '2px 4px 6px', borderBottom: '1px solid #F4F5F7',
    marginBottom: '4px',
  },
  row: {
    display: 'flex', alignItems: 'center', gap: '8px',
    padding: '6px 4px', borderRadius: '4px',
  },
  toggleBtn: {
    border: '1px solid', borderRadius: '4px', padding: '3px 8px',
    cursor: 'pointer', fontSize: '10px', fontWeight: 600,
    flexShrink: 0, whiteSpace: 'nowrap',
  },
};

// ── ViewRow Component ─────────────────────────────────────────────────────────

function ViewRow({ view, isActive, isRenaming, renameValue, hovered, depth, canDelete, folders, isDragging, onHover, onSwitch, onStartRename, onRenameChange, onRenameConfirm, onRenameCancel, onDelete, onMoveToFolder, onDragStart, onDragEnd }) {
  const paddingLeft = 10 + (depth || 0) * 16 + (depth > 0 ? 18 : 0);
  return (
    <div
      draggable={!isRenaming}
      onDragStart={(e) => onDragStart(e, view.id)}
      onDragEnd={onDragEnd}
      style={{
        ...styles.viewItem,
        paddingLeft: `${paddingLeft}px`,
        background: isActive ? '#DEEBFF' : hovered ? '#F4F5F7' : 'transparent',
        color: isActive ? '#0073ea' : '#172B4D',
        opacity: isDragging ? 0.4 : 1,
        cursor: isRenaming ? 'default' : 'grab',
      }}
      onMouseEnter={() => onHover(view.id)}
      onMouseLeave={() => onHover(null)}
      onClick={() => !isRenaming && onSwitch(view.id)}
    >
      {isRenaming ? (
        <input
          autoFocus
          style={styles.renameInput}
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          onBlur={onRenameConfirm}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenameConfirm();
            if (e.key === 'Escape') onRenameCancel();
          }}
        />
      ) : (
        <>
          {(() => {
            const meta = VIEW_TYPE_META[view.viewType || 'timeline'];
            return (
              <span style={{ ...styles.viewIcon, display: 'flex', alignItems: 'center' }}>
                <meta.Icon size={13} color={meta.color} />
              </span>
            );
          })()}
          <span style={styles.viewName} onDoubleClick={(e) => { e.stopPropagation(); onStartRename(); }}>
            {view.name}
          </span>
          {(() => {
            const meta = VIEW_TYPE_META[view.viewType || 'timeline'];
            return (
              <span style={{
                fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px',
                color: meta.color, background: `${meta.color}18`,
                borderRadius: '3px', padding: '1px 4px', flexShrink: 0,
                opacity: isActive ? 1 : 0.75,
              }}>
                {meta.label}
              </span>
            );
          })()}
          {hovered && !isDragging && (
            <div style={styles.viewActions} onClick={e => e.stopPropagation()}>
              <button style={styles.actionBtn} title="Rename" onClick={onStartRename}>{'\u270F'}</button>
              {canDelete && (
                <button
                  style={{ ...styles.actionBtn, color: '#DE350B' }}
                  title="Delete"
                  onClick={() => { if (window.confirm(`Delete view "${view.name}"?`)) onDelete(view.id); }}
                >{'\uD83D\uDDD1'}</button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  sidebar: {
    width: '230px', flexShrink: 0, background: '#fff', borderRight: '1px solid #DFE1E6',
    display: 'flex', flexDirection: 'column', overflowY: 'auto', paddingTop: '8px', paddingBottom: '8px',
  },
  sidebarHeader: {
    fontSize: '11px', fontWeight: 700, color: '#6B778C', textTransform: 'uppercase', letterSpacing: '0.5px',
    padding: '4px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  },
  headerBtn: {
    background: 'none', border: '1px solid #DFE1E6', borderRadius: '3px', padding: '2px 6px',
    cursor: 'pointer', fontSize: '10px', color: '#6B778C', textTransform: 'none', letterSpacing: 0, fontWeight: 500,
  },
  folderRow: {
    display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px',
    cursor: 'pointer', margin: '1px 4px', userSelect: 'none', minHeight: '28px',
  },
  folderIcon: { fontSize: '12px', color: '#6B778C', flexShrink: 0, width: '14px' },
  folderName: { fontSize: '12px', fontWeight: 600, color: '#42526E', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  viewItem: {
    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px',
    borderRadius: '4px', margin: '1px 4px', position: 'relative', minHeight: '30px',
  },
  viewIcon: { fontSize: '13px', flexShrink: 0, opacity: 0.7 },
  viewName: { fontSize: '13px', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  viewActions: { display: 'flex', gap: '2px', flexShrink: 0, alignItems: 'center' },
  actionBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '11px', padding: '2px 4px', borderRadius: '3px', color: '#6B778C', lineHeight: 1 },
  renameInput: { flex: 1, border: '1px solid #0052CC', borderRadius: '3px', padding: '3px 6px', fontSize: '12px', outline: 'none', color: '#172B4D', minWidth: 0 },
  divider: { borderTop: '1px solid #F4F5F7', margin: '8px 4px' },
  createViewBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#0073ea', padding: '6px 12px', textAlign: 'left', fontWeight: 500, width: '100%' },
  newViewForm: { display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 8px' },
  newViewInput: { flex: 1, border: '1px solid #0052CC', borderRadius: '3px', padding: '4px 6px', fontSize: '12px', outline: 'none', minWidth: 0, width: '100%' },
  folderSelect: { border: '1px solid #DFE1E6', borderRadius: '3px', padding: '4px 6px', fontSize: '12px', outline: 'none', width: '100%', color: '#172B4D', background: '#fff' },
  createConfirmBtn: { background: '#0073ea', color: '#fff', border: 'none', borderRadius: '3px', padding: '4px 8px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, flexShrink: 0 },
  createCancelBtn: { background: 'none', border: '1px solid #DFE1E6', borderRadius: '3px', padding: '4px 6px', cursor: 'pointer', fontSize: '11px', color: '#6B778C', flexShrink: 0 },
};