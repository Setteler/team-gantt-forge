import React, { useState, useCallback } from 'react';

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

const VIEW_TYPE_META = {
  timeline: { label: 'Gantt', Icon: TimelineIcon, color: '#0073ea' },
  list:     { label: 'List',  Icon: ListIcon,     color: '#00854d' },
  tree:     { label: 'Tree',  Icon: TreeIcon,     color: '#FF8B00' },
};

const BOX_TYPE_META = {
  portfolio: { icon: '\uD83D\uDCCA', label: 'Portfolio', color: '#0073ea' },
  program:   { icon: '\uD83D\uDCC1', label: 'Program',   color: '#6554C0' },
  project:   { icon: '\uD83D\uDCC2', label: 'Project',   color: '#00875A' },
  custom:    { icon: '\uD83D\uDDC2', label: '',           color: '#6B778C' },
};

const BOX_TYPES = ['portfolio', 'program', 'project', 'custom'];

export default function ViewSidebar({
  views, folders, activeViewId,
  onSwitch, onCreate, onRename, onDelete,
  onMoveToFolder, onCreateFolder, onRenameFolder, onDeleteFolder,
  onMoveBoxToParent,
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
  const [newFolderBoxType, setNewFolderBoxType] = useState('custom');
  const [newFolderParentId, setNewFolderParentId] = useState(null);
  const [renamingFolderId, setRenamingFolderId] = useState(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');
  const [hoveredFolderId, setHoveredFolderId] = useState(null);
  const [collapsedFolders, setCollapsedFolders] = useState(new Set());

  // Move menu state
  const [moveMenuBoxId, setMoveMenuBoxId] = useState(null);

  // View drag-and-drop state
  const [draggingViewId, setDraggingViewId] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null); // folderId or 'root'

  // Box drag-and-drop state
  const [draggingBoxId, setDraggingBoxId] = useState(null);
  const [dragOverBoxTarget, setDragOverBoxTarget] = useState(null);

  // ── Helpers: descendants for cycle prevention ─────────────────────────────
  const getDescendantIds = useCallback((boxId) => {
    const descendants = new Set();
    const queue = [boxId];
    while (queue.length > 0) {
      const current = queue.shift();
      for (const f of folders) {
        if ((f.parentId ?? null) === current && !descendants.has(f.id)) {
          descendants.add(f.id);
          queue.push(f.id);
        }
      }
    }
    return descendants;
  }, [folders]);

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
    await onCreateFolder(name, newFolderBoxType, newFolderParentId);
    setCreatingFolder(false);
    setNewFolderName('');
    setNewFolderBoxType('custom');
    setNewFolderParentId(null);
  }

  function startCreateChildBox(parentId) {
    setNewFolderParentId(parentId);
    setNewFolderBoxType('custom');
    setNewFolderName('');
    setCreatingFolder(true);
  }

  function toggleFolder(folderId) {
    setCollapsedFolders(prev => {
      const next = new Set(prev);
      next.has(folderId) ? next.delete(folderId) : next.add(folderId);
      return next;
    });
  }

  // ── Move Box handler ──────────────────────────────────────────────────────
  function handleMoveBox(boxId, newParentId) {
    if (onMoveBoxToParent) onMoveBoxToParent(boxId, newParentId);
    setMoveMenuBoxId(null);
  }

  // ── View Drag handlers ────────────────────────────────────────────────────
  function handleDragStart(e, viewId) {
    setDraggingViewId(viewId);
    setDraggingBoxId(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `view:${viewId}`);
  }

  function handleDragEnd() {
    setDraggingViewId(null);
    setDragOverTarget(null);
    setDraggingBoxId(null);
    setDragOverBoxTarget(null);
  }

  function handleDragOverFolder(e, folderId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggingViewId) {
      setDragOverTarget(folderId);
    } else if (draggingBoxId) {
      // Don't allow drop on self or descendant
      const descendants = getDescendantIds(draggingBoxId);
      if (folderId !== draggingBoxId && !descendants.has(folderId)) {
        setDragOverBoxTarget(folderId);
      }
    }
  }

  function handleDragOverRoot(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggingViewId) {
      setDragOverTarget('root');
    } else if (draggingBoxId) {
      setDragOverBoxTarget('root');
    }
  }

  function handleDropOnFolder(e, folderId) {
    e.preventDefault();
    e.stopPropagation();
    if (draggingViewId) {
      onMoveToFolder(draggingViewId, folderId);
    } else if (draggingBoxId) {
      const descendants = getDescendantIds(draggingBoxId);
      if (folderId !== draggingBoxId && !descendants.has(folderId)) {
        handleMoveBox(draggingBoxId, folderId);
      }
    }
    setDraggingViewId(null);
    setDragOverTarget(null);
    setDraggingBoxId(null);
    setDragOverBoxTarget(null);
  }

  function handleDropOnRoot(e) {
    e.preventDefault();
    if (draggingViewId) onMoveToFolder(draggingViewId, null);
    else if (draggingBoxId) handleMoveBox(draggingBoxId, null);
    setDraggingViewId(null);
    setDragOverTarget(null);
    setDraggingBoxId(null);
    setDragOverBoxTarget(null);
  }

  // ── Box Drag handlers ─────────────────────────────────────────────────────
  function handleBoxDragStart(e, boxId) {
    e.stopPropagation();
    setDraggingBoxId(boxId);
    setDraggingViewId(null);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `box:${boxId}`);
  }

  // ── Recursive Box Tree Renderer ───────────────────────────────────────────
  function renderBoxTree(parentId, depth, visited) {
    const childFolders = folders.filter(f => (f.parentId ?? null) === parentId);
    if (childFolders.length === 0 && parentId !== null) return null;

    return childFolders.map(folder => {
      // Cycle protection
      if (visited.has(folder.id)) return null;
      const nextVisited = new Set(visited);
      nextVisited.add(folder.id);

      const folderViews = views.filter(v => v.folderId === folder.id);
      const isCollapsed = collapsedFolders.has(folder.id);
      const isRenamingFolder = renamingFolderId === folder.id;
      const isDragTarget = dragOverTarget === folder.id;
      const isBoxDragTarget = dragOverBoxTarget === folder.id;
      const boxMeta = BOX_TYPE_META[folder.boxType] || BOX_TYPE_META.custom;
      const paddingLeft = 10 + depth * 16;

      return (
        <div
          key={folder.id}
          onDragOver={(e) => handleDragOverFolder(e, folder.id)}
          onDrop={(e) => handleDropOnFolder(e, folder.id)}
          onDragLeave={(e) => {
            // Only clear if leaving this element (not entering a child)
            if (!e.currentTarget.contains(e.relatedTarget)) {
              if (dragOverTarget === folder.id) setDragOverTarget(null);
              if (dragOverBoxTarget === folder.id) setDragOverBoxTarget(null);
            }
          }}
        >
          {/* Folder/Box row */}
          <div
            draggable={!isRenamingFolder}
            onDragStart={(e) => handleBoxDragStart(e, folder.id)}
            onDragEnd={handleDragEnd}
            style={{
              ...styles.folderRow,
              paddingLeft,
              background: isDragTarget || isBoxDragTarget ? '#E3FCEF' : hoveredFolderId === folder.id ? '#F4F5F7' : 'transparent',
              outline: isDragTarget || isBoxDragTarget ? '2px dashed #00875A' : 'none',
              outlineOffset: '-2px',
              borderRadius: '4px',
              opacity: draggingBoxId === folder.id ? 0.4 : 1,
              cursor: isRenamingFolder ? 'default' : 'grab',
            }}
            onMouseEnter={() => setHoveredFolderId(folder.id)}
            onMouseLeave={() => setHoveredFolderId(null)}
            onClick={() => !isRenamingFolder && toggleFolder(folder.id)}
          >
            <span style={styles.folderIcon}>{isCollapsed ? '\u25B8' : '\u25BE'}</span>
            <span style={{ fontSize: '12px', flexShrink: 0 }}>{boxMeta.icon}</span>
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
            {/* Box type badge */}
            {boxMeta.label && !isRenamingFolder && (
              <span style={{
                fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.3px',
                color: boxMeta.color, background: `${boxMeta.color}18`,
                borderRadius: '3px', padding: '1px 4px', flexShrink: 0, lineHeight: '14px',
              }}>
                {boxMeta.label}
              </span>
            )}
            {hoveredFolderId === folder.id && !isRenamingFolder && (
              <div style={styles.viewActions} onClick={e => e.stopPropagation()}>
                <button style={styles.actionBtn} title="Add child box" onClick={() => startCreateChildBox(folder.id)}>+</button>
                <button style={styles.actionBtn} title="Move box" onClick={() => setMoveMenuBoxId(moveMenuBoxId === folder.id ? null : folder.id)}>{'\u2197'}</button>
                <button style={styles.actionBtn} title="Rename" onClick={() => { setRenamingFolderId(folder.id); setRenameFolderValue(folder.name); }}>{'\u270F'}</button>
                <button
                  style={{ ...styles.actionBtn, color: '#DE350B' }}
                  title="Delete box"
                  onClick={() => {
                    if (window.confirm(`Delete box "${folder.name}"? Views inside will move to root. Child boxes will be un-nested.`)) {
                      onDeleteFolder(folder.id);
                    }
                  }}
                >{'\uD83D\uDDD1'}</button>
              </div>
            )}
          </div>

          {/* Move menu */}
          {moveMenuBoxId === folder.id && (
            <MoveMenu
              boxId={folder.id}
              folders={folders}
              getDescendantIds={getDescendantIds}
              currentParentId={folder.parentId ?? null}
              onMove={handleMoveBox}
              onClose={() => setMoveMenuBoxId(null)}
              depth={depth}
            />
          )}

          {/* Children (child boxes + views) */}
          {!isCollapsed && (
            <>
              {/* Recursively render child boxes */}
              {renderBoxTree(folder.id, depth + 1, nextVisited)}

              {/* Views inside this folder */}
              {folderViews.map(v => (
                <ViewRow
                  key={v.id}
                  view={v}
                  isActive={v.id === activeViewId}
                  isRenaming={renamingViewId === v.id}
                  renameValue={renameViewValue}
                  hovered={hoveredViewId === v.id}
                  depth={depth + 1}
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
                style={{ ...styles.createViewBtn, paddingLeft: `${paddingLeft + 18}px`, fontSize: '11px' }}
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
        <span>Boxes</span>
        <button style={styles.headerBtn} onClick={() => { setNewFolderParentId(null); setCreatingFolder(true); }} title="New box">
          + Box
        </button>
      </div>

      {/* ── Recursive Box Tree (root-level boxes) ── */}
      {renderBoxTree(null, 0, new Set())}

      {/* ── Root views (not in any folder) ── */}
      <div
        onDragOver={handleDragOverRoot}
        onDrop={handleDropOnRoot}
        onDragLeave={() => {
          if (dragOverTarget === 'root') setDragOverTarget(null);
          if (dragOverBoxTarget === 'root') setDragOverBoxTarget(null);
        }}
        style={{
          outline: (dragOverTarget === 'root' || dragOverBoxTarget === 'root') ? '2px dashed #0052CC' : 'none',
          outlineOffset: '-2px',
          borderRadius: '4px',
          minHeight: rootViews.length === 0 && (draggingViewId || draggingBoxId) ? '32px' : undefined,
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

      {/* ── Create box form ── */}
      {creatingFolder && (
        <div style={{ ...styles.newViewForm, flexDirection: 'column', gap: '6px', alignItems: 'stretch' }}>
          <input
            autoFocus
            style={styles.newViewInput}
            placeholder="Box name..."
            value={newFolderName}
            onChange={(e) => setNewFolderName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateFolder();
              if (e.key === 'Escape') { setCreatingFolder(false); setNewFolderName(''); setNewFolderBoxType('custom'); setNewFolderParentId(null); }
            }}
          />
          {/* Box type selector */}
          <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
            {BOX_TYPES.map(bt => {
              const meta = BOX_TYPE_META[bt];
              const active = newFolderBoxType === bt;
              return (
                <button
                  key={bt}
                  style={{
                    flex: 1, border: '1px solid', borderRadius: '3px', padding: '4px 4px',
                    cursor: 'pointer', fontSize: '10px', fontWeight: 600,
                    background: active ? meta.color : '#fff',
                    color: active ? '#fff' : meta.color,
                    borderColor: active ? meta.color : '#DFE1E6',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                    minWidth: 0, whiteSpace: 'nowrap',
                  }}
                  onClick={() => setNewFolderBoxType(bt)}
                >
                  <span style={{ fontSize: '11px' }}>{meta.icon}</span>
                  {meta.label || 'Custom'}
                </button>
              );
            })}
          </div>
          {newFolderParentId && (
            <div style={{ fontSize: '10px', color: '#6B778C', padding: '0 2px' }}>
              Parent: {folders.find(f => f.id === newFolderParentId)?.name || 'Unknown'}
              <button
                style={{ ...styles.actionBtn, fontSize: '10px', marginLeft: '4px' }}
                onClick={() => setNewFolderParentId(null)}
              >x (root)</button>
            </div>
          )}
          <div style={{ display: 'flex', gap: '4px' }}>
            <button style={styles.createConfirmBtn} onClick={handleCreateFolder}>Create</button>
            <button style={styles.createCancelBtn} onClick={() => { setCreatingFolder(false); setNewFolderName(''); setNewFolderBoxType('custom'); setNewFolderParentId(null); }}>Cancel</button>
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
            {['timeline', 'list', 'tree'].map(vt => {
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
              <option value="">No box (root)</option>
              {folders.map(f => <option key={f.id} value={f.id}>{(BOX_TYPE_META[f.boxType]?.icon || '') + ' ' + f.name}</option>)}
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

// ── Move Menu Component ───────────────────────────────────────────────────────

function MoveMenu({ boxId, folders, getDescendantIds, currentParentId, onMove, onClose, depth }) {
  const descendants = getDescendantIds(boxId);
  const paddingLeft = 10 + (depth + 1) * 16;

  // Valid targets: root + all folders that are not self, not descendant, not current parent
  const targets = folders.filter(f =>
    f.id !== boxId &&
    !descendants.has(f.id)
  );

  return (
    <div style={{
      margin: '2px 8px 4px',
      background: '#FAFBFC', border: '1px solid #DFE1E6', borderRadius: '4px',
      padding: '4px', paddingLeft: `${paddingLeft}px`,
      maxHeight: '200px', overflowY: 'auto',
    }}>
      <div style={{ fontSize: '10px', fontWeight: 600, color: '#6B778C', padding: '2px 6px', textTransform: 'uppercase' }}>
        Move to...
      </div>
      <button
        style={{
          ...styles.moveMenuItem,
          fontWeight: (currentParentId ?? null) === null ? 700 : 400,
          color: (currentParentId ?? null) === null ? '#6B778C' : '#172B4D',
        }}
        onClick={() => onMove(boxId, null)}
        disabled={(currentParentId ?? null) === null}
      >
        {'\u2302'} Root
      </button>
      {targets.map(f => {
        const meta = BOX_TYPE_META[f.boxType] || BOX_TYPE_META.custom;
        const isCurrent = (currentParentId ?? null) === f.id;
        return (
          <button
            key={f.id}
            style={{
              ...styles.moveMenuItem,
              fontWeight: isCurrent ? 700 : 400,
              color: isCurrent ? '#6B778C' : '#172B4D',
            }}
            onClick={() => onMove(boxId, f.id)}
            disabled={isCurrent}
          >
            {meta.icon} {f.name}
          </button>
        );
      })}
      <button style={{ ...styles.moveMenuItem, color: '#6B778C', fontSize: '10px' }} onClick={onClose}>Cancel</button>
    </div>
  );
}

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
  moveMenuItem: {
    display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none',
    padding: '4px 6px', cursor: 'pointer', fontSize: '11px', borderRadius: '3px',
  },
};
