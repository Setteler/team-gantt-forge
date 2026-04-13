import React, { useState } from 'react';

const STATUS_OPTIONS = ['active', 'achieved', 'missed', 'archived'];
const STATUS_COLORS = { active: '#0052CC', achieved: '#00875A', missed: '#DE350B', archived: '#97A0AF' };
const STATUS_ORDER = { active: 0, achieved: 1, missed: 2, archived: 3 };

function genKrId() {
  return `kr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function computeKrProgress(kr, issues) {
  if (kr.manualProgress != null) return kr.manualProgress;
  const keys = (kr.linkedIssueKeys || []).filter(Boolean);
  if (keys.length === 0) return 0;
  const keySet = new Set(keys.map(k => k.toUpperCase()));
  let done = 0;
  for (const issue of issues) {
    if (keySet.has(issue.key.toUpperCase()) && issue.fields?.status?.name === 'Done') done++;
  }
  // Use linked key count as denominator so unresolved keys count as not done
  return Math.round((done / keys.length) * 100);
}

function computeObjectiveProgress(obj, issues) {
  const krs = obj.keyResults || [];
  if (krs.length === 0) return 0;
  const sum = krs.reduce((acc, kr) => acc + computeKrProgress(kr, issues), 0);
  return Math.round(sum / krs.length);
}

export default function ObjectivesModule({ objectives, issues, onSaveObjective, onDeleteObjective }) {
  const [showModal, setShowModal] = useState(false);
  const [editingObj, setEditingObj] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');

  function openCreate() {
    setEditingObj(null);
    setShowModal(true);
  }

  function openEdit(obj) {
    setEditingObj(obj);
    setShowModal(true);
  }

  function handleDelete(obj) {
    if (window.confirm(`Delete objective "${obj.title}"? This cannot be undone.`)) {
      onDeleteObjective(obj.id);
    }
  }

  function closeModal() {
    setShowModal(false);
    setEditingObj(null);
  }

  function handleSave(objData) {
    onSaveObjective(objData);
    closeModal();
  }

  const filtered = objectives.filter(o => statusFilter === 'all' || o.status === statusFilter);
  const sorted = [...filtered].sort((a, b) => {
    const sa = STATUS_ORDER[a.status] ?? 9;
    const sb = STATUS_ORDER[b.status] ?? 9;
    if (sa !== sb) return sa - sb;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Objectives</h2>
          <p style={styles.subtitle}>Track strategic goals and map them to Jira work.</p>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.filterGroup}>
            {['all', ...STATUS_OPTIONS].map(s => (
              <button
                key={s}
                style={{
                  ...styles.filterBtn,
                  ...(statusFilter === s ? styles.filterBtnActive : {}),
                }}
                onClick={() => setStatusFilter(s)}
              >{s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}</button>
            ))}
          </div>
          <button style={styles.createBtn} onClick={openCreate}>+ Create objective</button>
        </div>
      </div>

      {objectives.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>&#127919;</div>
          <p style={styles.emptyTitle}>No objectives yet</p>
          <p style={styles.emptyText}>Track strategic goals and map them to Jira work.</p>
          <button style={styles.createBtn} onClick={openCreate}>+ Create objective</button>
        </div>
      ) : sorted.length === 0 ? (
        <div style={styles.emptyState}>
          <p style={styles.emptyTitle}>No objectives match this filter</p>
          <p style={styles.emptyText}>Try a different status filter.</p>
        </div>
      ) : (
        <div style={styles.cardGrid}>
          {sorted.map(obj => (
            <ObjectiveCard
              key={obj.id}
              obj={obj}
              issues={issues}
              onEdit={() => openEdit(obj)}
              onDelete={() => handleDelete(obj)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <ObjectiveModal
          objective={editingObj}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

/* -- Card ------------------------------------------------------------------ */

function ObjectiveCard({ obj, issues, onEdit, onDelete }) {
  const [hovering, setHovering] = useState(false);
  const progress = computeObjectiveProgress(obj, issues);
  const krs = obj.keyResults || [];

  return (
    <div
      style={{ ...styles.card, boxShadow: hovering ? '0 4px 12px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.06)' }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div style={styles.cardHeader}>
        <div style={styles.cardTitleArea}>
          <h3 style={styles.cardTitle}>{obj.title}</h3>
          <div style={styles.cardChips}>
            {obj.timeframe && <span style={styles.timeframeChip}>{obj.timeframe}</span>}
            <span style={{ ...styles.statusBadge, background: STATUS_COLORS[obj.status] || '#97A0AF' }}>
              {obj.status}
            </span>
          </div>
        </div>
        <div style={styles.cardProgressBig}>
          <span style={styles.progressNumber}>{progress}%</span>
        </div>
      </div>

      <div style={styles.progressBarWrap}>
        <div style={{
          ...styles.progressBarFill,
          width: `${Math.min(progress, 100)}%`,
          background: progress >= 100 ? '#00875A' : '#0073ea',
        }} />
      </div>

      {obj.description && (
        <p style={styles.cardDesc}>{obj.description}</p>
      )}

      {obj.owner && (
        <p style={styles.ownerText}>Owner: {obj.owner}</p>
      )}

      {krs.length > 0 && (
        <div style={styles.krList}>
          {krs.map(kr => (
            <KrRow key={kr.id} kr={kr} issues={issues} />
          ))}
        </div>
      )}

      <div style={styles.cardFooter}>
        <button style={styles.cardActionBtn} onClick={onEdit} title="Edit">&#9998; Edit</button>
        <button style={{ ...styles.cardActionBtn, color: '#DE350B' }} onClick={onDelete} title="Delete">&#128465; Delete</button>
      </div>
    </div>
  );
}

function KrRow({ kr, issues }) {
  const progress = computeKrProgress(kr, issues);
  const keys = (kr.linkedIssueKeys || []).filter(Boolean);
  const isAuto = kr.manualProgress == null;
  let doneCount = 0;
  if (isAuto && keys.length > 0) {
    const keySet = new Set(keys.map(k => k.toUpperCase()));
    for (const issue of issues) {
      if (keySet.has(issue.key.toUpperCase()) && issue.fields?.status?.name === 'Done') doneCount++;
    }
  }

  return (
    <div style={styles.krRow}>
      <div style={styles.krInfo}>
        <span style={styles.krTitle}>{kr.title}</span>
        <span style={styles.krMeta}>
          {isAuto
            ? (keys.length > 0 ? `Auto (${doneCount}/${keys.length} done)` : 'Auto (no issues)')
            : `Manual: ${progress}%`
          }
        </span>
      </div>
      <div style={styles.krProgressWrap}>
        <div style={{
          ...styles.krProgressFill,
          width: `${Math.min(progress, 100)}%`,
          background: progress >= 100 ? '#00875A' : '#0073ea',
        }} />
      </div>
      {keys.length > 0 && (
        <div style={styles.krChips}>
          {keys.map(k => (
            <span key={k} style={styles.issueChip}>{k}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/* -- Modal ----------------------------------------------------------------- */

function ObjectiveModal({ objective, onSave, onClose }) {
  const [title, setTitle] = useState(objective?.title || '');
  const [description, setDescription] = useState(objective?.description || '');
  const [timeframe, setTimeframe] = useState(objective?.timeframe || '');
  const [owner, setOwner] = useState(objective?.owner || '');
  const [status, setStatus] = useState(objective?.status || 'active');
  const [keyResults, setKeyResults] = useState(() => {
    const existing = objective?.keyResults || [];
    if (existing.length > 0) {
      return existing.map(kr => ({
        id: kr.id,
        title: kr.title || '',
        mode: kr.manualProgress != null ? 'manual' : 'auto',
        manualProgress: kr.manualProgress != null ? kr.manualProgress : 50,
        linkedIssueKeysStr: (kr.linkedIssueKeys || []).join(', '),
      }));
    }
    return [{
      id: genKrId(),
      title: '',
      mode: 'auto',
      manualProgress: 50,
      linkedIssueKeysStr: '',
    }];
  });

  function addKr() {
    setKeyResults(prev => [...prev, {
      id: genKrId(),
      title: '',
      mode: 'auto',
      manualProgress: 50,
      linkedIssueKeysStr: '',
    }]);
  }

  function removeKr(idx) {
    setKeyResults(prev => prev.filter((_, i) => i !== idx));
  }

  function updateKr(idx, field, value) {
    setKeyResults(prev => prev.map((kr, i) => i === idx ? { ...kr, [field]: value } : kr));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const validKrs = keyResults
      .filter(kr => kr.title.trim())
      .map(kr => ({
        id: kr.id || genKrId(),
        title: kr.title.trim(),
        manualProgress: kr.mode === 'manual' ? Math.max(0, Math.min(100, Number(kr.manualProgress) || 0)) : null,
        linkedIssueKeys: kr.linkedIssueKeysStr
          .split(',')
          .map(k => k.trim())
          .filter(Boolean),
      }));

    const objData = {
      ...(objective?.id ? { id: objective.id } : {}),
      ...(objective?.createdAt ? { createdAt: objective.createdAt } : {}),
      title: title.trim(),
      description: description.trim(),
      timeframe: timeframe.trim(),
      owner: owner.trim(),
      status,
      keyResults: validKrs,
    };
    onSave(objData);
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{objective ? 'Edit Objective' : 'Create Objective'}</h3>
          <button style={styles.modalCloseBtn} onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.modalBody}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Title *</label>
            <input
              autoFocus
              style={styles.formInput}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Increase platform reliability"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Description</label>
            <textarea
              style={{ ...styles.formInput, minHeight: '56px', resize: 'vertical' }}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the objective..."
            />
          </div>

          <div style={styles.formRow}>
            <div style={{ flex: 1 }}>
              <label style={styles.formLabel}>Timeframe</label>
              <input
                style={styles.formInput}
                value={timeframe}
                onChange={e => setTimeframe(e.target.value)}
                placeholder="e.g. Q2 2026"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.formLabel}>Owner</label>
              <input
                style={styles.formInput}
                value={owner}
                onChange={e => setOwner(e.target.value)}
                placeholder="e.g. Jane Smith"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.formLabel}>Status</label>
              <select style={styles.formSelect} value={status} onChange={e => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          <div style={styles.formGroup}>
            <div style={styles.krHeader}>
              <label style={styles.formLabel}>Key Results</label>
              <button type="button" style={styles.addKrBtn} onClick={addKr}>+ Add KR</button>
            </div>

            {keyResults.map((kr, idx) => (
              <div key={kr.id || idx} style={styles.krFormCard}>
                <div style={styles.krFormRow}>
                  <input
                    style={{ ...styles.formInput, flex: 1 }}
                    value={kr.title}
                    onChange={e => updateKr(idx, 'title', e.target.value)}
                    placeholder="Key result title"
                  />
                  <button
                    type="button"
                    style={styles.removeKrBtn}
                    onClick={() => removeKr(idx)}
                    title="Remove KR"
                  >&minus;</button>
                </div>

                <div style={styles.krFormRow}>
                  <label style={styles.radioLabel}>
                    <input
                      type="radio"
                      name={`mode-${idx}`}
                      checked={kr.mode === 'auto'}
                      onChange={() => updateKr(idx, 'mode', 'auto')}
                    /> Auto (from linked issues)
                  </label>
                  <label style={styles.radioLabel}>
                    <input
                      type="radio"
                      name={`mode-${idx}`}
                      checked={kr.mode === 'manual'}
                      onChange={() => updateKr(idx, 'mode', 'manual')}
                    /> Manual
                  </label>
                  {kr.mode === 'manual' && (
                    <input
                      type="number"
                      min="0"
                      max="100"
                      style={{ ...styles.formInput, width: '70px', flex: 'none' }}
                      value={kr.manualProgress}
                      onChange={e => updateKr(idx, 'manualProgress', e.target.value)}
                    />
                  )}
                </div>

                <div>
                  <input
                    style={styles.formInput}
                    value={kr.linkedIssueKeysStr}
                    onChange={e => updateKr(idx, 'linkedIssueKeysStr', e.target.value)}
                    placeholder="Linked issue keys (comma-separated, e.g. PROJ-123, PROJ-456)"
                  />
                  <span style={styles.formHint}>Comma-separated Jira issue keys</span>
                </div>
              </div>
            ))}
          </div>

          <div style={styles.modalFooter}>
            <button type="button" style={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={styles.saveBtn} disabled={!title.trim()}>
              {objective ? 'Save Changes' : 'Create Objective'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* -- Styles ---------------------------------------------------------------- */
const styles = {
  container: { flex: 1, overflow: 'auto', padding: '24px 32px', fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif" },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', gap: '16px', flexWrap: 'wrap' },
  title: { margin: 0, fontSize: '20px', fontWeight: 700, color: '#172B4D' },
  subtitle: { margin: '4px 0 0', fontSize: '13px', color: '#6B778C' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, flexWrap: 'wrap' },
  filterGroup: { display: 'flex', border: '1px solid #DFE1E6', borderRadius: '6px', overflow: 'hidden' },
  filterBtn: { background: '#fff', border: 'none', padding: '6px 12px', cursor: 'pointer', fontSize: '12px', fontWeight: 600, color: '#6B778C', borderRight: '1px solid #DFE1E6' },
  filterBtnActive: { background: '#0073ea', color: '#fff' },
  createBtn: { background: '#0073ea', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 600, whiteSpace: 'nowrap' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', textAlign: 'center' },
  emptyIcon: { fontSize: '48px', marginBottom: '12px', opacity: 0.6 },
  emptyTitle: { margin: 0, fontSize: '16px', fontWeight: 600, color: '#172B4D' },
  emptyText: { margin: '8px 0 20px', fontSize: '13px', color: '#6B778C' },
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(420px, 1fr))', gap: '16px' },
  card: { background: '#fff', borderRadius: '8px', border: '1px solid #DFE1E6', padding: '16px', transition: 'box-shadow 0.15s' },
  cardHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '10px', gap: '12px' },
  cardTitleArea: { flex: 1, minWidth: 0 },
  cardTitle: { margin: '0 0 6px', fontSize: '15px', fontWeight: 600, color: '#172B4D' },
  cardChips: { display: 'flex', gap: '6px', flexWrap: 'wrap' },
  timeframeChip: { fontSize: '11px', fontWeight: 600, color: '#0073ea', background: '#DEEBFF', borderRadius: '10px', padding: '2px 10px' },
  statusBadge: { display: 'inline-block', padding: '2px 10px', borderRadius: '10px', fontSize: '11px', fontWeight: 600, color: '#fff', textTransform: 'capitalize' },
  cardProgressBig: { flexShrink: 0, textAlign: 'right' },
  progressNumber: { fontSize: '24px', fontWeight: 700, color: '#172B4D' },
  progressBarWrap: { height: '6px', background: '#F4F5F7', borderRadius: '3px', overflow: 'hidden', marginBottom: '10px' },
  progressBarFill: { height: '100%', borderRadius: '3px', transition: 'width 0.3s' },
  cardDesc: { margin: '0 0 6px', fontSize: '12px', color: '#6B778C', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  ownerText: { margin: '0 0 10px', fontSize: '11px', color: '#97A0AF' },
  krList: { borderTop: '1px solid #F4F5F7', paddingTop: '8px', marginBottom: '8px' },
  krRow: { padding: '6px 0', marginLeft: '8px' },
  krInfo: { display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px', flexWrap: 'wrap' },
  krTitle: { fontSize: '12px', fontWeight: 500, color: '#172B4D' },
  krMeta: { fontSize: '11px', color: '#6B778C' },
  krProgressWrap: { height: '4px', background: '#F4F5F7', borderRadius: '2px', overflow: 'hidden', marginBottom: '3px' },
  krProgressFill: { height: '100%', borderRadius: '2px', transition: 'width 0.3s' },
  krChips: { display: 'flex', gap: '4px', flexWrap: 'wrap' },
  issueChip: { fontSize: '10px', fontWeight: 600, color: '#0052CC', background: '#DEEBFF', borderRadius: '3px', padding: '1px 6px', cursor: 'default' },
  cardFooter: { display: 'flex', gap: '8px', borderTop: '1px solid #F4F5F7', paddingTop: '8px' },
  cardActionBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', padding: '4px 6px', borderRadius: '4px', color: '#6B778C', lineHeight: 1 },
  overlay: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(9, 30, 66, 0.54)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: '#fff', borderRadius: '8px', width: '620px', maxWidth: '90vw', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #DFE1E6' },
  modalTitle: { margin: 0, fontSize: '16px', fontWeight: 600, color: '#172B4D' },
  modalCloseBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px', color: '#6B778C', padding: '4px 8px', lineHeight: 1 },
  modalBody: { padding: '20px', overflowY: 'auto', flex: 1 },
  formGroup: { marginBottom: '16px' },
  formRow: { display: 'flex', gap: '12px', marginBottom: '16px' },
  formLabel: { display: 'block', fontSize: '12px', fontWeight: 600, color: '#42526E', marginBottom: '4px' },
  formInput: { width: '100%', border: '1px solid #DFE1E6', borderRadius: '4px', padding: '8px 10px', fontSize: '13px', outline: 'none', color: '#172B4D', boxSizing: 'border-box' },
  formSelect: { width: '100%', border: '1px solid #DFE1E6', borderRadius: '4px', padding: '8px 10px', fontSize: '13px', outline: 'none', color: '#172B4D', boxSizing: 'border-box', background: '#fff' },
  formHint: { fontSize: '11px', color: '#97A0AF', marginTop: '3px', display: 'block' },
  krHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' },
  addKrBtn: { background: 'none', border: '1px solid #0073ea', borderRadius: '4px', padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 600, color: '#0073ea' },
  krFormCard: { border: '1px solid #F4F5F7', borderRadius: '6px', padding: '10px', marginBottom: '8px', background: '#FAFBFC' },
  krFormRow: { display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' },
  removeKrBtn: { background: 'none', border: '1px solid #DFE1E6', borderRadius: '4px', width: '28px', height: '28px', cursor: 'pointer', fontSize: '14px', color: '#DE350B', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, lineHeight: 1 },
  radioLabel: { fontSize: '12px', color: '#42526E', display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' },
  modalFooter: { display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '16px', borderTop: '1px solid #F4F5F7', marginTop: '8px' },
  cancelBtn: { background: 'none', border: '1px solid #DFE1E6', borderRadius: '6px', padding: '8px 16px', cursor: 'pointer', fontSize: '13px', color: '#42526E', fontWeight: 500 },
  saveBtn: { background: '#0073ea', color: '#fff', border: 'none', borderRadius: '6px', padding: '8px 20px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
};
