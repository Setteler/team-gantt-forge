import React, { useState } from 'react';

function filterFields(list, search) {
  if (!search) return list;
  const q = search.toLowerCase();
  return list.filter(f => f.name.toLowerCase().includes(q) || f.id.toLowerCase().includes(q));
}

function FieldSelect({ value, onChange, search, onSearchChange, placeholder, sysFields, custFields }) {
  const filtered1 = filterFields(sysFields, search);
  const filtered2 = filterFields(custFields, search);

  return (
    <div style={{ border: '1px solid #DFE1E6', borderRadius: '4px', overflow: 'hidden' }}>
      <input
        style={styles.fieldSearch}
        placeholder={placeholder || 'Search fields…'}
        value={search}
        onChange={e => onSearchChange(e.target.value)}
      />
      <div style={styles.fieldList}>
        {filtered1.length > 0 && (
          <>
            <div style={styles.fieldGroupLabel}>Standard fields</div>
            {filtered1.map(f => (
              <div
                key={f.id}
                style={{ ...styles.fieldOption, background: value === f.id ? '#DEEBFF' : 'transparent', color: value === f.id ? '#0052CC' : '#172B4D' }}
                onClick={() => onChange(f.id)}
              >
                <span style={styles.fieldName}>{f.name}</span>
                <span style={styles.fieldId}>{f.id}</span>
              </div>
            ))}
          </>
        )}
        {filtered2.length > 0 && (
          <>
            <div style={styles.fieldGroupLabel}>Custom fields</div>
            {filtered2.map(f => (
              <div
                key={f.id}
                style={{ ...styles.fieldOption, background: value === f.id ? '#DEEBFF' : 'transparent', color: value === f.id ? '#0052CC' : '#172B4D' }}
                onClick={() => onChange(f.id)}
              >
                <span style={styles.fieldName}>{f.name}</span>
                <span style={styles.fieldId}>{f.id}</span>
              </div>
            ))}
          </>
        )}
        {filtered1.length === 0 && filtered2.length === 0 && (
          <div style={{ padding: '8px 10px', color: '#97A0AF', fontSize: '12px' }}>No fields found</div>
        )}
      </div>
    </div>
  );
}

const ORDER_BY_OPTIONS = [
  { value: 'duedate',           label: 'Due Date' },
  { value: 'customfield_10015', label: 'Start Date' },
  { value: 'assignee',          label: 'Assignee' },
  { value: 'priority',          label: 'Priority' },
  { value: 'status',            label: 'Status' },
  { value: 'created',           label: 'Created' },
  { value: 'updated',           label: 'Updated' },
  { value: 'summary',           label: 'Summary' },
];

export default function ConfigPanel({
  availableProjects,
  availableFields,
  selectedProjects,
  statusFilter,
  jqlFilter,
  groupByField1,
  groupByField2,
  startDateField,
  endDateField,
  viewType,
  listFields,
  orderByField,
  orderByDir,
  onProjectsChange,
  onStatusFilterChange,
  onJqlFilterChange,
  onGroupByField1Change,
  onGroupByField2Change,
  onStartDateFieldChange,
  onEndDateFieldChange,
  onListFieldsChange,
  onViewTypeChange,
  onOrderByFieldChange,
  onOrderByDirChange,
  eventsOnly,
  onEventsOnlyChange,
  onSave,
  onClose,
  baselines,
  activeBaselineId,
  onCreateBaseline,
  onDeleteBaseline,
  onSetActiveBaseline,
  holidays,
  onSaveHolidays,
}) {
  const [fieldSearch1, setFieldSearch1]   = useState('');
  const [fieldSearch2, setFieldSearch2]   = useState('');
  const [dateSearch1, setDateSearch1]     = useState('');
  const [dateSearch2, setDateSearch2]     = useState('');
  const [colSearch, setColSearch]         = useState('');
  const [baselineName, setBaselineName]   = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('');
  const [newHolidayName, setNewHolidayName] = useState('');

  const isList = viewType === 'list';

  function toggleProject(key) {
    if (selectedProjects.includes(key)) {
      onProjectsChange(selectedProjects.filter(k => k !== key));
    } else {
      onProjectsChange([...selectedProjects, key]);
    }
  }

  const systemFields = (availableFields || []).filter(f => !f.custom);
  const customFields = (availableFields || []).filter(f => f.custom);

  const dateFields = (availableFields || []).filter(f =>
    f.schema?.type === 'date' || f.schema?.type === 'datetime' ||
    f.schemaType === 'date' || f.schemaType === 'datetime'
  );
  const dateSystemFields = dateFields.filter(f => !f.custom);
  const dateCustomFields = dateFields.filter(f => f.custom);

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <span style={styles.title}>Configure View</span>
        <button style={styles.closeBtn} onClick={onClose}>✕</button>
      </div>

      <div style={styles.body}>

        {/* View type toggle */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>View type</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { value: 'timeline', label: '▤ Timeline' },
              { value: 'list',     label: '≡ List' },
            ].map(opt => (
              <button
                key={opt.value}
                style={{
                  flex: 1, border: '1px solid', borderRadius: '4px', padding: '6px 8px',
                  cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                  background: viewType === opt.value ? '#0052CC' : '#fff',
                  color: viewType === opt.value ? '#fff' : '#6B778C',
                  borderColor: viewType === opt.value ? '#0052CC' : '#DFE1E6',
                }}
                onClick={() => onViewTypeChange(opt.value)}
              >{opt.label}</button>
            ))}
          </div>
        </div>

        {/* List columns — only for list views */}
        {isList && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Columns</div>
            <input
              style={{ ...styles.fieldSearch, border: '1px solid #DFE1E6', borderRadius: '4px', marginBottom: '4px' }}
              placeholder="Search columns…"
              value={colSearch}
              onChange={e => setColSearch(e.target.value)}
            />
            <div style={{ ...styles.fieldList, maxHeight: '200px', border: '1px solid #DFE1E6', borderRadius: '4px', overflow: 'auto' }}>
              {(availableFields || [])
                .filter(f => !colSearch || f.name.toLowerCase().includes(colSearch.toLowerCase()))
                .map(f => {
                  const checked = (listFields || []).includes(f.id);
                  return (
                    <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 10px', cursor: 'pointer', fontSize: '12px' }}>
                      <input type="checkbox" checked={checked} onChange={() => {
                        const cur = listFields || [];
                        onListFieldsChange(checked ? cur.filter(x => x !== f.id) : [...cur, f.id]);
                      }} />
                      <span style={styles.fieldName}>{f.name}</span>
                      <span style={styles.fieldId}>{f.id}</span>
                    </label>
                  );
                })
              }
            </div>
          </div>
        )}

        {/* Data source toggle */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Data source</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {[
              { value: false, label: '⬡ Jira issues + Events' },
              { value: true,  label: '★ Events only' },
            ].map(opt => (
              <button
                key={String(opt.value)}
                style={{
                  flex: 1, border: '1px solid', borderRadius: '4px', padding: '6px 8px',
                  cursor: 'pointer', fontSize: '12px', fontWeight: 600,
                  background: eventsOnly === opt.value ? '#0052CC' : '#fff',
                  color: eventsOnly === opt.value ? '#fff' : '#6B778C',
                  borderColor: eventsOnly === opt.value ? '#0052CC' : '#DFE1E6',
                }}
                onClick={() => onEventsOnlyChange(opt.value)}
              >{opt.label}</button>
            ))}
          </div>
          {eventsOnly && (
            <div style={{ fontSize: '11px', color: '#6B778C', background: '#f4f5f7', borderRadius: '4px', padding: '6px 10px' }}>
              Jira issues are hidden. Only custom events saved to this view will appear.
            </div>
          )}
        </div>

        {/* JQL Filter — hidden when events-only */}
        {!eventsOnly && <div style={styles.section}>
          <div style={styles.sectionTitle}>
            JQL Filter
            <span style={styles.sectionNote}> — overrides project/status selectors when set</span>
          </div>
          <textarea
            style={styles.jqlTextarea}
            placeholder={'project = MYPROJECT AND sprint in openSprints()\nLeave empty to use the project/status selectors below.'}
            value={jqlFilter}
            onChange={e => onJqlFilterChange(e.target.value)}
            spellCheck={false}
          />
          {jqlFilter.trim() && (
            <button style={styles.clearJqlBtn} onClick={() => onJqlFilterChange('')}>✕ Clear JQL</button>
          )}
        </div>}

        {/* Order by — shown when not using custom JQL */}
        {!eventsOnly && !jqlFilter.trim() && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Order by</div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <select
                value={orderByField || 'duedate'}
                onChange={e => onOrderByFieldChange(e.target.value)}
                style={{ flex: 1, border: '1px solid #DFE1E6', borderRadius: '4px', padding: '6px 8px', fontSize: '12px', color: '#172B4D', background: '#fff', outline: 'none' }}
              >
                {ORDER_BY_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: '4px' }}>
                {['ASC','DESC'].map(dir => (
                  <button key={dir}
                    style={{
                      border: '1px solid', borderRadius: '4px', padding: '6px 10px',
                      cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                      background: (orderByDir || 'ASC') === dir ? '#0052CC' : '#fff',
                      color: (orderByDir || 'ASC') === dir ? '#fff' : '#6B778C',
                      borderColor: (orderByDir || 'ASC') === dir ? '#0052CC' : '#DFE1E6',
                    }}
                    onClick={() => onOrderByDirChange(dir)}
                  >{dir === 'ASC' ? '↑ ASC' : '↓ DESC'}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Group by — shown for all view types */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Group rows by (first level)</div>
          <FieldSelect
            value={groupByField1}
            onChange={onGroupByField1Change}
            search={fieldSearch1}
            onSearchChange={setFieldSearch1}
            placeholder="Search fields…"
            sysFields={systemFields}
            custFields={customFields}
          />
        </div>

        <div style={styles.section}>
          <div style={styles.sectionTitle}>Group rows by (second level)</div>
          <FieldSelect
            value={groupByField2}
            onChange={onGroupByField2Change}
            search={fieldSearch2}
            onSearchChange={setFieldSearch2}
            placeholder="Search fields…"
            sysFields={systemFields}
            custFields={customFields}
          />
        </div>

        {/* Timeline-only: date fields */}
        {!isList && (
          <>
            <div style={styles.section}>
              <div style={styles.sectionTitle}>Start date field</div>
              <FieldSelect
                value={startDateField}
                onChange={onStartDateFieldChange}
                search={dateSearch1}
                onSearchChange={setDateSearch1}
                placeholder="Search date fields…"
                sysFields={dateSystemFields}
                custFields={dateCustomFields}
              />
            </div>

            <div style={styles.section}>
              <div style={styles.sectionTitle}>End date field (due date)</div>
              <FieldSelect
                value={endDateField}
                onChange={onEndDateFieldChange}
                search={dateSearch2}
                onSearchChange={setDateSearch2}
                placeholder="Search date fields…"
                sysFields={dateSystemFields}
                custFields={dateCustomFields}
              />
            </div>
          </>
        )}

        {/* Status filter */}
        {!eventsOnly && !jqlFilter.trim() && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>Status filter</div>
            <label style={styles.radioLabel}>
              <input type="radio" value="active" checked={statusFilter === 'active'} onChange={() => onStatusFilterChange('active')} />
              <span>Active issues only (exclude Done)</span>
            </label>
            <label style={styles.radioLabel}>
              <input type="radio" value="all" checked={statusFilter === 'all'} onChange={() => onStatusFilterChange('all')} />
              <span>All issues</span>
            </label>
          </div>
        )}

        {/* Project picker */}
        {!eventsOnly && !jqlFilter.trim() && (
          <div style={styles.section}>
            <div style={styles.sectionTitle}>
              Projects
              <span style={styles.selectedCount}> ({selectedProjects.length} selected)</span>
            </div>
            <div style={styles.projectList}>
              {availableProjects.slice(0, 100).map(p => (
                <label key={p.key} style={styles.projectOption}>
                  <input type="checkbox" checked={selectedProjects.includes(p.key)} onChange={() => toggleProject(p.key)} />
                  <span style={styles.projectKey}>{p.key}</span>
                  <span style={styles.projectName}>{p.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Working Calendar / Holidays */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>
            Working Calendar / Holidays
            <span style={styles.selectedCount}> ({(holidays || []).length} holiday{(holidays || []).length !== 1 ? 's' : ''})</span>
          </div>

          {/* Add holiday form */}
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
            <input
              type="date"
              style={{ flex: '0 0 130px', border: '1px solid #DFE1E6', borderRadius: '4px', padding: '6px 8px', fontSize: '12px', color: '#172B4D', outline: 'none', boxSizing: 'border-box' }}
              value={newHolidayDate}
              onChange={e => setNewHolidayDate(e.target.value)}
            />
            <input
              style={{ flex: 1, border: '1px solid #DFE1E6', borderRadius: '4px', padding: '6px 8px', fontSize: '12px', color: '#172B4D', outline: 'none', boxSizing: 'border-box' }}
              placeholder="Holiday name..."
              value={newHolidayName}
              onChange={e => setNewHolidayName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newHolidayDate && newHolidayName.trim() && onSaveHolidays) {
                  const updated = [...(holidays || []), { date: newHolidayDate, name: newHolidayName.trim() }];
                  onSaveHolidays(updated);
                  setNewHolidayDate('');
                  setNewHolidayName('');
                }
              }}
            />
            <button
              style={{
                background: '#0052CC', color: '#fff', border: 'none', borderRadius: '4px',
                padding: '6px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                opacity: newHolidayDate && newHolidayName.trim() ? 1 : 0.5,
                whiteSpace: 'nowrap',
              }}
              disabled={!newHolidayDate || !newHolidayName.trim()}
              onClick={() => {
                if (newHolidayDate && newHolidayName.trim() && onSaveHolidays) {
                  const updated = [...(holidays || []), { date: newHolidayDate, name: newHolidayName.trim() }];
                  onSaveHolidays(updated);
                  setNewHolidayDate('');
                  setNewHolidayName('');
                }
              }}
            >Add</button>
          </div>

          {/* Holiday list */}
          {(holidays || []).length > 0 && (
            <div style={{ border: '1px solid #DFE1E6', borderRadius: '4px', maxHeight: '200px', overflowY: 'auto' }}>
              {[...(holidays || [])].sort((a, b) => a.date.localeCompare(b.date)).map(h => (
                <div key={h.date} style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px',
                  borderBottom: '1px solid #F4F5F7', fontSize: '12px',
                }}>
                  <span style={{ fontWeight: 600, color: '#BF2040', fontFamily: 'monospace', fontSize: '11px', flexShrink: 0 }}>{h.date}</span>
                  <span style={{ flex: 1, color: '#172B4D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</span>
                  <button
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#97A0AF', padding: '2px', flexShrink: 0 }}
                    onClick={() => {
                      if (onSaveHolidays) {
                        onSaveHolidays((holidays || []).filter(x => x.date !== h.date));
                      }
                    }}
                    title="Remove holiday"
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {(holidays || []).length === 0 && (
            <div style={{ fontSize: '11px', color: '#97A0AF', padding: '2px 0' }}>
              No holidays configured. Add dates to shade them on the timeline.
            </div>
          )}
        </div>

        {/* Baselines */}
        <div style={styles.section}>
          <div style={styles.sectionTitle}>Baselines</div>

          {/* Create baseline */}
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              style={{ flex: 1, border: '1px solid #DFE1E6', borderRadius: '4px', padding: '6px 8px', fontSize: '12px', color: '#172B4D', outline: 'none', boxSizing: 'border-box' }}
              placeholder="Baseline name..."
              value={baselineName}
              onChange={e => setBaselineName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && baselineName.trim() && onCreateBaseline) {
                  onCreateBaseline(baselineName.trim());
                  setBaselineName('');
                }
              }}
            />
            <button
              style={{
                background: '#0052CC', color: '#fff', border: 'none', borderRadius: '4px',
                padding: '6px 10px', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                opacity: baselineName.trim() ? 1 : 0.5,
                whiteSpace: 'nowrap',
              }}
              disabled={!baselineName.trim()}
              onClick={() => {
                if (baselineName.trim() && onCreateBaseline) {
                  onCreateBaseline(baselineName.trim());
                  setBaselineName('');
                }
              }}
            >+ Snapshot</button>
          </div>

          {/* Active baseline toggle */}
          {activeBaselineId && (
            <button
              style={{
                background: 'none', border: '1px solid #DFE1E6', borderRadius: '4px',
                padding: '4px 10px', cursor: 'pointer', fontSize: '11px', color: '#6B778C',
                alignSelf: 'flex-start',
              }}
              onClick={() => onSetActiveBaseline && onSetActiveBaseline(null)}
            >Show none</button>
          )}

          {/* Baseline list */}
          {(baselines || []).length > 0 && (
            <div style={{ border: '1px solid #DFE1E6', borderRadius: '4px', maxHeight: '180px', overflowY: 'auto' }}>
              {[...(baselines || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).map(bl => {
                const isActive = activeBaselineId === bl.id;
                const dateStr = bl.createdAt ? new Date(bl.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
                return (
                  <div key={bl.id} style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px',
                    borderBottom: '1px solid #F4F5F7',
                    background: isActive ? '#DEEBFF' : 'transparent',
                  }}>
                    <div style={{ flex: 1, overflow: 'hidden' }}>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#172B4D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bl.name}</div>
                      <div style={{ fontSize: '10px', color: '#97A0AF' }}>{dateStr}</div>
                    </div>
                    {isActive ? (
                      <span style={{ fontSize: '10px', fontWeight: 700, color: '#0052CC', background: '#B3D4FF', borderRadius: '3px', padding: '1px 6px', flexShrink: 0 }}>Active</span>
                    ) : (
                      <button
                        style={{ background: 'none', border: '1px solid #DFE1E6', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', fontSize: '10px', color: '#0052CC', fontWeight: 600, flexShrink: 0 }}
                        onClick={() => onSetActiveBaseline && onSetActiveBaseline(bl.id)}
                      >Activate</button>
                    )}
                    <button
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: '#97A0AF', padding: '2px', flexShrink: 0 }}
                      onClick={() => onDeleteBaseline && onDeleteBaseline(bl.id)}
                      title="Delete baseline"
                    >✕</button>
                  </div>
                );
              })}
            </div>
          )}

          {(baselines || []).length === 0 && (
            <div style={{ fontSize: '11px', color: '#97A0AF', padding: '2px 0' }}>
              No baselines yet. Create one to snapshot current dates.
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <button style={styles.cancelBtn} onClick={onClose}>Cancel</button>
        <button style={styles.saveBtn} onClick={onSave}>Save to view</button>
      </div>
    </div>
  );
}

const styles = {
  panel: {
    position: 'absolute', right: 0, top: 0, bottom: 0, width: '320px',
    background: '#fff', borderLeft: '1px solid #DFE1E6', zIndex: 20,
    display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 16px rgba(0,0,0,0.1)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 16px', borderBottom: '1px solid #DFE1E6',
  },
  title: { fontWeight: 700, fontSize: '14px', color: '#172B4D' },
  closeBtn: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', color: '#6B778C', padding: '4px' },
  body: { flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' },
  section: { display: 'flex', flexDirection: 'column', gap: '8px' },
  sectionTitle: { fontSize: '11px', fontWeight: 700, color: '#6B778C', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' },
  sectionNote: { textTransform: 'none', fontWeight: 400, color: '#97A0AF', letterSpacing: 0 },
  selectedCount: { textTransform: 'none', fontWeight: 400, color: '#97A0AF' },
  jqlTextarea: {
    width: '100%', minHeight: '72px', border: '1px solid #DFE1E6', borderRadius: '4px',
    padding: '8px', fontSize: '12px', fontFamily: 'monospace', color: '#172B4D',
    resize: 'vertical', outline: 'none', boxSizing: 'border-box', lineHeight: 1.5,
  },
  clearJqlBtn: {
    background: 'none', border: '1px solid #DFE1E6', borderRadius: '4px',
    padding: '4px 10px', cursor: 'pointer', fontSize: '11px', color: '#DE350B', alignSelf: 'flex-start',
  },
  fieldSearch: {
    width: '100%', border: 'none', borderBottom: '1px solid #DFE1E6',
    padding: '6px 10px', fontSize: '12px', outline: 'none', boxSizing: 'border-box',
    color: '#172B4D',
  },
  fieldList: { maxHeight: '160px', overflowY: 'auto' },
  fieldGroupLabel: {
    padding: '4px 10px 2px', fontSize: '10px', fontWeight: 700, color: '#97A0AF',
    textTransform: 'uppercase', letterSpacing: '0.4px', background: '#F4F5F7',
  },
  fieldOption: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '5px 10px', cursor: 'pointer', fontSize: '12px',
  },
  fieldName: { fontWeight: 500 },
  fieldId: { fontSize: '10px', color: '#97A0AF', fontFamily: 'monospace', marginLeft: '6px', flexShrink: 0 },
  radioLabel: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#172B4D', cursor: 'pointer', padding: '3px 0' },
  projectList: { maxHeight: '240px', overflowY: 'auto', border: '1px solid #DFE1E6', borderRadius: '4px', padding: '4px 0' },
  projectOption: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '12px' },
  projectKey: { fontWeight: 700, color: '#0052CC', minWidth: '48px', flexShrink: 0 },
  projectName: { color: '#172B4D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: '8px', padding: '12px 16px', borderTop: '1px solid #DFE1E6' },
  cancelBtn: { background: 'none', border: '1px solid #DFE1E6', borderRadius: '4px', padding: '7px 14px', cursor: 'pointer', fontSize: '13px', color: '#172B4D' },
  saveBtn: { background: '#0052CC', color: '#fff', border: 'none', borderRadius: '4px', padding: '7px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 },
};
