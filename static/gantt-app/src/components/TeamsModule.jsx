import React, { useState } from 'react';

const EMPTY_MEMBER = { displayName: '', accountId: '', role: '', weeklyCapacityHours: 40 };

export default function TeamsModule({ teams, onSaveTeam, onDeleteTeam }) {
  const [showModal, setShowModal] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);

  function openCreate() {
    setEditingTeam(null);
    setShowModal(true);
  }

  function openEdit(team) {
    setEditingTeam(team);
    setShowModal(true);
  }

  function handleDelete(team) {
    if (window.confirm(`Delete team "${team.name}"? This cannot be undone.`)) {
      onDeleteTeam(team.id);
    }
  }

  function closeModal() {
    setShowModal(false);
    setEditingTeam(null);
  }

  function handleSave(teamData) {
    onSaveTeam(teamData);
    closeModal();
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Teams</h2>
          <p style={styles.subtitle}>Manage teams and member capacity for resource planning.</p>
        </div>
        <button style={styles.createBtn} onClick={openCreate}>+ Create team</button>
      </div>

      {teams.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>&#128101;</div>
          <p style={styles.emptyTitle}>No teams yet</p>
          <p style={styles.emptyText}>Create your first team to manage capacity.</p>
          <button style={styles.createBtn} onClick={openCreate}>+ Create team</button>
        </div>
      ) : (
        <div style={styles.grid}>
          {teams.map(team => (
            <TeamCard
              key={team.id}
              team={team}
              onEdit={() => openEdit(team)}
              onDelete={() => handleDelete(team)}
            />
          ))}
        </div>
      )}

      {showModal && (
        <TeamModal
          team={editingTeam}
          onSave={handleSave}
          onClose={closeModal}
        />
      )}
    </div>
  );
}

function TeamCard({ team, onEdit, onDelete }) {
  const [hovering, setHovering] = useState(false);
  const memberCount = (team.members || []).length;
  const totalCapacity = (team.members || []).reduce((sum, m) => sum + (m.weeklyCapacityHours || 0), 0);

  return (
    <div
      style={{ ...styles.card, boxShadow: hovering ? '0 4px 12px rgba(0,0,0,0.1)' : '0 1px 3px rgba(0,0,0,0.06)' }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      <div style={styles.cardHeader}>
        <div style={styles.cardTitleRow}>
          <span style={styles.cardIcon}>&#128101;</span>
          <h3 style={styles.cardTitle}>{team.name}</h3>
        </div>
        <div style={styles.cardActions}>
          <button style={styles.cardActionBtn} onClick={onEdit} title="Edit team">&#9998;</button>
          <button style={{ ...styles.cardActionBtn, color: '#DE350B' }} onClick={onDelete} title="Delete team">&#128465;</button>
        </div>
      </div>

      {team.description && (
        <p style={styles.cardDesc}>{team.description}</p>
      )}

      <div style={styles.cardStats}>
        <span style={styles.statBadge}>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
        <span style={styles.statBadge}>{totalCapacity} hrs/wk</span>
      </div>

      {memberCount > 0 && (
        <div style={styles.memberList}>
          {team.members.map((m, idx) => (
            <div key={idx} style={styles.memberRow}>
              <span style={styles.memberAvatar}>{(m.displayName || '?')[0].toUpperCase()}</span>
              <div style={styles.memberInfo}>
                <span style={styles.memberName}>{m.displayName || 'Unnamed'}</span>
                <span style={styles.memberMeta}>
                  {m.role && <span style={styles.roleBadge}>{m.role}</span>}
                  <span style={styles.capacityText}>{m.weeklyCapacityHours || 0}h/wk</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TeamModal({ team, onSave, onClose }) {
  const [name, setName] = useState(team?.name || '');
  const [description, setDescription] = useState(team?.description || '');
  const [members, setMembers] = useState(
    team?.members?.length ? team.members.map(m => ({ ...m })) : [{ ...EMPTY_MEMBER }]
  );

  function addMember() {
    setMembers(prev => [...prev, { ...EMPTY_MEMBER }]);
  }

  function removeMember(idx) {
    setMembers(prev => prev.filter((_, i) => i !== idx));
  }

  function updateMember(idx, field, value) {
    setMembers(prev => prev.map((m, i) => i === idx ? { ...m, [field]: value } : m));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    const teamData = {
      ...(team?.id ? { id: team.id } : {}),
      name: name.trim(),
      description: description.trim(),
      members: members
        .filter(m => m.displayName.trim())
        .map(m => ({
          accountId: m.accountId?.trim() || '',
          displayName: m.displayName.trim(),
          role: m.role?.trim() || '',
          weeklyCapacityHours: Number(m.weeklyCapacityHours) || 40,
        })),
    };
    onSave(teamData);
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={e => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{team ? 'Edit Team' : 'Create Team'}</h3>
          <button style={styles.modalCloseBtn} onClick={onClose}>&times;</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.modalBody}>
          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Team Name *</label>
            <input
              autoFocus
              style={styles.formInput}
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Platform Team"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.formLabel}>Description</label>
            <textarea
              style={{ ...styles.formInput, minHeight: '60px', resize: 'vertical' }}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional description..."
            />
          </div>

          <div style={styles.formGroup}>
            <div style={styles.membersHeader}>
              <label style={styles.formLabel}>Members</label>
              <button type="button" style={styles.addMemberBtn} onClick={addMember}>+ Add member</button>
            </div>

            <div style={styles.membersTableHeader}>
              <span style={{ flex: 2 }}>Name</span>
              <span style={{ flex: 2 }}>Account ID</span>
              <span style={{ flex: 1.5 }}>Role</span>
              <span style={{ flex: 0.8, textAlign: 'center' }}>Hrs/Wk</span>
              <span style={{ width: '28px' }}></span>
            </div>

            {members.map((m, idx) => (
              <div key={idx} style={styles.memberFormRow}>
                <input
                  style={{ ...styles.memberFormInput, flex: 2 }}
                  value={m.displayName}
                  onChange={e => updateMember(idx, 'displayName', e.target.value)}
                  placeholder="Display name"
                />
                <input
                  style={{ ...styles.memberFormInput, flex: 2 }}
                  value={m.accountId}
                  onChange={e => updateMember(idx, 'accountId', e.target.value)}
                  placeholder="Optional"
                />
                <input
                  style={{ ...styles.memberFormInput, flex: 1.5 }}
                  value={m.role}
                  onChange={e => updateMember(idx, 'role', e.target.value)}
                  placeholder="e.g. Engineer"
                />
                <input
                  style={{ ...styles.memberFormInput, flex: 0.8, textAlign: 'center' }}
                  type="number"
                  min="0"
                  max="168"
                  value={m.weeklyCapacityHours}
                  onChange={e => updateMember(idx, 'weeklyCapacityHours', e.target.value)}
                />
                <button
                  type="button"
                  style={styles.removeMemberBtn}
                  onClick={() => removeMember(idx)}
                  title="Remove member"
                >&minus;</button>
              </div>
            ))}
          </div>

          <div style={styles.modalFooter}>
            <button type="button" style={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={styles.saveBtn} disabled={!name.trim()}>
              {team ? 'Save Changes' : 'Create Team'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const styles = {
  container: {
    flex: 1, overflow: 'auto', padding: '24px 32px',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: '24px', gap: '16px',
  },
  title: { margin: 0, fontSize: '20px', fontWeight: 700, color: '#172B4D' },
  subtitle: { margin: '4px 0 0', fontSize: '13px', color: '#6B778C' },
  createBtn: {
    background: '#0073ea', color: '#fff', border: 'none', borderRadius: '6px',
    padding: '8px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
    whiteSpace: 'nowrap', flexShrink: 0,
  },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '64px 24px', textAlign: 'center',
  },
  emptyIcon: { fontSize: '48px', marginBottom: '12px', opacity: 0.6 },
  emptyTitle: { margin: 0, fontSize: '16px', fontWeight: 600, color: '#172B4D' },
  emptyText: { margin: '8px 0 20px', fontSize: '13px', color: '#6B778C' },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: '16px',
  },
  card: {
    background: '#fff', borderRadius: '8px', border: '1px solid #DFE1E6',
    padding: '16px', transition: 'box-shadow 0.15s',
  },
  cardHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '8px',
  },
  cardTitleRow: { display: 'flex', alignItems: 'center', gap: '8px' },
  cardIcon: { fontSize: '18px' },
  cardTitle: { margin: 0, fontSize: '15px', fontWeight: 600, color: '#172B4D' },
  cardActions: { display: 'flex', gap: '4px' },
  cardActionBtn: {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px',
    padding: '4px 6px', borderRadius: '4px', color: '#6B778C', lineHeight: 1,
  },
  cardDesc: { margin: '0 0 10px', fontSize: '12px', color: '#6B778C', lineHeight: 1.4 },
  cardStats: { display: 'flex', gap: '8px', marginBottom: '12px' },
  statBadge: {
    fontSize: '11px', fontWeight: 600, color: '#0073ea', background: '#DEEBFF',
    borderRadius: '10px', padding: '3px 10px',
  },
  memberList: { borderTop: '1px solid #F4F5F7', paddingTop: '8px' },
  memberRow: {
    display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 0',
  },
  memberAvatar: {
    width: '26px', height: '26px', borderRadius: '50%', background: '#DEEBFF',
    color: '#0073ea', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '11px', fontWeight: 700, flexShrink: 0,
  },
  memberInfo: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 },
  memberName: { fontSize: '12px', fontWeight: 500, color: '#172B4D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  memberMeta: { display: 'flex', alignItems: 'center', gap: '6px' },
  roleBadge: {
    fontSize: '10px', fontWeight: 600, color: '#6554C0', background: '#EAE6FF',
    borderRadius: '3px', padding: '1px 5px',
  },
  capacityText: { fontSize: '10px', color: '#6B778C' },

  // Modal
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(9, 30, 66, 0.54)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: 1000,
  },
  modal: {
    background: '#fff', borderRadius: '8px', width: '600px', maxWidth: '90vw',
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
  formLabel: { display: 'block', fontSize: '12px', fontWeight: 600, color: '#42526E', marginBottom: '4px' },
  formInput: {
    width: '100%', border: '1px solid #DFE1E6', borderRadius: '4px',
    padding: '8px 10px', fontSize: '13px', outline: 'none', color: '#172B4D',
    boxSizing: 'border-box',
  },
  membersHeader: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: '8px',
  },
  addMemberBtn: {
    background: 'none', border: '1px solid #0073ea', borderRadius: '4px',
    padding: '4px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
    color: '#0073ea',
  },
  membersTableHeader: {
    display: 'flex', gap: '6px', padding: '4px 0', marginBottom: '4px',
    fontSize: '10px', fontWeight: 600, color: '#6B778C', textTransform: 'uppercase',
    letterSpacing: '0.3px',
  },
  memberFormRow: { display: 'flex', gap: '6px', marginBottom: '6px', alignItems: 'center' },
  memberFormInput: {
    border: '1px solid #DFE1E6', borderRadius: '4px', padding: '6px 8px',
    fontSize: '12px', outline: 'none', color: '#172B4D', minWidth: 0,
    boxSizing: 'border-box',
  },
  removeMemberBtn: {
    background: 'none', border: '1px solid #DFE1E6', borderRadius: '4px',
    width: '28px', height: '28px', cursor: 'pointer', fontSize: '14px',
    color: '#DE350B', display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0, lineHeight: 1,
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
