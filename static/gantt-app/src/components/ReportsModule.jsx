import React, { useState, useMemo } from 'react';

/* ── Date helpers (mirrored from ResourcesModule.jsx) ─────────────────────── */

function parseDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }

/** Returns the Monday of the week containing `date`. */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function fmtWeekLabel(date) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

function buildWeekColumns(today, weekOffset) {
  const startWeek = getWeekStart(today);
  startWeek.setDate(startWeek.getDate() + (weekOffset - 6) * 7);
  const weeks = [];
  for (let i = 0; i < 12; i++) {
    const w = new Date(startWeek);
    w.setDate(w.getDate() + i * 7);
    weeks.push(w);
  }
  return weeks;
}

/* ── Status color mapping (copied from GanttBar.jsx) ─────────────────────── */

const STATUS_COLORS = {
  'To Do':       { bg: '#f4f5f7', text: '#676879', border: '#c1c7d0' },
  'In Progress': { bg: '#dce5ff', text: '#0060b9', border: '#0073ea' },
  'In Review':   { bg: '#f0dcff', text: '#7c3aad', border: '#a25ddc' },
  'Review':      { bg: '#f0dcff', text: '#7c3aad', border: '#a25ddc' },
  'Done':        { bg: '#dcf5e7', text: '#007a44', border: '#00c875' },
  'Canceled':    { bg: '#f4f5f7', text: '#c1c7d0', border: '#e6e9ef' },
  'Blocked':     { bg: '#ffe1e1', text: '#bf2040', border: '#e2445c' },
};

function getStatusColor(statusName) {
  return STATUS_COLORS[statusName] || { bg: '#DEEBFF', text: '#0747A6', border: '#0052CC' };
}

/* ── SVG chart helpers ────────────────────────────────────────────────────── */

/** Describe a donut arc path for SVG. */
function describeArc(cx, cy, r, startAngle, endAngle) {
  const rad = (a) => (a - 90) * Math.PI / 180;
  const x1 = cx + r * Math.cos(rad(startAngle));
  const y1 = cy + r * Math.sin(rad(startAngle));
  const x2 = cx + r * Math.cos(rad(endAngle));
  const y2 = cy + r * Math.sin(rad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

/* ── Main component ───────────────────────────────────────────────────────── */

export default function ReportsModule({ issues, startDateField, endDateField }) {
  const [weekOffset, setWeekOffset] = useState(0);

  const sdf = startDateField || 'customfield_10015';
  const edf = endDateField || 'duedate';
  const today = useMemo(() => new Date(), []);

  const weeks = useMemo(() => buildWeekColumns(today, weekOffset), [today, weekOffset]);

  // ── Parse issues once ──────────────────────────────────────────────────
  const parsed = useMemo(() => {
    return issues.map(issue => {
      const startRaw = issue.fields?.[sdf];
      const endRaw = issue.fields?.[edf];
      const s = parseDate(startRaw);
      const e = parseDate(endRaw);
      const start = s || e;
      const end = e || s;
      const statusName = issue.fields?.status?.name || 'Unknown';
      const isDone = statusName === 'Done';
      return {
        key: issue.key,
        start: start && end ? (start <= end ? start : end) : start,
        end: start && end ? (start <= end ? end : start) : end,
        statusName,
        isDone,
        // Heuristic: for done issues, treat end date as resolution date
        resolutionDate: isDone ? (end || start) : null,
      };
    });
  }, [issues, sdf, edf]);

  // ── Burndown data ──────────────────────────────────────────────────────
  const burndownData = useMemo(() => {
    const total = parsed.length;
    return weeks.map(weekMon => {
      const weekEnd = addDays(weekMon, 6);
      // "Remaining at end of this week" = issues that are NOT (done AND resolved by weekEnd)
      const resolved = parsed.filter(p =>
        p.isDone && p.resolutionDate && p.resolutionDate <= weekEnd
      ).length;
      return total - resolved;
    });
  }, [parsed, weeks]);

  const idealBurndown = useMemo(() => {
    const total = parsed.length;
    return weeks.map((_, i) => {
      // Linear from total down to 0 across the 12 weeks
      return Math.round(total * (1 - i / (weeks.length - 1)));
    });
  }, [parsed, weeks]);

  // ── Throughput data ────────────────────────────────────────────────────
  const throughputData = useMemo(() => {
    return weeks.map(weekMon => {
      const weekEnd = addDays(weekMon, 6);
      return parsed.filter(p =>
        p.isDone && p.resolutionDate &&
        p.resolutionDate >= weekMon && p.resolutionDate <= weekEnd
      ).length;
    });
  }, [parsed, weeks]);

  // ── Status distribution ────────────────────────────────────────────────
  const statusDist = useMemo(() => {
    const counts = {};
    for (const p of parsed) {
      counts[p.statusName] = (counts[p.statusName] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count, color: getStatusColor(name) }))
      .sort((a, b) => b.count - a.count);
  }, [parsed]);

  // ── Empty state ────────────────────────────────────────────────────────
  if (issues.length === 0) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <div>
            <h2 style={styles.title}>Reports</h2>
            <p style={styles.subtitle}>Project health charts computed from your issue data.</p>
          </div>
        </div>
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>&#128202;</div>
          <p style={styles.emptyTitle}>No data to report yet.</p>
          <p style={styles.emptyText}>Configure a view with issues to see burndown, throughput, and status charts.</p>
        </div>
      </div>
    );
  }

  // ── Chart dimensions ───────────────────────────────────────────────────
  const CHART_W = 520;
  const CHART_H = 200;
  const PAD = { top: 20, right: 20, bottom: 40, left: 44 };
  const plotW = CHART_W - PAD.left - PAD.right;
  const plotH = CHART_H - PAD.top - PAD.bottom;

  const BAR_W = 380;
  const BAR_H = 200;
  const BPAD = { top: 20, right: 16, bottom: 40, left: 36 };
  const bPlotW = BAR_W - BPAD.left - BPAD.right;
  const bPlotH = BAR_H - BPAD.top - BPAD.bottom;

  // ── Burndown axis scaling ──────────────────────────────────────────────
  const burnMax = Math.max(...burndownData, ...idealBurndown, 1);
  const burnYTicks = buildYTicks(burnMax);

  function burndownPoints(data) {
    return data.map((val, i) => {
      const x = PAD.left + (i / (weeks.length - 1)) * plotW;
      const y = PAD.top + plotH - (val / burnMax) * plotH;
      return `${x},${y}`;
    }).join(' ');
  }

  // ── Throughput axis scaling ────────────────────────────────────────────
  const thruMax = Math.max(...throughputData, 1);
  const thruYTicks = buildYTicks(thruMax);
  const barWidth = Math.max(8, (bPlotW / weeks.length) - 4);

  // ── Donut geometry ─────────────────────────────────────────────────────
  const DONUT_SIZE = 180;
  const DONUT_CX = 90;
  const DONUT_CY = 90;
  const DONUT_R = 70;
  const DONUT_THICKNESS = 25;
  const totalIssues = parsed.length;

  const donutArcs = useMemo(() => {
    if (statusDist.length === 0) return [];
    const arcs = [];
    let cumAngle = 0;
    for (const seg of statusDist) {
      const sweep = (seg.count / totalIssues) * 360;
      // Clamp to avoid full-circle single-arc rendering issues
      const endAngle = cumAngle + Math.min(sweep, 359.99);
      arcs.push({
        ...seg,
        startAngle: cumAngle,
        endAngle,
      });
      cumAngle += sweep;
    }
    return arcs;
  }, [statusDist, totalIssues]);

  return (
    <div style={styles.container}>
      {/* ── Header bar ── */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>Reports</h2>
          <p style={styles.subtitle}>Project health charts computed from your issue data.</p>
        </div>
        <div style={styles.headerRight}>
          <div style={styles.weekNav}>
            <button style={styles.navBtn} onClick={() => setWeekOffset(o => o - 4)} title="Back 4 weeks">&lsaquo;&lsaquo;</button>
            <button style={styles.todayBtn} onClick={() => setWeekOffset(0)}>Today</button>
            <button style={styles.navBtn} onClick={() => setWeekOffset(o => o + 4)} title="Forward 4 weeks">&rsaquo;&rsaquo;</button>
          </div>
        </div>
      </div>

      {/* ── Charts grid ── */}
      <div style={styles.grid}>
        {/* ── Burndown Chart (top, full width) ── */}
        <div style={{ ...styles.card, gridColumn: '1 / -1' }}>
          <h3 style={styles.cardTitle}>Burndown</h3>
          <p style={styles.cardDesc}>Remaining issues over time. Done issues are "resolved" on their end date.</p>
          <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} style={styles.svg}>
            {/* Y-axis grid lines + labels */}
            {burnYTicks.map(tick => {
              const y = PAD.top + plotH - (tick / burnMax) * plotH;
              return (
                <g key={tick}>
                  <line x1={PAD.left} y1={y} x2={CHART_W - PAD.right} y2={y} stroke="#E6E9EF" strokeWidth="0.5" />
                  <text x={PAD.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#6B778C">{tick}</text>
                </g>
              );
            })}
            {/* X-axis labels */}
            {weeks.map((w, i) => {
              const x = PAD.left + (i / (weeks.length - 1)) * plotW;
              return (
                <text key={i} x={x} y={CHART_H - 10} textAnchor="middle" fontSize="8" fill="#6B778C">
                  {fmtWeekLabel(w)}
                </text>
              );
            })}
            {/* Ideal line (dashed gray) */}
            <polyline
              points={burndownPoints(idealBurndown)}
              fill="none"
              stroke="#C1C7D0"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            {/* Actual line (solid blue) */}
            <polyline
              points={burndownPoints(burndownData)}
              fill="none"
              stroke="#0073ea"
              strokeWidth="2"
            />
            {/* Dots on actual */}
            {burndownData.map((val, i) => {
              const x = PAD.left + (i / (weeks.length - 1)) * plotW;
              const y = PAD.top + plotH - (val / burnMax) * plotH;
              return <circle key={i} cx={x} cy={y} r="3" fill="#0073ea" />;
            })}
            {/* Dots on ideal */}
            {idealBurndown.map((val, i) => {
              const x = PAD.left + (i / (weeks.length - 1)) * plotW;
              const y = PAD.top + plotH - (val / burnMax) * plotH;
              return <circle key={`ideal-${i}`} cx={x} cy={y} r="2" fill="#C1C7D0" />;
            })}
            {/* Legend */}
            <line x1={PAD.left} y1={8} x2={PAD.left + 16} y2={8} stroke="#0073ea" strokeWidth="2" />
            <text x={PAD.left + 20} y={11} fontSize="8" fill="#42526E">Actual</text>
            <line x1={PAD.left + 60} y1={8} x2={PAD.left + 76} y2={8} stroke="#C1C7D0" strokeWidth="1.5" strokeDasharray="4 3" />
            <text x={PAD.left + 80} y={11} fontSize="8" fill="#42526E">Ideal</text>
          </svg>
        </div>

        {/* ── Throughput Chart (bottom-left) ── */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Throughput</h3>
          <p style={styles.cardDesc}>Issues resolved per week (based on end date of Done issues).</p>
          <svg viewBox={`0 0 ${BAR_W} ${BAR_H}`} style={styles.svg}>
            {/* Y-axis grid + labels */}
            {thruYTicks.map(tick => {
              const y = BPAD.top + bPlotH - (tick / thruMax) * bPlotH;
              return (
                <g key={tick}>
                  <line x1={BPAD.left} y1={y} x2={BAR_W - BPAD.right} y2={y} stroke="#E6E9EF" strokeWidth="0.5" />
                  <text x={BPAD.left - 6} y={y + 3} textAnchor="end" fontSize="9" fill="#6B778C">{tick}</text>
                </g>
              );
            })}
            {/* Bars */}
            {throughputData.map((val, i) => {
              const slotW = bPlotW / weeks.length;
              const x = BPAD.left + i * slotW + (slotW - barWidth) / 2;
              const barH = thruMax > 0 ? (val / thruMax) * bPlotH : 0;
              const y = BPAD.top + bPlotH - barH;
              return (
                <g key={i}>
                  <rect x={x} y={y} width={barWidth} height={barH} rx="2" fill="#36B37E" opacity="0.85" />
                  {val > 0 && (
                    <text x={x + barWidth / 2} y={y - 4} textAnchor="middle" fontSize="8" fontWeight="600" fill="#172B4D">
                      {val}
                    </text>
                  )}
                </g>
              );
            })}
            {/* X-axis labels */}
            {weeks.map((w, i) => {
              const slotW = bPlotW / weeks.length;
              const x = BPAD.left + i * slotW + slotW / 2;
              return (
                <text key={i} x={x} y={BAR_H - 10} textAnchor="middle" fontSize="7" fill="#6B778C">
                  {fmtWeekLabel(w)}
                </text>
              );
            })}
          </svg>
        </div>

        {/* ── Status Donut (bottom-right) ── */}
        <div style={styles.card}>
          <h3 style={styles.cardTitle}>Status Distribution</h3>
          <p style={styles.cardDesc}>Current issue breakdown by status.</p>
          <div style={styles.donutWrap}>
            <svg viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`} style={{ width: DONUT_SIZE, height: DONUT_SIZE, flexShrink: 0 }}>
              {donutArcs.length === 1 ? (
                /* Single status: draw a full circle */
                <circle
                  cx={DONUT_CX}
                  cy={DONUT_CY}
                  r={DONUT_R}
                  fill="none"
                  stroke={donutArcs[0].color.border}
                  strokeWidth={DONUT_THICKNESS}
                />
              ) : (
                donutArcs.map((arc, i) => (
                  <path
                    key={i}
                    d={describeArc(DONUT_CX, DONUT_CY, DONUT_R, arc.startAngle, arc.endAngle)}
                    fill="none"
                    stroke={arc.color.border}
                    strokeWidth={DONUT_THICKNESS}
                    strokeLinecap="butt"
                  />
                ))
              )}
              {/* Center label */}
              <text x={DONUT_CX} y={DONUT_CY - 6} textAnchor="middle" fontSize="20" fontWeight="700" fill="#172B4D">
                {totalIssues}
              </text>
              <text x={DONUT_CX} y={DONUT_CY + 10} textAnchor="middle" fontSize="9" fill="#6B778C">
                issues
              </text>
            </svg>
            {/* Legend */}
            <div style={styles.donutLegend}>
              {statusDist.map(seg => (
                <div key={seg.name} style={styles.legendRow}>
                  <span style={{ ...styles.legendSwatch, background: seg.color.border }} />
                  <span style={styles.legendLabel}>{seg.name}</span>
                  <span style={styles.legendCount}>{seg.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Build nice Y-axis tick values ────────────────────────────────────────── */

function buildYTicks(maxVal) {
  if (maxVal <= 0) return [0];
  const steps = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000];
  let step = 1;
  for (const s of steps) {
    if (maxVal / s <= 6) { step = s; break; }
  }
  const ticks = [];
  for (let t = 0; t <= maxVal; t += step) {
    ticks.push(t);
  }
  if (ticks[ticks.length - 1] < maxVal) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/* ── Styles ───────────────────────────────────────────────────────────────── */

const styles = {
  container: {
    flex: 1, overflow: 'auto', padding: '24px 32px', position: 'relative',
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif",
  },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: '16px', gap: '16px', flexWrap: 'wrap',
  },
  title: { margin: 0, fontSize: '20px', fontWeight: 700, color: '#172B4D' },
  subtitle: { margin: '4px 0 0', fontSize: '13px', color: '#6B778C' },
  headerRight: { display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 },
  weekNav: { display: 'flex', alignItems: 'center', gap: '4px' },
  navBtn: {
    background: '#fff', border: '1px solid #DFE1E6', borderRadius: '6px',
    padding: '6px 10px', cursor: 'pointer', fontSize: '14px', fontWeight: 600,
    color: '#42526E', lineHeight: 1,
  },
  todayBtn: {
    background: '#0073ea', color: '#fff', border: 'none', borderRadius: '6px',
    padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 600,
  },
  emptyState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '64px 24px', textAlign: 'center',
  },
  emptyIcon: { fontSize: '48px', marginBottom: '12px', opacity: 0.6 },
  emptyTitle: { margin: 0, fontSize: '16px', fontWeight: 600, color: '#172B4D' },
  emptyText: { margin: '8px 0 20px', fontSize: '13px', color: '#6B778C' },
  grid: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px',
  },
  card: {
    background: '#fff', borderRadius: '8px', border: '1px solid #DFE1E6',
    padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
  },
  cardTitle: { margin: '0 0 2px', fontSize: '14px', fontWeight: 600, color: '#172B4D' },
  cardDesc: { margin: '0 0 12px', fontSize: '11px', color: '#6B778C' },
  svg: { width: '100%', height: 'auto', display: 'block' },
  donutWrap: { display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' },
  donutLegend: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '100px' },
  legendRow: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' },
  legendSwatch: {
    width: '10px', height: '10px', borderRadius: '2px', flexShrink: 0,
  },
  legendLabel: { color: '#42526E', fontWeight: 500 },
  legendCount: { color: '#6B778C', fontWeight: 600, marginLeft: 'auto' },
};
