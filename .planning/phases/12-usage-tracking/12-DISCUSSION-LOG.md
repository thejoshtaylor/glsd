# Phase 12: Usage Tracking - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-11
**Phase:** 12-usage-tracking
**Areas discussed:** Session-level display, Usage dashboard layout, Cost display format, History depth & API shape

---

## Session-Level Display

| Option | Description | Selected |
|--------|-------------|----------|
| Terminal page header badge | Small token+cost badge in session header | |
| Collapsible panel below terminal | Session Cost panel appears after taskComplete | |
| Activity feed card on completion | taskComplete feed item updates with cost data | ✓ |

**User's choice:** Activity feed card on completion

---

## Activity Feed Detail Level

| Option | Description | Selected |
|--------|-------------|----------|
| Cost only | e.g. "Task completed · $0.04" | |
| Cost + total tokens | e.g. "Task completed · 1,212 tokens · $0.04" | |
| Full breakdown inline | e.g. "Task completed · in:900 out:312 · $0.04 · 42s" | ✓ |

**User's choice:** Full breakdown inline

---

## Usage Dashboard Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Cost chart + session list | Total/node bars at top, daily BarChart, session table below | ✓ |
| Node cards + breakdown | Per-node stat cards, combined chart | |
| Sessions-first table | Sortable table only, no chart | |

**User's choice:** Cost chart + session list (with recharts BarChart)

---

## Default Time Range

| Option | Description | Selected |
|--------|-------------|----------|
| Last 30 days | 30d default, period selector (7d/30d/90d/all) | ✓ |
| Current calendar month | Resets on the 1st | |
| All time | No filter | |

**User's choice:** Last 30 days with period selector

---

## Cost Display Format

| Option | Description | Selected |
|--------|-------------|----------|
| $0.0042 — raw precision | 4 decimal places always | |
| $0.00 — 2 decimal places | Standard currency | |
| Smart formatting | < $0.01 / $X.XX / $XX.XX thresholds | ✓ |

**User's choice:** Smart formatting
**Notes:** Zero cost (0.0) shows as $0.00, not "< $0.01". Only use "< $0.01" when cost > 0 but < 0.01.

---

## API Shape

| Option | Description | Selected |
|--------|-------------|----------|
| GET /usage/ + GET /usage/summary | Two endpoints: records + aggregates | ✓ |
| Extend GET /sessions/ | Add usage fields to SessionPublic | |
| Single GET /usage/ with all data | One fat endpoint | |

**User's choice:** GET /usage/ + GET /usage/summary (matches existing REST pattern)

---

## History Depth / Pagination

| Option | Description | Selected |
|--------|-------------|----------|
| Last 50 sessions, no pagination | Simple, matches 30d time range | |
| Paginated, 25 per page | Prev/Next controls | ✓ |
| All sessions in period | No cap | |

**User's choice:** Paginated, 25 per page

---
