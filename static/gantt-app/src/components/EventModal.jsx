import React, { useState, useEffect } from 'react';

const EVENT_TYPES = [
  { value: 'oncall',   label: '🔔 On-Call' },
  { value: 'vacation', label: '🏖️ Vacation' },
  { value: 'ooo',      label: 'OOO (Out of Office)' },
  { value: 'custom',   label: '📌 Custom' },
];

export default function EventModal({
  event,
  groupByField1, groupByField2,
  groupByField1Label, groupByField2Label,
  groupOptions1, groupOptions2,
  initialStartDate, initialEndDate,
  initialGroup1Value, initialGroup2Value,
  onSave, onClose,
}) {
  const isEdit = Boolean(event?.id);

  // Derive initial values: editing event takes priority, then pendingCreate pre-fill, then defaults
  const getInitial1 = () => {
    if (event?.groupValues?.[groupByField1]) return event.groupValues[groupByField1];
    if (event?.squad) return event.squad;
    if (initialGroup1Value) return initialGroup1Value;
    return groupOptions1?.[0] || '';
  };
  const getInitial2 = () => {
    if (event?.groupValues?.[groupByField2]) return event.groupValues[groupByField2];
    if (event?.developer) return event.developer;
    if (initialGroup2Value) return initialGroup2Value;
    return groupOptions2?.[0] || '';
  };

  const [type, setType]           = useState(event?.type || 'oncall');
  const [title, setTitle]         = useState(event?.title || '');
  const [summary, setSummary]     = useState(event?.summary || '');
  const [group1Val, setGroup1Val] = useState(getInitial1);
  const [group2Val, setGroup2Val] = useState(getInitial2);
  const [startDate, setStartDate] = useState(event?.startDate || initialStartDate || '');
  const [endDate, setEndDate]     = useState(event?.endDate   || initialEndDate   || '');
  const [saving, setSaving]       = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Auto-fill title for non-custom types
  useEffect(() => {
    if (type !== 'custom') {
      const typeObj = EVENT_TYPES.find(t => t.value === type);
      if (typeObj) setTitle(typeObj.label.replace(/^[^\s]+\s?/, '').trim());
    }
  }, [type]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!startDate || !endDate) return;
    setSaving(true);
    try {
      const resolvedTitle = type === 'custom'
        ? title
        : (EVENT_TYPES.find(t => t.value === type)?.label.replace(/^[^\s]+\s?/, '').trim() || type);

      await onSave({
        ...(event || {}),
        type,
        title: resolvedTitle,
        summary,
        groupValues: {
          [groupByField1]: group1Val,
          [groupByField2]: group2Val,
        },
        startDate,
        endDate,
      });
    } finally {
      setSaving(false);
    }
  }

  const label1 = groupByField1Label || groupByField1 || 'Group';
  const label2 = groupByField2Label || groupByField2 || 'Sub-group';

  return (
    <div style={overlay}>
      <div style={modal}>
        <div style={header}>
          <span style={headerTitle}>{isEdit ? 'Edit Event' : 'Add Event'}</span>
          <button style={closeBtn} onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={form}>
          {/* Type */}
          <label style={fieldLabel}>
            <span style={labelText}>Type</span>
            <select style={input} value={type} onChange={e => setType(e.target.value)}>
              {EVENT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>

          {/* Custom title */}
          {type === 'custom' && (
            <label style={fieldLabel}>
              <span style={labelText}>Title</span>
              <input
                style={input}
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Event title"
                required
              />
            </label>
          )}

          {/* Summary / notes — always visible */}
          <label style={fieldLabel}>
            <span style={labelText}>Summary <span style={{ fontWeight: 400, textTransform: 'none', color: '#97A0AF' }}>(optional)</span></span>
            <input
              style={input}
              type="text"
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="Short description or notes…"
            />
          </label>

          {/* Dynamic group fields */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label style={fieldLabel}>
              <span style={labelText}>{label1}</span>
              {groupOptions1?.length > 0 ? (
                <select style={input} value={group1Val} onChange={e => setGroup1Val(e.target.value)}>
                  <option value="">— Select —</option>
                  {groupOptions1.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input style={input} type="text" value={group1Val} onChange={e => setGroup1Val(e.target.value)} placeholder={label1} />
              )}
            </label>

            <label style={fieldLabel}>
              <span style={labelText}>{label2}</span>
              {groupOptions2?.length > 0 ? (
                <select style={input} value={group2Val} onChange={e => setGroup2Val(e.target.value)}>
                  <option value="">— Select —</option>
                  {groupOptions2.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              ) : (
                <input style={input} type="text" value={group2Val} onChange={e => setGroup2Val(e.target.value)} placeholder={label2} />
              )}
            </label>
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <label style={fieldLabel}>
              <span style={labelText}>Start date</span>
              <input style={input} type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
            </label>
            <label style={fieldLabel}>
              <span style={labelText}>End date</span>
              <input style={input} type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required />
            </label>
          </div>

          {/* Actions */}
          <div style={actions}>
            <button type="button" style={cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" style={saveBtn} disabled={saving}>
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const overlay = {
  position: 'fixed', inset: 0, background: 'rgba(9,30,66,0.54)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000,
};
const modal = {
  background: '#fff', borderRadius: '8px', width: '420px', maxWidth: '90vw',
  boxShadow: '0 8px 32px rgba(0,0,0,0.3)', overflow: 'hidden',
};
const header = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '16px 20px', borderBottom: '1px solid #DFE1E6',
};
const headerTitle = { fontWeight: 700, fontSize: '16px', color: '#172B4D' };
const closeBtn = {
  background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px',
  color: '#6B778C', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: '4px',
};
const form = { padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' };
const fieldLabel = { display: 'flex', flexDirection: 'column', gap: '4px' };
const labelText = { fontSize: '11px', fontWeight: 600, color: '#6B778C', textTransform: 'uppercase', letterSpacing: '0.4px' };
const input = {
  border: '1px solid #DFE1E6', borderRadius: '4px', padding: '7px 10px',
  fontSize: '13px', color: '#172B4D', background: '#fff', outline: 'none',
};
const actions = { display: 'flex', justifyContent: 'flex-end', gap: '8px', paddingTop: '4px' };
const cancelBtn = {
  background: 'none', border: '1px solid #DFE1E6', borderRadius: '4px',
  padding: '7px 16px', cursor: 'pointer', fontSize: '13px', color: '#172B4D',
};
const saveBtn = {
  background: '#0052CC', color: '#fff', border: 'none', borderRadius: '4px',
  padding: '7px 16px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
};
