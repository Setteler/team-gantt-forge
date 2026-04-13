import React, { useState, useMemo } from 'react';

/* ── Date helpers (mirrored from GanttChart.jsx) ──────────────────────────── */

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }

function daysBetween(a, b) { return Math.round((b - a) / 86400000); }

/* ── Week helpers ─────────────────────────────────────────────────────────── */

/** Returns the Monday of the week containing `date`. */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Format a date as "Apr 13" style short label. */
function fmtWeekLabel(date) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/** Unique key for a week based on its Monday, e.g. "2026-04-13". */
function weekKey(date) {
  const d = getWeekStart(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Build an array of week-start Mondays for a given range.
 * `weekOffset` shifts the 12-week window: 0 = centered on today,
 * negative = earlier, positive = later.
 */
function buildWeekColumns(today, weekOffset) {
  const startWeek = getWeekStart(today);
  // Shift by -6 (center on today) plus the user's offset
  startWeek.setDate(startWeek.getDate() + (weekOffset - 6) * 7);
  const weeks = [];
  for (let i = 0; i < 12; i++) {
    const w = new Date(startWeek);
    w.setDate(w.getDate() + i * 7);
    weeks.push(w);
  }
  return weeks;
}

/**
 * Does an issue overlap a given week?
 * A week runs Monday 00:00 to Sunday 23:59.
 * An issue overlaps if its [start, end] range intersects [weekMon, weekSun].
 */
function issueOverlapsWeek(issueStart, issueEnd, weekMonday) {
  const weekSunday = addDays(weekMonday, 6);
  return issueStart <= weekSunday && issueEnd >= weekMonday;
}

/* ── Utilization color ────────────────────────────────────────────────────── */

function utilizationColor(pct) {
  if (pct === 0) return { bg: '#F4F5F7', text: '#97A0AF' }; // gray — no work
  if (pct <= 70) return { bg: '#36B37E', text: '#fff' };     // green
  if (pct <= 100) return { bg: '#FFE380', text: '#172B4D' }; // yellow
  if (pct <= 130) return { bg: '#FF8B00', text: '#fff' };    // orange
  return { bg: '#DE350B', text: '#fff' };                     // red
}

/* ── Initials helper ──────────────────────────────────────────────────────── */

function initials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name[0].toUpperCase();
}

/* ── Main component ───────────────────────────────────────────────────────── */

const HOURS_PER_ISSUE_PER_WEEK = 8;
const DEFAULT_CAPACITY = 40;

export default function ResourcesModule({ issues, teams, startDateField, endDateField }) {
  const [teamFilter, setTeamFilter] = useState('all');
  const [weekOffset, setWeekOffset] = useState(0);
  const [popover, setPopover] = useState(null); // { personKey, weekIdx, issues, rect }

  const sdf = startDateField || 'customfield_10015';
  const edf = endDateField || 'duedate';
  const today = useMemo(() => new Date(), []);

  // ── Build week columns ──────────────────────────────────────────────────
  const weeks = useMemo(() => buildWeekColumns(today, weekOffset), [today, weekOffset]);

  // ── Parse issues: extract assignee + date range ─────────────────────────
  const parsedIssues = useMemo(() => {
    const result = [];
    for (const issue of issues) {
      const startRaw = issue.fields?.[sdf];
      const endRaw = issue.fields?.[edf];
      const s = parseDate(startRaw);
      const e = parseDate(endRaw);
      if (!s && !e) continue; // skip issues with no dates

      const start = s || e;
      const end = e || s;
      // Ensure start <= end
      const realStart = start <= end ? start : end;
      const realEnd = start <= end ? end : start;

      const assignee = issue.fields?.assignee;
      const accountId = assignee?.accountId || null;
      const displayName = assignee?.displayName || null;

      result.push({
        key: issue.key,
        summary: issue.fields?.summary || issue.key,
        accountId,
        displayName,
        start: realStart,
        end: realEnd,
      });
    }
    return result;
  }, [issues, sdf, edf]);

  // ── Build people list (union of team members + issue assignees) ─────────
  const people = useMemo(() => {
    const map = new Map(); // key: accountId or displayName fallback -> person data

    // Add all team members
    for (const team of teams) {
      for (const member of (team.members || [])) {
        const key = member.accountId || member.displayName || 'unknown';
        if (!map.has(key)) {
          map.set(key, {
            personKey: key,
            displayName: member.displayName || 'Unnamed',
            accountId: member.accountId || '',
            weeklyCapacityHours: member.weeklyCapacityHours || DEFAULT_CAPACITY,
            teamName: team.name,
            teamId: team.id,
          });
        }
      }
    }

    // Add issue assignees not yet in any team
    for (const pi of parsedIssues) {
      if (!pi.accountId && !pi.displayName) continue; // unassigned — handled separately
      const key = pi.accountId || pi.displayName;
      if (!map.has(key)) {
        map.set(key, {
          personKey: key,
          displayName: pi.displayName || pi.accountId,
          accountId: pi.accountId || '',
          weeklyCapacityHours: DEFAULT_CAPACITY,
          teamName: null, // no team
          teamId: null,
        });
      }
    }

    return Array.from(map.values());
  }, [teams, parsedIssues]);

  // ── Check if there are unassigned issues ────────────────────────────────
  const unassignedIssues = useMemo(
    () => parsedIssues.filter(pi => !pi.accountId && !pi.displayName),
    [parsedIssues],
  );

  // ── Filter people by team ───────────────────────────────────────────────
  const filteredPeople = useMemo(() => {
    let list;
    if (teamFilter === 'all') {
      list = people;
    } else if (teamFilter === 'no-team') {
      list = people.filter(p => !p.teamName);
    } else {
      list = people.filter(p => p.teamId === teamFilter);
    }
    // Sort: by team name, then display name
    return [...list].sort((a, b) => {
      const ta = a.teamName || 'zzz';
      const tb = b.teamName || 'zzz';
      if (ta !== tb) return ta.localeCompare(tb);
      return a.displayName.localeCompare(b.displayName);
    });
  }, [people, teamFilter]);

  // Include unassigned row?
  const showUnassigned = (teamFilter === 'all' || teamFilter === 'no-team') && unassignedIssues.length > 0;

  // ── Compute heatmap data ────────────────────────────────────────────────
  // For each person+week, which issues overlap and what's the load?
  const heatmap = useMemo(() => {
    // Map: personKey -> weekIdx -> { hoursLoaded, issues[] }
    const data = new Map();

    for (const person of filteredPeople) {
      const personIssues = parsedIssues.filter(pi => {
        if (person.accountId && pi.accountId) return pi.accountId === person.accountId;
        return pi.displayName === person.displayName;
      });

      const weekData = [];
      for (let wi = 0; wi < weeks.length; wi++) {
        const overlapping = personIssues.filter(pi => issueOverlapsWeek(pi.start, pi.end, weeks[wi]));
        const hoursLoaded = overlapping.length * HOURS_PER_ISSUE_PER_WEEK;
        weekData.push({ hoursLoaded, issues: overlapping });
      }
      data.set(person.personKey, weekData);
    }

    // Unassigned row
    if (showUnassigned) {
      const weekData = [];
      for (let wi = 0; wi < weeks.length; wi++) {
        const overlapping = unassignedIssues.filter(pi => issueOverlapsWeek(pi.start, pi.end, weeks[wi]));
        const hoursLoaded = overlapping.length * HOURS_PER_ISSUE_PER_WEEK;
        weekData.push({ hoursLoaded, issues: overlapping });
      }
      data.set('__unassigned__', weekData);
    }

    return data;
  }, [filteredPeople, parsedIssues, weeks, showUnassigned, unassignedIssues]);

  // ── Team options for filter ─────────────────────────────────────────────
  const teamOptions = useMemo(() => {
    const opts = [{ value: 'all', label: 'All Teams' }];
    for (const team of teams) {
      opts.push({ value: team.id, label: team.name });
    }
    // If there are people with no team, add the option
    if (people.some(p => !p.teamName)) {
      opts.push({ value: 'no-team', label: 'No Team' });
    }
    return opts;
  }, [teams, people]);

  // ── Popover handler ─────────────────────────────────────────────────────
  function handleCellClick(e, personKey, weekIdx) {
    const weekData = heatmap.get(personKey);
    if (!weekData || !weekData[weekIdx] || weekData[weekIdx].issues.length === 0) {
      setPopover(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    setPopover({
      personKey,
      weekIdx,
      issues: weekData[weekIdx].issues,
      x: rect.left + rect.width / 2,
      y: rect.bottom + 4,
    });
  }

  function closePopover() {
    setPopover(null);
  }

  // ── Determine "today" week highlight ────────────────────────────────────
  const todayWeekKey = weekKey(today);

  return (
    <div style={styles.container} onClick={closePopover}>
      {/* ── Header bar ── */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Resources</h2>
          <p style={styles.subtitle}>Capacity heatmap — workload vs. capacity across weeks.</p>
        </div>
        <div style={styles.headerRight}>
          <select
            style={styles.teamSelect}
            value={teamFilter}
            onChange={e => setTeamFilter(e.target.value)}
          >
            {teamOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div style={styles.weekNav}>
            <button style={styles.navBtn} onClick={() => setWeekOffset(o => o - 4)} title="Back 4 weeks">&lsaquo;&lsaquo;</button>
            <button style={styles.todayBtn} onClick={() => setWeekOffset(0)}>Today</button>
            <button style={styles.navBtn} onClick={() => setWeekOffset(o => o + 4)} title="Forward 4 weeks">&rsaquo;&rsaquo;</button>
          </div>
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={styles.legend}>
        <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: '#F4F5F7' }} /> 0%</span>
        <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: '#36B37E' }} /> 1-70%</span>
        <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: '#FFE380' }} /> 71-100%</span>
        <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: '#FF8B00' }} /> 101-130%</span>
        <span style={styles.legendItem}><span style={{ ...styles.legendDot, background: '#DE350B' }} /> &gt;130%</span>
        <span style={styles.legendNote}>Each issue = {HOURS_PER_ISSUE_PER_WEEK}h/week</span>
      </div>

      {/* ── Empty state ── */}
      {filteredPeople.length === 0 && !showUnassigned ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>&#128202;</div>
          <p style={styles.emptyTitle}>No people to display</p>
          <p style={styles.emptyText}>
            {teams.length === 0
              ? 'Create teams in the Teams module to see capacity data.'
              : 'No members match the current filter.'}
          </p>
        </div>
      ) : (
        /* ── Heatmap table ── */
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.thPerson}>Person</th>
                {weeks.map((w, wi) => {
                  const wk = weekKey(w);
                  const isToday = wk === todayWeekKey;
                  return (
                    <th key={wk} style={{ ...styles.thWeek, ...(isToday ? styles.thWeekToday : {}) }}>
                      {fmtWeekLabel(w)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {filteredPeople.map(person => {
                const weekData = heatmap.get(person.personKey) || [];
                return (
                  <tr key={person.personKey} style={styles.tr}>
                    <td style={styles.tdPerson}>
                      <span style={styles.avatar}>{initials(person.displayName)}</span>
                      <div style={styles.personInfo}>
                        <span style={styles.personName}>{person.displayName}</span>
                        <span style={styles.personMeta}>
                          {person.weeklyCapacityHours}h/wk
                          {!person.teamName && <span style={styles.noTeamBadge}>(no team)</span>}
                          {person.teamName && <span style={styles.teamBadge}>{person.teamName}</span>}
                        </span>
                      </div>
                    </td>
                    {weeks.map((w, wi) => {
                      const wd = weekData[wi] || { hoursLoaded: 0, issues: [] };
                      const cap = person.weeklyCapacityHours || DEFAULT_CAPACITY;
                      const pct = cap > 0 ? Math.round((wd.hoursLoaded / cap) * 100) : 0;
                      const color = utilizationColor(pct);
                      const isActive = popover && popover.personKey === person.personKey && popover.weekIdx === wi;
                      return (
                        <td
                          key={wi}
                          style={{
                            ...styles.tdCell,
                            background: color.bg,
                            color: color.text,
                            ...(isActive ? styles.tdCellActive : {}),
                            cursor: wd.issues.length > 0 ? 'pointer' : 'default',
                          }}
                          onClick={e => { e.stopPropagation(); handleCellClick(e, person.personKey, wi); }}
                          title={`${wd.hoursLoaded}h / ${cap}h (${pct}%) — ${wd.issues.length} issue${wd.issues.length !== 1 ? 's' : ''}`}
                        >
                          <span style={styles.cellHours}>{wd.hoursLoaded}</span>
                          <span style={styles.cellSlash}>/</span>
                          <span style={styles.cellCap}>{cap}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* Unassigned row */}
              {showUnassigned && (
                <tr style={styles.tr}>
                  <td style={styles.tdPerson}>
                    <span style={{ ...styles.avatar, background: '#97A0AF', color: '#fff' }}>?</span>
                    <div style={styles.personInfo}>
                      <span style={styles.personName}>Unassigned</span>
                      <span style={styles.personMeta}>{DEFAULT_CAPACITY}h/wk</span>
                    </div>
                  </td>
                  {weeks.map((w, wi) => {
                    const weekData = heatmap.get('__unassigned__') || [];
                    const wd = weekData[wi] || { hoursLoaded: 0, issues: [] };
                    const pct = DEFAULT_CAPACITY > 0 ? Math.round((wd.hoursLoaded / DEFAULT_CAPACITY) * 100) : 0;
                    const color = utilizationColor(pct);
                    const isActive = popover && popover.personKey === '__unassigned__' && popover.weekIdx === wi;
                    return (
                      <td
                        key={wi}
                        style={{
                          ...styles.tdCell,
                          background: color.bg,
                          color: color.text,
                          ...(isActive ? styles.tdCellActive : {}),
                          cursor: wd.issues.length > 0 ? 'pointer' : 'default',
                        }}
                        onClick={e => { e.stopPropagation(); handleCellClick(e, '__unassigned__', wi); }}
                        title={`${wd.hoursLoaded}h / ${DEFAULT_CAPACITY}h (${pct}%) — ${wd.issues.length} issue${wd.issues.length !== 1 ? 's' : ''}`}
                      >
                        <span style={styles.cellHours}>{wd.hoursLoaded}</span>
                        <span style={styles.cellSlash}>/</span>
                        <span style={styles.cellCap}>{DEFAULT_CAPACITY}</span>
                      </td>
                    );
                  })}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Popover ── */}
      {popover && (
        <div
          style={{
            ...styles.popover,
            left: Math.min(popover.x - 140, window.innerWidth - 300),
            top: popover.y,
          }}
          onClick={e => e.stopPropagation()}
        >
          <div style={styles.popoverHeader}>
            {popover.issues.length} issue{popover.issues.length !== 1 ? 's' : ''} this week
          </div>
          <div style={styles.popoverBody}>
            {popover.issues.map(pi => (
              <div key={pi.key} style={styles.popoverItem}>
                <span style={styles.popoverKey}>{pi.key}</span>
                <span style={styles.popoverSummary}>{pi.summary}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: { flex: 1, overflow: 'auto', padding: '24px 32px', position: 'relative', fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif" },
  header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px', gap: '16px', flexWrap: 'wrap' },
  title: { margin: 0, fontSize: '20px', fontWeight: 700, color: '#172B4D' },
  subtitle: { margin: '4px 0 0', fontSize: '13px', color: '#6B778C' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0, flexWrap: 'wrap' },
  teamSelect: { border: '1px solid #DFE1E6', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', color: '#172B4D', background: '#fff', outline: 'none', cursor: 'pointer' },
  weekNav: { display: 'flex', alignItems: 'center', gap: '4px' },
  navBtn: { background: '#fff', border: '1px solid #DFE1E6', borderRadius: '6px', padding: '6px 10px', cursor: 'pointer', fontSize: '14px', fontWeight: 600, color: '#42526E', lineHeight: 1 },
  todayBtn: { background: '#0073ea', color: '#fff', border: 'none', borderRadius: '6px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
  legend: { display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap', fontSize: '11px', color: '#6B778C' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '4px' },
  legendDot: { width: '12px', height: '12px', borderRadius: '3px', border: '1px solid rgba(0,0,0,0.08)', display: 'inline-block' },
  legendNote: { marginLeft: '8px', fontStyle: 'italic', color: '#97A0AF' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px', textAlign: 'center' },
  emptyIcon: { fontSize: '48px', marginBottom: '12px', opacity: 0.6 },
  emptyTitle: { margin: 0, fontSize: '16px', fontWeight: 600, color: '#172B4D' },
  emptyText: { margin: '8px 0 20px', fontSize: '13px', color: '#6B778C' },
  tableWrap: { overflowX: 'auto', borderRadius: '8px', border: '1px solid #DFE1E6' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px', minWidth: '900px' },
  thPerson: { textAlign: 'left', padding: '8px 12px', fontSize: '11px', fontWeight: 600, color: '#6B778C', textTransform: 'uppercase', letterSpacing: '0.3px', borderBottom: '2px solid #DFE1E6', background: '#FAFBFC', position: 'sticky', left: 0, zIndex: 2, minWidth: '180px' },
  thWeek: { textAlign: 'center', padding: '8px 6px', fontSize: '11px', fontWeight: 600, color: '#6B778C', borderBottom: '2px solid #DFE1E6', background: '#FAFBFC', whiteSpace: 'nowrap', minWidth: '70px' },
  thWeekToday: { color: '#0073ea', background: '#E9F2FF' },
  tr: { borderBottom: '1px solid #F4F5F7' },
  tdPerson: { padding: '8px 12px', display: 'flex', alignItems: 'center', gap: '8px', background: '#fff', position: 'sticky', left: 0, zIndex: 1, borderRight: '1px solid #DFE1E6', minWidth: '180px' },
  avatar: { width: '28px', height: '28px', borderRadius: '50%', background: '#DEEBFF', color: '#0073ea', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700, flexShrink: 0 },
  personInfo: { display: 'flex', flexDirection: 'column', gap: '1px', minWidth: 0 },
  personName: { fontSize: '12px', fontWeight: 600, color: '#172B4D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  personMeta: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#6B778C' },
  noTeamBadge: { color: '#FF8B00', fontWeight: 600 },
  teamBadge: { fontSize: '10px', fontWeight: 600, color: '#6554C0', background: '#EAE6FF', borderRadius: '3px', padding: '0 4px' },
  tdCell: { textAlign: 'center', padding: '6px 4px', fontSize: '11px', fontWeight: 600, transition: 'opacity 0.1s', userSelect: 'none', whiteSpace: 'nowrap', borderRight: '1px solid rgba(255,255,255,0.3)' },
  tdCellActive: { outline: '2px solid #0073ea', outlineOffset: '-2px', borderRadius: '2px' },
  cellHours: { fontSize: '12px', fontWeight: 700 },
  cellSlash: { fontSize: '10px', opacity: 0.7, margin: '0 1px' },
  cellCap: { fontSize: '10px', opacity: 0.8 },
  popover: { position: 'fixed', zIndex: 1100, width: '280px', background: '#fff', borderRadius: '8px', boxShadow: '0 8px 24px rgba(9,30,66,0.25)', border: '1px solid #DFE1E6', overflow: 'hidden' },
  popoverHeader: { padding: '8px 12px', fontSize: '12px', fontWeight: 600, color: '#172B4D', borderBottom: '1px solid #F4F5F7', background: '#FAFBFC' },
  popoverBody: { padding: '4px 0', maxHeight: '200px', overflowY: 'auto' },
  popoverItem: { display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px' },
  popoverKey: { fontSize: '11px', fontWeight: 700, color: '#0073ea', whiteSpace: 'nowrap', flexShrink: 0 },
  popoverSummary: { fontSize: '12px', color: '#172B4D', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
};
