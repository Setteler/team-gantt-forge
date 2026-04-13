# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Phase 3 in progress. Upcoming: Risks (register + 5×5 matrix), Resources (capacity heatmap).

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
