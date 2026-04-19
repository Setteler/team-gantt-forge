# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Polish continuing. Possible next: SAFe PI Board, Priorities (RICE/WSJF), Financials, or feature parity on Project view (drag/arrows/critical path).

## [1.11.0] - 2026-04-13

### Changed

- **Modules are now opt-in.** First-time users see a clean sidebar with just views and Boxes — no modules listed. A new **"+ Add"** button in the MODULES header opens an inline picker showing all 5 available modules (Teams, Risks, Objectives, Resources, Reports) with descriptions and Enable/Disable toggles. Enabled modules appear in the sidebar; disabling a module hides it but does NOT delete its data (re-enabling brings it back). Stored in KVS under `gantt_enabled_modules`.
- Backend: `getEnabledModules`, `saveEnabledModules` resolvers with validation against known module IDs.

## [1.10.2] - 2026-04-13

### Fixed

- **Configure panel showed irrelevant options for hierarchical views.** Tree and Project views organize issues by Jira's `parent` field (with Epic Link fallback) — there is no group-by, and they don't render custom events. Previously the Configure panel still showed the two "Group rows by" field selectors and the "Data source" toggle. Now:
  - For Tree / Project: group-by sections are replaced by a short note explaining hierarchy comes from the parent field; data-source toggle is hidden.
  - For Timeline / List / Roadmap: unchanged.

## [1.10.1] - 2026-04-13

### Fixed

- **Stale issues shown after switching to a view with no data source.** When a user switched from a view backed by a JQL filter (or Box-inherited JQL) to a view with empty filter / no projects / no parent-Box JQL, the previous view's issues remained visible. The useEffect early-return only cleared loading state, not the `issues` array. Now cleared explicitly so the empty-state ("No issues found") renders correctly for such views.

## [1.10.0] - 2026-04-13

### Added

- **Project view (WBS + Gantt hybrid, MS Project style)** — fifth view type: hierarchical issue tree on the left (400px wide, sticky-horizontally), Gantt timeline on the right, identical row heights so each tree node visually aligns with its bar. Single vertical scroll container synchronizes both sides. Three bar styles: **leaf issues** render as solid blue bars, **expanded parents** as thin gray summary brackets (MS Project style, tick marks at each end), **collapsed parents** as dark navy bars at the rolled-up date range. Expand/collapse triangles in the tree. "Expand all" / "Collapse all" buttons. Pick "Project" when creating a view. Teal ▥ icon.
- Deferred on purpose for MVP: drag-to-move bars, dependency arrows, critical path highlight. These already exist on the standalone Timeline view and can be ported to Project in a follow-up.

## [1.9.0] - 2026-04-13

### Added

- **Box-scoped JQL (Boxes finally matter for data)** — a Box can hold a **default JQL filter** and **description**. Views inside the Box (and inside its descendants) automatically use the Box's filter when they don't have their own. Resolution walks UP the Box chain: `view.folderId → box.parentId → …`, and the first non-empty `defaultJql` wins. Cycle-safe with a visited set. Open the Box config via the new ⚙ action in the Box hover menu. Sidebar shows a ⌘ glyph next to any Box that has a filter set.
- Boxes finally earn their "portfolio container" name — a Portfolio Box can hold `project = FOO OR project = BAR`, and every view inside just works without per-view setup.

## [1.8.0] - 2026-04-13

### Added

- **Objectives / OKRs module** — lightweight OKRs with linked Jira issues and auto-rolled-up progress. Each objective has title, timeframe, owner, status (active / achieved / missed / archived), and N Key Results. Each KR can compute progress **automatically** (% of its linked issues in Done status) or use a **manual** 0–100% override. Objective progress is the average across its KRs. Card layout with status badges, progress bars per objective and per KR, status filter. Stored in KVS under `gantt_objectives` (global). 🎯 icon in MODULES sidebar.
- Backend: `getObjectives`, `saveObjective`, `deleteObjective` resolvers.

## [1.7.0] - 2026-04-13

### Added

- **Reports module** — classic PM dashboards, pure SVG (no chart library). **Burndown** compares actual remaining issues (Done issues use their end date as resolution date) against an ideal linear line. **Throughput** bars count issues resolved per week. **Status distribution** donut chart shows count per status with the same status colors used on Gantt bars. 12-week window, ±4-week pagination. 📈 icon in MODULES sidebar.

## [1.6.0] - 2026-04-13

### Added

- **Resources module** — capacity heatmap showing per-person workload across weeks. Rows = team members (union of all teams + untracked issue assignees). Columns = 12 weeks centered on today, paginate ±4 weeks. Each cell = utilization % based on `overlapping_issues × 8 hrs ÷ weekly_capacity`, color-coded green → yellow → orange → red. Team filter dropdown (All Teams / per-team / No Team / Unassigned). Click a cell to see which issues contribute to that week's load. Pure client-side aggregation over existing `issues` + `teams` state — no new backend resolvers. 📊 icon in MODULES sidebar.

## [1.5.0] - 2026-04-13

### Added

- **Risks module** — track risks to delivery with probability × impact scoring. Two views: **List** (sorted by score descending, with colored status + score chips) and **5×5 Matrix** (classic probability × impact grid, green → red gradient based on score). Each risk: title, description, probability (1–5), impact (1–5), status (open / mitigating / accepted / closed), owner, mitigation plan, linked Jira issue keys. Stored in KVS under `gantt_risks` (global). Create / edit via modal, delete via row action. ⚠️ icon in the MODULES sidebar.
- Backend: `getRisks`, `saveRisk`, `deleteRisk` resolvers.

## [1.4.0] - 2026-04-13

### Added

- **Modules concept** — new "MODULES" section in the sidebar beneath BOXES for org-level management pages that aren't issue views. Clicking a module swaps the content area; clicking a view returns. Views and modules are mutually-exclusive selections.
- **Teams module** — first module. Manage org teams (name, description, members with role + weekly capacity hours). Card grid with per-team member list, total weekly capacity badge, Edit / Delete actions. Modal for create/edit with repeatable member rows. Stored in KVS under `gantt_teams` (global, not view-scoped). Powers the upcoming Resources module.
- Backend: `getTeams`, `saveTeam`, `deleteTeam` resolvers.

## [1.3.0] - 2026-04-13

### Added

- **Roadmap view** — fourth view type (alongside Timeline / List / Tree). Renders the same Jira issue data as the Gantt but at **quarterly zoom** for portfolio-level overview: 8-year span centered on today, one column per quarter, smooth sub-quarter bar positioning, two-level grouping (same as Gantt), today line at the current quarter. Read-only: no drag, no arrows, no custom events, no drag-create — just the overview. Purple ▧ icon. Pick "Roadmap" when creating a view.

## [1.2.0] - 2026-04-13

### Added

- **Scope / WBS tree view** — third view type alongside Timeline and List. Renders Jira issues as a hierarchical tree using the `parent` field (with fallback to `customfield_10014` / Epic Link for company-managed projects). Each row shows issue key, summary, status, date range, and assignee. Parents have a ▸/▾ expand toggle and can show a rolled-up date range (min start → max end across descendants) when collapsed. "Expand all" / "Collapse all" button. Cycles in the parent graph are detected and handled safely. Pick "Tree" when creating a view, or switch to it from the Configure panel. Backend `getIssues` now also returns `parent` and `customfield_10014`.

## [1.1.1] - 2026-04-13

### Fixed

- **CSP violation on load** — Forge's strict Content-Security-Policy was blocking the inline `<style>` block in `public/index.html`. Moved those styles (box-sizing reset, spinner keyframes, scrollbar skins) into a `src/styles.css` file imported by `index.js`, which react-scripts extracts into a hashed `.css` bundle served from Forge's allowed origin. No visual change; the CSP error in the console is gone.
- **Event title leaked into Milestone name** when switching the Add Event modal's Type from a built-in type (On-Call / Vacation / OOO) to Milestone or Custom: the pre-filled "On-Call" label stayed in the title field. Title is now cleared when it matches a built-in label, but preserved if the user has started typing their own milestone name.

## [1.1.0] - 2026-04-13

### Added

- **Boxes (portfolio hierarchy)** — folders are now full-fledged Boxes with a **type** (Portfolio / Program / Project / Custom) and **nesting** (a Box can live inside another Box). Sidebar renders the tree recursively with depth-based indentation. Each Box gets a colored type badge (blue Portfolio, purple Program, green Project; Custom shows no badge for parity with legacy folders). Drag a Box into another Box to re-parent; cycle prevention blocks dragging into self or descendants. Per-Box hover actions: **+** add child Box, **↗** move (target picker excludes invalid targets), **✏** rename, **🗑** delete (children get auto-un-parented, views inside go to root).
- Backward compat: existing folders backfill to `{ boxType: 'custom', parentId: null }` and continue to work unchanged.
- Storage: still scoped by `folderId` for events and baselines (no scope-rollup yet — that's a later feature).

## [1.0.6] - 2026-04-13

### Added

- **Working calendar / holidays** — define a global list of holidays (date + name) in the Configure panel. Holidays appear as pink shaded columns on the timeline (overriding weekend gray on overlapping days), with the holiday name as a hover tooltip in the header. Storage is global (single calendar across all views and users).
- New backend resolvers: `getHolidays`, `saveHolidays`.

## [1.0.5] - 2026-04-13

### Added

- **Baselines** — snapshot the current view's issue dates and event dates as a named baseline (e.g., "Sprint 12 start"). Activate any baseline to overlay faded ghost bars at the snapshotted positions, alongside the current bars — instantly see how plans have drifted. Baselines are scoped per view (folder views share, standalone views own theirs) and migrate automatically when a view is moved between folders. Manage from the **Configure** panel.
- New backend resolvers: `getBaselines`, `saveBaseline`, `deleteBaseline`, `migrateViewBaselines`.

## [1.0.4] - 2026-04-13

### Added

- **Critical path** — the longest dependency chain through the rendered "Blocks" graph is computed and highlighted. Issues on the critical path get a thicker red border; their connecting arrows are drawn in red (saturated dark red `#BF2040` if the dependency is also a schedule violation). Toggle in the gantt filter bar (default on). Algorithm: Kahn's topological sort with earliest-finish propagation; cycles detected and skipped gracefully.

## [1.0.3] - 2026-04-13

### Added

- **Milestones** — single-date markers rendered as pink diamonds on the Gantt. Modeled as a new custom-event type (`milestone`) so they share the storage, view scoping, and drag/click behavior of existing events. Resize handles are hidden for milestones; the title appears as a label next to the diamond. Use the **+ Add Event** button and pick **◆ Milestone**, or drag-create on the timeline and switch type in the modal.

## [1.0.2] - 2026-04-13

### Added

- **Dependencies (issue links as arrows)** — Jira "Blocks" issue links now render as orthogonal arrows between Gantt bars. Arrows turn red when a predecessor's end date falls after the successor's start date, indicating a schedule violation. Links are read-only on the Gantt chart; to create or remove dependency links, use Jira's standard issue-link UI.
- Backend automatically includes `issuelinks` in the set of fields fetched from Jira, so dependency data is available without extra configuration.

## [1.0.1] - 2026-04-13

### Changed

- Version bump from 1.0.0 to 1.0.1.

### Removed

- Dead `src/resolvers/index.js` file removed.
- `node_modules` untracked from the repository (repo hygiene).
