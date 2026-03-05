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
| **GitLab** | MRs authored, MRs merged, MRs commented on | Periodic (hourly) via API |
| **GitLab Pipelines** | Pipeline durations, per-job timing, retry/flaky rates (all pipelines, not just mine) | Periodic (hourly) via API |
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
GitLab MR. Tracked events: authored, merged, commented on. Linked to tickets via branch name (inferred).

**Document**
Confluence page. Tracked events: published, commented on. Linked to epics (inferred where possible, manual otherwise).

**Meeting**
Google Calendar event. Categorised as dev or non-dev. Linked to epics where possible (inferred or manual).

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
| Coding/commit | Dev work linked to a ticket |
| Dev meeting | Meetings linked to a ticket/epic |
| Dev miscellaneous | Dev work not linked to a ticket (e.g. code reviews) |
| Non-dev | General company meetings, etc. |
| Leave/holiday/sickness | Time off |

Hours are estimated from activity signals (commits, MR size, calendar events) and proposed by Isaac. Estimates don't need to be exact - reasonable approximations are fine.

At submission time, hours are grouped by epic (WBSO project) to produce a weekly summary that can be transcribed into the WBSO web form.

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
- Track CI/CD health on the Pipelines page — weekly duration trends, slowest jobs, flakiest jobs
- Use accumulated data for performance reviews, brag documents, retrospectives

## Technical Decisions

- **Backend:** Bun
- **Frontend:** Vue SPA + Tailwind
- **Database:** PostgreSQL
- **Hosting:** Railway (accessible at isaac.vhtm.eu)
- **Slack:** Custom app already installed in company workspace
- **Historical data:** Backfill ~1 month if feasible, not critical
