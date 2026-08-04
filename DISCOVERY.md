# Isaac - Discovery Document

## Vision

Isaac is a personal impact tracker for my work at FareHarbor. It aggregates activity from multiple sources into a single system of record, serving two goals:

1. **Impact tracking** - A living brag document that captures what I've done, links it to objectives, and tells the story of my contributions.
2. **WBSO hour estimation** - A data source for weekly R&D hour submissions, categorised per ticket and grouped by epic.

## Design Principles

- **Store facts, derive meaning.** Isaac records raw events ("commented on MR !432", "attended meeting X"). Interpretations like "reviewed" or WBSO categories are derived at report time, not at ingestion.
- **Infer links, allow manual override.** Automate linking where possible (e.g. MR branch name → ticket), but always allow manual correction.
- **Propose, then automate.** WBSO estimates start as suggestions I review and adjust. Over time, Isaac fills them in autonomously.
- **Single user, shareable.** No multi-tenancy. Everything is behind a passkey login, just for me. Read-only views can be shared via expiring links (24h DB-backed token, scoped to the page section that was shared).
- **One viewer, many subjects.** Isaac has a single *user* but tracks many *people*. Teammates are first-class entities so team-level questions can be answered, but they never log in and there is still no tenancy boundary.

## Data Sources

| Source | What we track | Sync method |
|---|---|---|
| **Jira** | Tickets created, tickets closed/transitioned, story points, epics | Periodic (hourly) via API |
| **GitLab** | All project MRs (authored, reviewed, team) with per-file line counts and per-person review attribution. "Reviewed" = approved or commented. Full comment content stored for quality tracking. | Periodic (hourly) via REST + GraphQL API |
| **GitLab Pipelines** | Pipeline durations, per-job timing, retry/flaky rates, DAG dependencies (all pipelines, not just mine) | Periodic (hourly) via REST + GraphQL API |
| **Confluence** | Documents published, documents commented on (stretch) | Periodic (hourly) via API |
| **Google Calendar** | Meetings attended, holidays/OOO | Periodic (hourly) via API |
| **Slack bot** | Wins logged manually (shorthand, enriched later on web) | Real-time via Slack app |
| **GitLab emails** | MR comments, approvals, merges, pipeline results, review requests, mentions | Real-time via JMAP EventSource (isaac-notify service) — emails parsed for identifiers, enriched via GitLab API, persisted as activity items |

Identity is consistent across systems: corporate email is the join key between
GitLab and Jira accounts. API tokens are scoped to me, but the data they return
covers the whole team.

## Domain Model

### Core Entities

**Ticket**
Jira issue. Has story points, belongs to an epic, has status transitions. The fundamental unit of dev work.

**Epic**
Groups tickets into projects. Also a Jira issue. Maps to WBSO projects. The primary linking grain for documents and meetings.

**Merge Request**
GitLab MR. All project MRs are stored for denominator metrics (e.g. review percentage). Three classes: authored (`authoredByMe`), reviewed (`reviewedByMe` — approved or commented, not authored), and team (neither). Events are only created for MRs the user participated in. Linked to tickets via branch name (inferred, case-insensitive). Can also be manually linked to a ticket via the entry detail panel or the unlinked MRs panel.

**MR state event**
A lifecycle change on an MR — draft, ready, approved, unapproved, commits pushed,
review requested — recorded for every MR in the project. GitLab keeps these as
system notes rather than fields, so they are parsed out of the note stream during
sync. They define an MR's review window and its rework rounds.

**Document**
Confluence page. Tracked events: published, commented on. Linked to epics (inferred where possible, manual otherwise).

**Meeting**
Google Calendar event. Categorised as dev, non-dev, leave, or ignore. Leave detection uses keyword matching on the event title (sick, OOO, holiday, vacation, etc.). Working-location events (Home, Office, etc.) are ignored entirely. Linked to epics where possible (inferred or manual). Linking a meeting to a ticket automatically resolves its epic and sets the category to "dev". All-day and multi-day events are placed on every weekday they span using Amsterdam timezone boundaries.

**Person**
An engineer or teammate, keyed by corporate email, with optional GitLab and Jira
identities attached. Created automatically during sync; bots are never recorded.
Exactly one person is flagged `isMe`. Persons are the grain for team-level
reporting: MRs have an author, reviews have a reviewer, tickets have an assignee.

**Win**
Manually logged via Slack bot, enriched on the web app. Qualitative and narrative. Can link to any other entity (tickets, epics, OKRs).

**Objective**
Annual objective with Key Results. Objectives and KRs are hardcoded in `shared/objectives.ts` with human-readable slugs (e.g. `code-to-production`, `pipeline-duration`). Key Results are evidenced by tickets, wins, and other activity linked via `entity_links`.

### Relationships

- Tickets belong to epics
- Tickets have an assignee, a reporter, and an assignee-at-close (all people)
- MRs have an author (a person) and many reviews (one per reviewing person)
- MRs have lifecycle state events, and review threads that are opened and resolved
- MRs have per-file line counts, categorised frontend/backend/other
- MRs link to tickets (inferred from branch names)
- Documents and meetings link to epics (inferred where possible, manual otherwise)
- Wins link to anything (manual)
- Key Results are evidenced by any of the above

### Team Productivity

A secondary output: how work is distributed across the team. Three measures per
engineer over a period, each split frontend/backend/other by file path.

| Measure | Definition |
|---|---|
| Lines merged | Additions across files in MRs the person authored, by merge date |
| Lines reviewed | Additions across files in MRs the person approved or commented on, by review date |
| Tickets closed | Tickets whose assignee-at-close was the person, plus their story points |

Deliberate interpretation choices:

- **Lines of code is a volume signal, not a value signal.** It is easy to game
  and rewards verbosity. It is shown next to MR and ticket counts so it is never
  read alone, and generated files (lockfiles, codegen output, snapshots) are
  excluded so a dependency bump can't swamp a week of real work.
- **Every reviewer is credited the full diff.** Two people reviewing one MR each
  get its full line count, so team-wide reviewed lines exceed merged lines. This
  measures review load, which is the useful question.
- **Closed tickets attribute to the assignee at close time**, not the person who
  dragged the ticket to Done — that is often QA or a PM.
- **Tests count as code.** Backend tests live under `backend/`, and `e2e/`
  counts as "other", which is why QA-authored work shows up there.

### Review Health

How the team's review process behaves, scoped to MRs merged in a period. Distinct
from team productivity: that asks who did the work, this asks how the work got
reviewed.

| Measure | Definition |
|---|---|
| Time to first approval | From review start to the first approval by anyone |
| Time to the approval that held | From review start to the last approval, the one that survived to merge |
| Time to merge | The full review window |
| Last approval → merge | The tail after review is done |
| Comments per MR, per 100 lines | Review depth, raw and normalised for size |
| Approval resets | Approvals wiped out by a later push |
| Threads opened / resolved | Review threads, and how many got closed out |
| Reviewer load | Reviews, approvals and comments per person, and how concentrated they are |

Deliberate interpretation choices:

- **Review starts when the MR goes in front of reviewers**, which is the
  earliest of marked ready, reviewers requested, or a first review comment — not
  the ready flag, since a third of MRs have reviewers requested while still a
  draft. Measuring from MR creation is wrong in the other direction: an author
  sitting on a branch for a week isn't a slow review.
- **The first approval often isn't the real one.** A push resets approvals, and
  43% of merged MRs have more than one approval event, so an approval can be
  wiped out minutes after it lands. Both are reported — how fast someone looked,
  and when the MR was actually approved — alongside how often approvals reset.
- **First approval is the fastest of many.** Reviews are typically requested from
  the whole team at once, so "time to first approval" is a minimum over ~8
  people and will always look quick. It measures responsiveness, not effort.
- **Weekends are excluded from durations.** An MR that goes up Friday evening
  and merges Monday morning waited hours, not days.
- **Medians and tails, never averages.** Review latency is heavily skewed; the
  p90 is where the pain lives.
- **Comment counts are normalised by size.** A raw comment count mostly measures
  how big the MR was.
- **Approval without comment is flagged, not judged.** A trivial MR deserves a
  fast approval; a 1,000-line one probably doesn't. The scatter of size against
  review time is the honest version of that question.

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
   - Coding weight: `filesChanged * (dayCommits / totalCommits)` — files changed scaled by commit proportion on that day (min weight: 60)
   - Review weight: `filesChanged * 0.1` — files changed with a 0.1 factor (reviewing is faster than writing, min weight: 10)
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
- Compare team throughput on the Team page (`/team`) — lines merged, lines reviewed, tickets closed and story points per engineer over a chosen period, with each engineer's output split frontend/backend/other and a weekly trend chart. Useful for spotting review load imbalance and where each person's work sits in the stack.
- Track CI/CD health on the Pipelines page — scatter chart of pipeline durations (split by pipeline type or change scope: frontend/backend/fullstack/neither), with selectable p50/p90/p99 trend line. Job overview with duration variance, critical path %, retry rates, and scope filter. Expand any job for a daily timeline chart (duration, retry rate, critical %). Drill into individual pipeline detail pages for job waterfall timelines. All job filters support `-prefix` exclusion.
- Use accumulated data for performance reviews, brag documents, retrospectives

### Admin (`/admin` — not in nav)
- Trigger manual syncs (all sources or selected subset) with optional `since` date and `force` re-sync toggle — different sources can run in parallel
- View sync log history (with duration) and clean up stale running entries from interrupted processes

## Technical Decisions

- **Backend:** Bun
- **Frontend:** Vue SPA + Tailwind
- **Database:** PostgreSQL
- **Hosting:** Railway (accessible at isaac.vhtm.eu)
- **Slack:** Custom app already installed in company workspace
- **Historical data:** Backfill ~1 month if feasible, not critical
