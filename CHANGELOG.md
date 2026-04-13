# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

BigPicture-parity work in progress. Upcoming: critical path, baselines, working calendar, Boxes (portfolio hierarchy).

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
