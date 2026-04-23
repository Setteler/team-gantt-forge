import React, { useMemo, useState } from 'react';
import { C, T } from '../tokens';
import ModuleFilterBar from './ModuleFilterBar';

/* ── Date helpers ─────────────────────────────────────────────────────────── */

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function fmtDate(str) {
  const d = parseDate(str);
  if (!d) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}`;
}

function daysDiff(from, to) {
  return Math.round((to - from) / 86400000);
}

function statusCat(issue) {
  const key = (issue.fields?.status?.statusCategory?.name || '').toLowerCase();
  if (key === 'done') return 'done';
  if (key.includes('progress')) return 'inprogress';
  return 'todo';
}

function firstNameOf(displayName) {
  if (!displayName) return '';
  return displayName.split(' ')[0];
}

/* ── Main component ───────────────────────────────────────────────────────── */

export default function FeatureStatusModule({ issues, startDateField, endDateField, availableFields }) {
  const edf = endDateField || 'duedate';
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const [fieldFilter, setFieldFilter] = useState(null); // { fieldId, fieldName, values[] }

  // Apply custom field filter
  const filteredIssues = useMemo(() => {
    // Exclude epics
    let list = issues.filter(iss => (iss.fields?.issuetype?.name || '').toLowerCase() !== 'epic');
    if (!fieldFilter || !fieldFilter.values?.length) return list;
    return list.filter(iss => {
      const raw = iss.fields?.[fieldFilter.fieldId];
      if (!raw) return false;
      const vals = Array.isArray(raw) ? raw : [raw];
      return vals.some(v => {
        const str = typeof v === 'object' ? (v.name || v.value || v.displayName || '') : String(v);
        return fieldFilter.values?.includes(str);
      });
    });
  }, [issues, fieldFilter]);

  // Categorize
  const { total, done, inProgress, todo, overdue, dueSoon } = useMemo(() => {
    let done = 0, inProgress = 0, todo = 0;
    const overdue = [], dueSoon = [];
    for (const iss of filteredIssues) {
      const cat = statusCat(iss);
      if (cat === 'done') { done++; continue; }
      if (cat === 'inprogress') inProgress++; else todo++;
      const end = parseDate(iss.fields?.[edf]);
      if (!end) continue;
      const diff = daysDiff(today, end);
      if (diff < 0) overdue.push({ iss, daysOver: -diff, end });
      else if (diff <= 14) dueSoon.push({ iss, daysLeft: diff, end });
    }
    overdue.sort((a, b) => a.end - b.end);
    dueSoon.sort((a, b) => a.daysLeft - b.daysLeft);
    return { total: filteredIssues.length, done, inProgress, todo, overdue, dueSoon };
  }, [filteredIssues, edf, today]);

  const donePct = total > 0 ? Math.round((done / total) * 100) : 0;
  const inProgressPct = total > 0 ? Math.round((inProgress / total) * 100) : 0;
  const todoPct = 100 - donePct - inProgressPct;

  // Status breakdown
  const byStatus = useMemo(() => {
    const map = new Map();
    for (const iss of filteredIssues) {
      const name = iss.fields?.status?.name || 'Unknown';
      const cat = statusCat(iss);
      if (!map.has(name)) map.set(name, { name, cat, count: 0 });
      map.get(name).count++;
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [filteredIssues]);

  const catColor = { done: C.success, inprogress: C.primary, todo: C.ink4 };

  if (issues.length === 0) return (
    <div style={S.page}>
      <ModuleFilterBar mode="feature-status" availableFields={availableFields || []} issues={issues} onFieldFilterChange={setFieldFilter} />
      <div style={S.empty}><div style={{ fontSize: 36 }}>📊</div><p style={S.emptyTitle}>No issues loaded</p><p style={S.emptyText}>Select a view with issues to see feature status.</p></div>
    </div>
  );

  return (
    <div style={S.page}>
      {/* Filter bar */}
      <ModuleFilterBar mode="feature-status" availableFields={availableFields || []} issues={issues} onFieldFilterChange={setFieldFilter} />

      <div style={S.body}>
        {/* Header */}
        <div style={S.header}>
          <h1 style={S.title}>Feature Status</h1>
          <p style={S.subtitle}>Progress overview · {total} issues{fieldFilter && fieldFilter.values?.length > 0 ? ` · filtered by ${fieldFilter.fieldName}` : ''}</p>
        </div>

        {/* KPI row */}
        <div style={S.kpiRow}>
          <KpiCard label="TOTAL ISSUES" value={total} color={C.ink} />
          <KpiCard label="COMPLETE" value={`${donePct}%`} sub={`${done} done`} color={C.success} />
          <KpiCard label="IN PROGRESS" value={inProgress} color={C.primary} />
          <KpiCard label="OVERDUE" value={overdue.length} color={overdue.length > 0 ? C.critical : C.ink} />
          <KpiCard label="DUE IN 14D" value={dueSoon.length} color={C.amber} />
        </div>

        {/* Overall progress */}
        <div style={S.card}>
          <p style={S.cardLabel}>OVERALL PROGRESS</p>
          <div style={S.progressTrack}>
            <div style={{ ...S.progressSeg, width: `${donePct}%`, background: C.success }} />
            <div style={{ ...S.progressSeg, width: `${inProgressPct}%`, background: C.primary }} />
            <div style={{ ...S.progressSeg, width: `${todoPct}%`, background: C.line }} />
          </div>
          <div style={S.progressLegend}>
            <LegendDot color={C.success} label={`Done (${donePct}%)`} />
            <LegendDot color={C.primary} label={`In Progress (${inProgressPct}%)`} />
            <LegendDot color={C.line} label={`To Do (${todoPct}%)`} border />
          </div>
        </div>

        {/* Two-col */}
        <div style={S.twoCol}>
          {/* Status breakdown */}
          <div style={S.card}>
            <p style={S.cardLabel}>STATUS BREAKDOWN</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {byStatus.map(s => {
                const pct = total > 0 ? Math.round((s.count / total) * 100) : 0;
                return (
                  <div key={s.name}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: catColor[s.cat] || C.ink4, flexShrink: 0 }} />
                      <span style={{ fontSize: 12.5, color: C.ink2, flex: 1 }}>{s.name}</span>
                      <span style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, width: 28, textAlign: 'right' }}>{s.count}</span>
                      <span style={{ fontSize: 11, color: C.ink4, width: 32, textAlign: 'right' }}>{pct}%</span>
                    </div>
                    <div style={{ height: 4, background: C.line2, borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: catColor[s.cat] || C.ink4, borderRadius: 2 }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Overdue */}
          <div style={S.card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ ...S.cardLabel, margin: 0 }}>OVERDUE ISSUES</p>
              {overdue.length > 0 && <span style={{ fontSize: 11, color: C.ink3 }}>{overdue.length} items</span>}
            </div>
            {overdue.length === 0 ? (
              <div style={{ fontSize: 13, color: C.ink3, padding: '8px 0' }}>🎉 No overdue issues</div>
            ) : (
              <div style={{ overflowY: 'auto', maxHeight: 280 }}>
                {overdue.map(({ iss, daysOver }) => (
                  <div key={iss.key} style={S.issueRow}>
                    <span style={S.issueKey}>{iss.key}</span>
                    <span style={S.issueSummary}>{iss.fields?.summary || iss.key}</span>
                    <span style={{ fontSize: 11.5, color: C.ink3, flexShrink: 0 }}>{firstNameOf(iss.fields?.assignee?.displayName)}</span>
                    <span style={{ fontSize: 11, color: C.ink4, width: 46, textAlign: 'right', flexShrink: 0, fontFamily: T.mono }}>{fmtDate(iss.fields?.[edf])}</span>
                    <span style={{ ...S.badge, background: `${C.critical}15`, color: C.critical }}>{daysOver}d over</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, sub, color }) {
  return (
    <div style={S.kpiCard}>
      <span style={{ fontSize: 10.5, fontWeight: 700, color: C.ink3, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</span>
      <span style={{ fontSize: 26, fontWeight: 600, color, letterSpacing: -0.6, lineHeight: 1.1 }}>{value}</span>
      {sub && <span style={{ fontSize: 11, color: C.ink4 }}>{sub}</span>}
    </div>
  );
}

function LegendDot({ color, label, border }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.ink2 }}>
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, border: border ? `1px solid ${C.line}` : 'none', flexShrink: 0 }} />
      {label}
    </span>
  );
}

const S = {
  page: {
    fontFamily: T.sans, display: 'flex', flexDirection: 'column',
    height: '100%', overflow: 'hidden', background: C.bgMuted,
  },
  body: { flex: 1, overflowY: 'auto', padding: '20px 24px', maxWidth: 900 },
  empty: {
    flex: 1, display: 'flex', flexDirection: 'column',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  emptyTitle: { fontSize: 16, fontWeight: 600, color: C.ink, margin: 0 },
  emptyText: { fontSize: 13, color: C.ink3, margin: 0 },
  header: { marginBottom: 18 },
  title: {
    fontSize: 22, fontWeight: 600, color: C.ink,
    letterSpacing: -0.4, margin: 0, fontFamily: T.sans,
  },
  subtitle: { fontSize: 13, color: C.ink3, margin: '4px 0 0' },
  kpiRow: {
    display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
    gap: 12, marginBottom: 16,
  },
  kpiCard: {
    background: '#fff', border: `1px solid ${C.line}`,
    borderRadius: 4, padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 3,
  },
  card: {
    background: '#fff', border: `1px solid ${C.line}`,
    borderRadius: 4, padding: '14px 16px', marginBottom: 16,
  },
  cardLabel: {
    fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
    color: C.ink3, textTransform: 'uppercase', margin: '0 0 10px',
  },
  progressTrack: {
    height: 10, borderRadius: 5, background: C.line2,
    display: 'flex', overflow: 'hidden',
  },
  progressSeg: { height: '100%', transition: 'width 0.3s' },
  progressLegend: { display: 'flex', gap: 16, marginTop: 8 },
  twoCol: {
    display: 'grid', gridTemplateColumns: '1fr 1.25fr', gap: 16,
  },
  issueRow: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '7px 0', borderTop: `1px solid ${C.line2}`,
  },
  issueKey: {
    fontSize: 11, color: C.primary, fontWeight: 600,
    fontFamily: T.mono, flexShrink: 0, minWidth: 64,
  },
  issueSummary: {
    fontSize: 12.5, color: C.ink, flex: 1,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  },
  badge: {
    fontSize: 11, fontWeight: 600,
    padding: '2px 7px', borderRadius: 4, flexShrink: 0,
  },
};
