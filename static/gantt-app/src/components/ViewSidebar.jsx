import React, { useState } from 'react';

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

const VIEW_TYPE_META = {
  timeline: { label: 'Gantt', Icon: TimelineIcon, color: '#0073ea' },
  list:     { label: 'List',  Icon: ListIcon,     color: '#00854d' },
};

export default function ViewSidebar({
  views, folders, activeViewId,
  onSwitch, onCreate, onRename, onDelete,
  onMoveToFolder, onCreateFolder, onRenameFolder, onDeleteFolder,
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

  // Drag-and-drop state
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

  // ── Drag handlers ─────────────────────────────────────────────────────────
  function handleDragStart(e, viewId) {
    setDraggingViewId(viewId);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragEnd() {
    setDraggingViewId(null);
    setDragOverTarget(null);
  }

  function handleDragOverFolder(e, folderId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget(folderId);
  }

  function handleDragOverRoot(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget('root');
  }

  function handleDropOnFolder(e, folderId) {
    e.preventDefault();
    if (draggingViewId) onMoveToFolder(draggingViewId, folderId);
    setDraggingViewId(null);
    setDragOverTarget(null);
  }

  function handleDropOnRoot(e) {
    e.preventDefault();
    if (draggingViewId) onMoveToFolder(draggingViewId, null);
    setDraggingViewId(null);
    setDragOverTarget(null);
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

      {/* ── Folders ── */}
      {folders.map((folder) => {
        const folderViews = views.filter(v => v.folderId === folder.id);
        const isCollapsed = collapsedFolders.has(folder.id);
        const isRenamingFolder = renamingFolderId === folder.id;
        const isDragTarget = dragOverTarget === folder.id;

        return (
          <div
            key={folder.id}
            onDragOver={(e) => handleDragOverFolder(e, folder.id)}
            onDrop={(e) => handleDropOnFolder(e, folder.id)}
            onDragLeave={() => dragOverTarget === folder.id && setDragOverTarget(null)}
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
              <span style={styles.folderIcon}>{isCollapsed ? '▸' : '▾'}</span>
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
              {hoveredFolderId === folder.id && !isRenamingFolder && (
                <div style={styles.viewActions} onClick={e => e.stopPropagation()}>
                  <button style={styles.actionBtn} title="Rename" onClick={() => { setRenamingFolderId(folder.id); setRenameFolderValue(folder.name); }}>✏</button>
                  <button
                    style={{ ...styles.actionBtn, color: '#DE350B' }}
                    title="Delete folder"
                    onClick={() => {
                      if (window.confirm(`Delete folder "${folder.name}"? Views inside will move to root.`)) {
                        onDeleteFolder(folder.id);
                      }
                    }}
                  >🗑</button>
                </div>
              )}
            </div>

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
                    indented
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
                  style={{ ...styles.createViewBtn, paddingLeft: '32px', fontSize: '11px' }}
                  onClick={() => { setNewViewFolderId(folder.id); setCreatingNew(true); }}
                >
                  + Add view
                </button>
              </>
            )}
          </div>
        );
      })}

      {/* ── Root views ── */}
      <div
        onDragOver={handleDragOverRoot}
        onDrop={handleDropOnRoot}
        onDragLeave={() => dragOverTarget === 'root' && setDragOverTarget(null)}
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
            indented={false}
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

      {/* ── Create folder ── */}
      {creatingFolder && (
        <div style={styles.newViewForm}>
          <input
            autoFocus
            style={styles.newViewInput}
            placeholder="Folder name…"
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); }
            }}
          />
          <button style={styles.createConfirmBtn} onClick={handleCreateFolder}>Create</button>
          <button style={styles.createCancelBtn} onClick={() => { setCreatingFolder(false); setNewFolderName(''); }}>✕</button>
        </div>
      )}

      {/* ── Create view ── */}
      {creatingNew ? (
        <div style={{ ...styles.newViewForm, flexDirection: 'column', gap: '6px', alignItems: 'stretch' }}>
          <input
            autoFocus
            style={styles.newViewInput}
            placeholder="View name…"
            value={newViewName}
            onChange={(e) => setNewViewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateView();
              if (e.key === 'Escape') { setCreatingNew(false); setNewViewName(''); setNewViewFolderId(null); setNewViewType('timeline'); }
            }}
          />
          {/* View type toggle */}
          <div style={{ display: 'flex', gap: '4px' }}>
            {['timeline', 'list'].map(vt => {
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
              <option value="">No folder (root)</option>
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

function ViewRow({ view, isActive, isRenaming, renameValue, hovered, indented, canDelete, folders, isDragging, onHover, onSwitch, onStartRename, onRenameChange, onRenameConfirm, onRenameCancel, onDelete, onMoveToFolder, onDragStart, onDragEnd }) {
  return (
    <div
      draggable={!isRenaming}
      onDragStart={(e) => onDragStart(e, view.id)}
      onDragEnd={onDragEnd}
      style={{
        ...styles.viewItem,
        paddingLeft: indented ? '28px' : '10px',
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
              <button style={styles.actionBtn} title="Rename" onClick={onStartRename}>✏</button>
              {canDelete && (
                <button
                  style={{ ...styles.actionBtn, color: '#DE350B' }}
                  title="Delete"
                  onClick={() => { if (window.confirm(`Delete view "${view.name}"?`)) onDelete(view.id); }}
                >🗑</button>
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
    width: '210px', flexShrink: 0, background: '#fff', borderRight: '1px solid #DFE1E6',
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
