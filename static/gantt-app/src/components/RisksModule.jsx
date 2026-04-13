import React, { useState } from 'react';

const PROB_LABELS = { 1: 'Very Low', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Very High' };
const IMPACT_LABELS = { 1: 'Minimal', 2: 'Minor', 3: 'Moderate', 4: 'Major', 5: 'Catastrophic' };
const STATUS_OPTIONS = ['open', 'mitigating', 'accepted', 'closed'];
const STATUS_COLORS = { open: '#DE350B', mitigating: '#FF8B00', accepted: '#FFE380', closed: '#97A0AF' };
const STATUS_TEXT_COLORS = { open: '#fff', mitigating: '#fff', accepted: '#172B4D', closed: '#fff' };

function scoreColor(score) {
  if (score <= 4) return { bg: '#36B37E', text: '#fff' };
  if (score <= 8) return { bg: '#FFE380', text: '#172B4D' };
  if (score <= 14) return { bg: '#FF8B00', text: '#fff' };
  return { bg: '#DE350B', text: '#fff' };
}

function cellBg(prob, impact) {
  return scoreColor(prob * impact).bg;
}

function dotColor(value) {
  if (value <= 1) return '#36B37E';
  if (value <= 2) return '#57D9A3';
  if (value <= 3) return '#FFE380';
  if (value <= 4) return '#FF8B00';
  return '#DE350B';
}

export default function RisksModule({ risks, onSaveRisk, onDeleteRisk }) {
  const [showModal, setShowModal] = useState(false);
  const [editingRisk, setEditingRisk] = useState(null);
  const [viewMode, setViewMode] = useState('list'); // 'list' | 'matrix'

  function openCreate() {
    setEditingRisk(null);
    setShowModal(true);
  }

  function openEdit(risk) {
    setEditingRisk(risk);
    setShowModal(true);
  }

  function handleDelete(risk) {
    if (window.confirm(`Delete risk "${risk.title}"? This cannot be undone.`)) {
      onDeleteRisk(risk.id);
    }
  }

  function closeModal() {
    setShowModal(false);
    setEditingRisk(null);
  }

  function handleSave(riskData) {
    onSaveRisk(riskData);
    closeModal();
  }

  const sorted = [...risks].sort((a, b) => {
    const sa = (a.probability || 1) * (a.impact || 1);
    const sb = (b.probability || 1) * (b.impact || 1);
    if (sb !== sa) return sb - sa;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Risks</h2>
          <p style={styles.subtitle}>Track risks to your delivery with a probability/impact matrix.</p>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.viewToggle}>
            <button
              style={{ ...styles.toggleBtn, ...(viewMode === 'list' ? styles.toggleBtnActive : {}) }}
              onClick={() => setViewMode('list')}
            >List</button>
            <button
              style={{ ...styles.toggleBtn, ...(viewMode === 'matrix' ? styles.toggleBtnActive : {}) }}
              onClick={() => setViewMode('matrix')}
            >Matrix</button>
          </div>
          <button style={styles.createBtn} onClick={openCreate}>+ Create risk</button>
        </div>
      </div>

      {risks.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>&#9888;&#65039;</div>
          <p style={styles.emptyTitle}>No risks logged yet</p>
          <p style={styles.emptyText}>Track risks to your delivery here.</p>
          <button style={styles.createBtn} onClick={openCreate}>+ Create risk</button>
        </div>
      ) : viewMode === 'list' ? (
        <RiskTable risks={sorted} onEdit={openEdit} onDelete={handleDelete} />
      ) : (
        <RiskMatrix risks={risks} onEdit={openEdit} />
      )}

      {showModal && (
        <RiskModal
          risk={editingRisk}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

/* ── List View ─────────────────────────────────────────────────────────────── */

function RiskTable({ risks, onEdit, onDelete }) {
  const [hoveredRow, setHoveredRow] = useState(null);

  return (
    <div style={styles.tableWrap}>
      <table style={styles.table}>
        <thead>
          <tr>
            <th style={styles.th}>Title</th>
            <th style={{ ...styles.th, width: '90px', textAlign: 'center' }}>Probability</th>
            <th style={{ ...styles.th, width: '80px', textAlign: 'center' }}>Impact</th>
            <th style={{ ...styles.th, width: '70px', textAlign: 'center' }}>Score</th>
            <th style={{ ...styles.th, width: '90px', textAlign: 'center' }}>Status</th>
            <th style={{ ...styles.th, width: '100px' }}>Owner</th>
            <th style={{ ...styles.th, width: '70px', textAlign: 'center' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {risks.map(risk => {
            const score = (risk.probability || 1) * (risk.impact || 1);
            const sc = scoreColor(score);
            const isHovered = hoveredRow === risk.id;
            return (
              <tr
                key={risk.id}
                style={{ ...styles.tr, background: isHovered ? '#F4F5F7' : '#fff', cursor: 'pointer' }}
                onMouseEnter={() => setHoveredRow(risk.id)}
                onMouseLeave={() => setHoveredRow(null)}
                onClick={() => onEdit(risk)}
              >
                <td style={styles.td}>
                  <span style={styles.riskTitle}>{risk.title}</span>
                </td>
                <td style={{ ...styles.td, textAlign: 'center' }}>
                  <span style={{ ...styles.dot, background: dotColor(risk.probability) }} />
                  <span style={styles.dimText}>{risk.probability} - {PROB_LABELS[risk.probability]}</span>
                </td>
                <td style={{ ...styles.td, textAlign: 'center' }}>
                  <span style={{ ...styles.dot, background: dotColor(risk.impact) }} />
                  <span style={styles.dimText}>{risk.impact} - {IMPACT_LABELS[risk.impact]}</span>
                </td>
                <td style={{ ...styles.td, textAlign: 'center' }}>
                  <span style={{ ...styles.scoreChip, background: sc.bg, color: sc.text }}>{score}</span>
                </td>
                <td style={{ ...styles.td, textAlign: 'center' }}>
                  <span style={{
                    ...styles.statusBadge,
                    background: STATUS_COLORS[risk.status] || '#97A0AF',
                    color: STATUS_TEXT_COLORS[risk.status] || '#fff',
                  }}>{risk.status}</span>
                </td>
                <td style={styles.td}>
                  <span style={styles.dimText}>{risk.owner || '\u2014'}</span>
                </td>
                <td style={{ ...styles.td, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                  <button style={styles.actionBtn} onClick={() => onEdit(risk)} title="Edit">&#9998;</button>
                  <button style={{ ...styles.actionBtn, color: '#DE350B' }} onClick={() => onDelete(risk)} title="Delete">&#128465;</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Matrix View ───────────────────────────────────────────────────────────── */

function RiskMatrix({ risks, onEdit }) {
  // Build a map: `${prob}-${impact}` -> [risk, ...]
  const cellMap = {};
  for (const risk of risks) {
    const key = `${risk.probability}-${risk.impact}`;
    if (!cellMap[key]) cellMap[key] = [];
    cellMap[key].push(risk);
  }

  const probRows = [5, 4, 3, 2, 1]; // top to bottom
  const impactCols = [1, 2, 3, 4, 5]; // left to right

  return (
    <div style={styles.matrixContainer}>
      <div style={styles.matrixYLabelWrap}>
        <span style={styles.matrixAxisLabel}>Probability</span>
      </div>
      <div style={styles.matrixGrid}>
        {/* Y-axis labels */}
        <div style={styles.matrixYAxis}>
          {probRows.map(p => (
            <div key={p} style={styles.matrixYCell}>
              <span style={styles.matrixYNum}>{p}</span>
              <span style={styles.matrixYText}>{PROB_LABELS[p]}</span>
            </div>
          ))}
        </div>

        {/* Grid body */}
        <div style={styles.matrixBody}>
          {probRows.map(prob => (
            <div key={prob} style={styles.matrixRow}>
              {impactCols.map(impact => {
                const key = `${prob}-${impact}`;
                const cellRisks = cellMap[key] || [];
                const bg = cellBg(prob, impact);
                return (
                  <div key={key} style={{ ...styles.matrixCell, background: bg }}>
                    {cellRisks.map(risk => (
                      <button
                        key={risk.id}
                        style={styles.matrixPill}
                        onClick={() => onEdit(risk)}
                        title={`${risk.title} (Score: ${prob * impact})`}
                      >
                        {risk.title.length > 18 ? risk.title.slice(0, 17) + '\u2026' : risk.title}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}

          {/* X-axis labels */}
          <div style={styles.matrixXAxis}>
            {impactCols.map(i => (
              <div key={i} style={styles.matrixXCell}>
                <span style={styles.matrixXNum}>{i}</span>
                <span style={styles.matrixXText}>{IMPACT_LABELS[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={styles.matrixXLabelWrap}>
        <span style={styles.matrixAxisLabel}>Impact</span>
      </div>
    </div>
  );
}

/* ── Modal ──────────────────────────────────────────────────────────────────── */

function RiskModal({ risk, onSave, onClose }) {
  const [title, setTitle] = useState(risk?.title || '');
  const [description, setDescription] = useState(risk?.description || '');
  const [probability, setProbability] = useState(risk?.probability || 3);
  const [impact, setImpact] = useState(risk?.impact || 3);
  const [status, setStatus] = useState(risk?.status || 'open');
  const [owner, setOwner] = useState(risk?.owner || '');
  const [mitigation, setMitigation] = useState(risk?.mitigation || '');
  const [linkedIssueKeys, setLinkedIssueKeys] = useState(
    (risk?.linkedIssueKeys || []).join(', ')
  );

  function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) return;
    const riskData = {
      ...(risk?.id ? { id: risk.id } : {}),
      ...(risk?.createdAt ? { createdAt: risk.createdAt } : {}),
      title: title.trim(),
      description: description.trim(),
      probability: Number(probability),
      impact: Number(impact),
      status,
      owner: owner.trim(),
      mitigation: mitigation.trim(),
      linkedIssueKeys: linkedIssueKeys
        .split(',')
        .map(k => k.trim())
        .filter(Boolean),
    };
    onSave(riskData);
  }

  const score = Number(probability) * Number(impact);
  const sc = scoreColor(score);

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{risk ? 'Edit Risk' : 'Create Risk'}</h3>
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
              placeholder="e.g. Key vendor may not deliver on time"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Description</label>
            <textarea
              style={{ ...styles.formInput, minHeight: '56px', resize: 'vertical' }}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Describe the risk..."
            />
          </div>

          <div style={styles.formRow}>
            <div style={{ flex: 1 }}>
              <label style={styles.formLabel}>Probability</label>
              <select style={styles.formSelect} value={probability} onChange={e => setProbability(e.target.value)}>
                {[1, 2, 3, 4, 5].map(v => (
                  <option key={v} value={v}>{v} - {PROB_LABELS[v]}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={styles.formLabel}>Impact</label>
              <select style={styles.formSelect} value={impact} onChange={e => setImpact(e.target.value)}>
                {[1, 2, 3, 4, 5].map(v => (
                  <option key={v} value={v}>{v} - {IMPACT_LABELS[v]}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 0.7, textAlign: 'center' }}>
              <label style={styles.formLabel}>Score</label>
              <div style={{ ...styles.scoreChipLarge, background: sc.bg, color: sc.text }}>{score}</div>
            </div>
          </div>

          <div style={styles.formRow}>
            <div style={{ flex: 1 }}>
              <label style={styles.formLabel}>Status</label>
              <select style={styles.formSelect} value={status} onChange={e => setStatus(e.target.value)}>
                {STATUS_OPTIONS.map(s => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
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
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Mitigation Plan</label>
            <textarea
              style={{ ...styles.formInput, minHeight: '56px', resize: 'vertical' }}
              value={mitigation}
              onChange={e => setMitigation(e.target.value)}
              placeholder="How will this risk be mitigated?"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Linked Issue Keys</label>
            <input
              style={styles.formInput}
              value={linkedIssueKeys}
              onChange={e => setLinkedIssueKeys(e.target.value)}
              placeholder="e.g. PROJ-123, PROJ-456"
            />
            <span style={styles.formHint}>Comma-separated Jira issue keys</span>
          </div>

          <div style={styles.modalFooter}>
            <button type="button" style={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={styles.saveBtn} disabled={!title.trim()}>
              {risk ? 'Save Changes' : 'Create Risk'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────────────── */

const styles = {
  container: {
    flex: 1, overflow: 'auto', padding: '24px 32px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: '24px', gap: '16px', flexWrap: 'wrap',
  },
  title: { margin: 0, fontSize: '20px', fontWeight: 700, color: '#172B4D' },
  subtitle: { margin: '4px 0 0', fontSize: '13px', color: '#6B778C' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 },
  createBtn: {
    background: '#0073ea', color: '#fff', border: 'none', borderRadius: '6px',
    padding: '8px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
    whiteSpace: 'nowrap',
  },
  viewToggle: {
    display: 'flex', border: '1px solid #DFE1E6', borderRadius: '6px', overflow: 'hidden',
  },
  toggleBtn: {
    background: '#fff', border: 'none', padding: '6px 14px', cursor: 'pointer',
    fontSize: '12px', fontWeight: 600, color: '#6B778C',
  },
  toggleBtnActive: {
    background: '#0073ea', color: '#fff',
  },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '64px 24px', textAlign: 'center',
  },
  emptyIcon: { fontSize: '48px', marginBottom: '12px', opacity: 0.6 },
  emptyTitle: { margin: 0, fontSize: '16px', fontWeight: 600, color: '#172B4D' },
  emptyText: { margin: '8px 0 20px', fontSize: '13px', color: '#6B778C' },

  // Table
  tableWrap: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '13px' },
  th: {
    textAlign: 'left', padding: '8px 10px', fontSize: '11px', fontWeight: 600,
    color: '#6B778C', textTransform: 'uppercase', letterSpacing: '0.3px',
    borderBottom: '2px solid #DFE1E6', whiteSpace: 'nowrap',
  },
  tr: { borderBottom: '1px solid #F4F5F7', transition: 'background 0.1s' },
  td: { padding: '10px 10px', verticalAlign: 'middle' },
  riskTitle: { fontWeight: 600, color: '#172B4D' },
  dimText: { fontSize: '12px', color: '#6B778C' },
  dot: {
    display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%',
    marginRight: '5px', verticalAlign: 'middle',
  },
  scoreChip: {
    display: 'inline-block', padding: '2px 10px', borderRadius: '10px',
    fontSize: '12px', fontWeight: 700, minWidth: '28px', textAlign: 'center',
  },
  statusBadge: {
    display: 'inline-block', padding: '2px 10px', borderRadius: '10px',
    fontSize: '11px', fontWeight: 600, textTransform: 'capitalize',
  },
  actionBtn: {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px',
    padding: '4px 6px', borderRadius: '4px', color: '#6B778C', lineHeight: 1,
  },

  // Matrix
  matrixContainer: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0',
  },
  matrixYLabelWrap: {
    display: 'flex', alignItems: 'center', marginBottom: '4px',
  },
  matrixXLabelWrap: {
    display: 'flex', justifyContent: 'center', marginTop: '4px',
  },
  matrixAxisLabel: {
    fontSize: '12px', fontWeight: 700, color: '#42526E', textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  matrixGrid: { display: 'flex', gap: '0px' },
  matrixYAxis: {
    display: 'flex', flexDirection: 'column', justifyContent: 'stretch', marginRight: '6px',
  },
  matrixYCell: {
    flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
    justifyContent: 'center', paddingRight: '6px', minHeight: '80px',
  },
  matrixYNum: { fontSize: '13px', fontWeight: 700, color: '#172B4D' },
  matrixYText: { fontSize: '10px', color: '#6B778C', whiteSpace: 'nowrap' },
  matrixBody: { display: 'flex', flexDirection: 'column' },
  matrixRow: { display: 'flex' },
  matrixCell: {
    width: '120px', minHeight: '80px', border: '1px solid rgba(255,255,255,0.5)',
    padding: '4px', display: 'flex', flexDirection: 'column', gap: '3px',
    alignItems: 'stretch', borderRadius: '2px',
  },
  matrixPill: {
    background: 'rgba(255,255,255,0.85)', border: 'none', borderRadius: '4px',
    padding: '3px 6px', fontSize: '11px', fontWeight: 500, color: '#172B4D',
    cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden',
    textOverflow: 'ellipsis', lineHeight: 1.3,
  },
  matrixXAxis: { display: 'flex' },
  matrixXCell: {
    width: '120px', textAlign: 'center', paddingTop: '6px',
  },
  matrixXNum: { fontSize: '13px', fontWeight: 700, color: '#172B4D', display: 'block' },
  matrixXText: { fontSize: '10px', color: '#6B778C' },

  // Modal
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(9, 30, 66, 0.54)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: '8px', width: '560px', maxWidth: '90vw',
    maxHeight: '85vh', display: 'flex', flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
  },
  modalHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderBottom: '1px solid #DFE1E6',
  },
  modalTitle: { margin: 0, fontSize: '16px', fontWeight: 600, color: '#172B4D' },
  modalCloseBtn: {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: '20px',
    color: '#6B778C', padding: '4px 8px', lineHeight: 1,
  },
  modalBody: { padding: '20px', overflowY: 'auto', flex: 1 },
  formGroup: { marginBottom: '16px' },
  formRow: { display: 'flex', gap: '12px', marginBottom: '16px' },
  formLabel: { display: 'block', fontSize: '12px', fontWeight: 600, color: '#42526E', marginBottom: '4px' },
  formInput: {
    width: '100%', border: '1px solid #DFE1E6', borderRadius: '4px',
    padding: '8px 10px', fontSize: '13px', outline: 'none', color: '#172B4D',
    boxSizing: 'border-box',
  },
  formSelect: {
    width: '100%', border: '1px solid #DFE1E6', borderRadius: '4px',
    padding: '8px 10px', fontSize: '13px', outline: 'none', color: '#172B4D',
    boxSizing: 'border-box', background: '#fff',
  },
  formHint: { fontSize: '11px', color: '#97A0AF', marginTop: '3px', display: 'block' },
  scoreChipLarge: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '6px 14px', borderRadius: '10px', fontSize: '16px', fontWeight: 700,
    marginTop: '2px',
  },
  modalFooter: {
    display: 'flex', justifyContent: 'flex-end', gap: '8px',
    paddingTop: '16px', borderTop: '1px solid #F4F5F7', marginTop: '8px',
  },
  cancelBtn: {
    background: 'none', border: '1px solid #DFE1E6', borderRadius: '6px',
    padding: '8px 16px', cursor: 'pointer', fontSize: '13px', color: '#42526E', fontWeight: 500,
  },
  saveBtn: {
    background: '#0073ea', color: '#fff', border: 'none', borderRadius: '6px',
    padding: '8px 20px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
  },
};
