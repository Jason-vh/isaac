# Isaac - Discovery Document

## Vision

Isaac is a personal impact tracker for my work at FareHarbor. It aggregates activity from multiple sources into a single system of record, serving two goals:

1. **Impact tracking** - A living brag document that captures what I've done, links it to objectives, and tells the story of my contributions.
2. **WBSO hour estimation** - A data source for weekly R&D hour submissions, categorised per ticket and grouped by epic.

## Design Principles

- **Store facts, derive meaning.** Isaac records raw events ("commented on MR !432", "attended meeting X"). Interpretations like "reviewed" or WBSO categories are derived at report time, not at ingestion.
- **Infer links, allow manual override.** Automate linking where possible (e.g. MR branch name → ticket), but always allow manual correction.
- **Propose, then automate.** WBSO estimates start as suggestions I review and adjust. Over time, Isaac fills them in autonomously.
- **Single user, shareable.** No multi-tenancy. Everything is behind a passkey login, just for me. Read-only views can be shared via expiring links (24h JWT).

## Data Sources

| Source | What we track | Sync method |
|---|---|---|
| **Jira** | Tickets created, tickets closed/transitioned, story points, epics | Periodic (hourly) via API |
| **GitLab** | All project MRs (authored, reviewed, team). "Reviewed" = approved or commented. | Periodic (hourly) via API |
| **GitLab Pipelines** | Pipeline durations, per-job timing, retry/flaky rates, DAG dependencies (all pipelines, not just mine) | Periodic (hourly) via REST + GraphQL API |
| **Confluence** | Documents published, documents commented on (stretch) | Periodic (hourly) via API |
| **Google Calendar** | Meetings attended, holidays/OOO | Periodic (hourly) via API |
| **Slack bot** | Wins logged manually (shorthand, enriched later on web) | Real-time via Slack app |

Identity is consistent across systems (same email, API tokens scoped to me).

## Domain Model

### Core Entities

**Ticket**
Jira issue. Has story points, belongs to an epic, has status transitions. The fundamental unit of dev work.

**Epic**
Groups tickets into projects. Also a Jira issue. Maps to WBSO projects. The primary linking grain for documents and meetings.

**Merge Request**
GitLab MR. All project MRs are stored for denominator metrics (e.g. review percentage). Three classes: authored (`authoredByMe`), reviewed (`reviewedByMe` — approved or commented, not authored), and team (neither). Events are only created for MRs the user participated in. Linked to tickets via branch name (inferred, case-insensitive). Can also be manually linked to a ticket via the entry detail panel or the unlinked MRs panel.

**Document**
Confluence page. Tracked events: published, commented on. Linked to epics (inferred where possible, manual otherwise).

**Meeting**
Google Calendar event. Categorised as dev, non-dev, leave, or ignore. Leave detection uses keyword matching on the event title (sick, OOO, holiday, vacation, etc.). Working-location events (Home, Office, etc.) are ignored entirely. Linked to epics where possible (inferred or manual). Linking a meeting to a ticket automatically resolves its epic and sets the category to "dev". All-day and multi-day events are placed on every weekday they span using Amsterdam timezone boundaries.

**Win**
Manually logged via Slack bot, enriched on the web app. Qualitative and narrative. Can link to any other entity (tickets, epics, OKRs).

**Objective**
Annual objective with Key Results (half-yearly reviews). Key Results are evidenced by tickets, wins, and other activity. KRs can optionally have a `data_source` that auto-updates their `current_value` from live data after each sync (e.g. `pipeline:max_duration` computes the current max pipeline duration in minutes from synced pipeline data).

### Relationships

- Tickets belong to epics
- MRs link to tickets (inferred from branch names)
- Documents and meetings link to epics (inferred where possible, manual otherwise)
- Wins link to anything (manual)
- Key Results are evidenced by any of the above

### WBSO Estimation

The primary output. Isaac estimates hours per ticket per day, placed into categories:

| Category | Description |
|---|---|
| Coding | Dev work linked to a ticket (commits) |
| Code review | Review activity on other people's MRs |
| Dev meeting | Meetings linked to a ticket/epic |
| Dev miscellaneous | Dev work not linked to a ticket |
| Non-dev | General company meetings, etc. |
| Leave | Sick days, holidays, OOO (detected from calendar event titles) |

#### Fill-to-8h algorithm

Every working day must total exactly 8 hours. The algorithm:

1. **Meetings** use their actual calendar duration.
2. **Leave** fills the entire 8h day — no other activity is placed on leave days.
3. **Remaining hours** (`8 - meeting_hours`) are distributed proportionally across coding and review activities using relative weights:
   - Coding weight: `changesCount * (dayCommits / totalCommits)` — files changed scaled by commit proportion on that day (min weight: 60)
   - Review weight: `changesCount * 0.1` — files changed with a 0.1 factor (reviewing is faster than writing, min weight: 10)
4. **Zero-activity days** borrow coding weights from the next weekday that has commits (you were working on things you committed the next day).
5. **0.25h minimum** per coding entry, **10 min minimum** per review entry, with redistribution from larger entries.
6. **Quarter-hour rounding** uses Hamilton's method (largest remainder) to preserve the 8h total exactly.

At submission time, hours are grouped by epic (WBSO project) to produce a weekly summary that can be transcribed into the WBSO web form. The WBSO view groups entries by epic per day, with epic headers linking to Jira and ticket keys linking to individual issues. Epics are sorted by their Jira creation date (oldest first), with unlinked entries shown last under a "No epic" divider. Each day header shows a stacked progress bar colored by category (emerald=coding, violet=review, fuchsia=dev meeting/misc, amber=non-dev, gray=leave). Navigation is bounded to the current week (no future weeks). The epic summary table uses clickable Jira-linked titles with category-colored columns, also sorted by Jira creation date.

Clicking an entry chip opens a slide-over detail panel showing the entry's underlying data: MR details (title, branch, additions/deletions, GitLab link), commits, meeting info (time, duration), and ticket/epic linkage. The panel includes a ticket search (by key or title) for linking unlinked entries — searching resolves the ticket's epic and displays epic badges in the results. Unlinked MRs listed at the bottom of the WBSO view also have inline ticket search for quick linking.

## User Flows

### Daily
- Isaac syncs data hourly from all sources
- I check the dashboard throughout the day — two-column layout with:
  - Stats cards (tickets closed, MRs merged, meetings, docs published)
  - Week grid with compact day summaries (meeting chips + grouped activity counts)
  - Activity feed grouped by day with expand/collapse
  - Sidebar: sprint velocity chart (12-week SP history), quick links, projects worked on, work distribution
- I log wins via Slack when something notable happens (`/isaac win Shipped the new booking flow`)

### Weekly
- Isaac proposes WBSO hour estimates for the week
- I review and adjust on the dashboard
- Isaac produces a weekly summary I transcribe into the WBSO form
- Eventually: Isaac exports a data format I can feed to a VPN-side script for automated submission

### Periodically
- Review OKR progress on the Objectives page — expand objectives to see linked evidence (epics auto-resolve child tickets, MRs, and docs)
- Track CI/CD health on the Pipelines page — scatter chart of pipeline durations (merge vs train), Gantt chart of p50 job durations with dependency graph, sortable job overview with retry rates. Drill into individual pipeline detail pages for job waterfall timelines.
- Use accumulated data for performance reviews, brag documents, retrospectives

### Admin (`/admin` — not in nav)
- Trigger manual syncs (all sources or selected subset) — different sources can run in parallel
- View sync log history and clean up stale running entries from interrupted processes

## Technical Decisions

- **Backend:** Bun
- **Frontend:** Vue SPA + Tailwind
- **Database:** PostgreSQL
- **Hosting:** Railway (accessible at isaac.vhtm.eu)
- **Slack:** Custom app already installed in company workspace
- **Historical data:** Backfill ~1 month if feasible, not critical
