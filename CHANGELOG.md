# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

Phase 1 (Gantt parity with BigPicture) is complete. Upcoming Phase 2: Boxes (portfolio hierarchy), Scope/WBS tree, Roadmap (quarterly zoom).

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
