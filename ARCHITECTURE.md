# Isaac - Architecture

## Tech Stack

- **Runtime:** Bun
- **Backend:** Elysia
- **Database:** PostgreSQL + Drizzle ORM
- **Auth:** Passkeys (WebAuthn) + JWT
- **Frontend:** Vite + Vue 3 + Tailwind CSS
- **Hosting:** Railway (isaac.vhtm.eu)
- **Sync:** Railway cron jobs
- **Slack:** Custom app (already installed)

## Project Structure

```
isaac/
├── CLAUDE.md
├── DISCOVERY.md
├── ARCHITECTURE.md
├── package.json                # Bun workspace root
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts            # Elysia app entry
│   │   ├── env.ts              # Env var validation (fail fast on startup)
│   │   ├── db/
│   │   │   ├── schema.ts       # Drizzle schema (all tables)
│   │   │   └── index.ts        # DB connection
│   │   ├── auth/
│   │   │   ├── challenges.ts   # In-memory challenge store (5-min TTL)
│   │   │   ├── jwt.ts          # JWT sign/verify with jose
│   │   │   └── middleware.ts   # Elysia beforeHandle guard
│   │   ├── routes/
│   │   │   ├── auth.ts         # WebAuthn register/authenticate endpoints
│   │   │   ├── dashboard.ts    # GET /dashboard/week/:date, GET /dashboard/velocity
│   │   │   ├── sync.ts         # POST /sync/trigger (backfill support)
│   │   │   ├── tickets.ts
│   │   │   ├── merge-requests.ts
│   │   │   ├── confluence-documents.ts
│   │   │   ├── meetings.ts
│   │   │   ├── wins.ts
│   │   │   ├── objectives.ts
│   │   │   ├── pipelines.ts    # Pipeline metrics (weekly stats, slowest/flaky jobs)
│   │   │   ├── share.ts        # POST /share (generate share URL)
│   │   │   └── wbso.ts
│   │   ├── sync/
│   │   │   ├── run.ts          # Cron entry point (with concurrent-sync guard)
│   │   │   ├── jira.ts
│   │   │   ├── gitlab.ts
│   │   │   ├── gitlab-pipelines.ts  # Pipeline + job sync (all pipelines, not just mine)
│   │   │   ├── confluence.ts
│   │   │   ├── calendar.ts     # Calls Apps Script endpoint
│   │   │   ├── linker.ts       # Infers links between entities
│   │   │   └── kr-updater.ts   # Auto-updates KRs with data_source from live data
│   │   ├── slack/
│   │   │   └── handler.ts
│   │   └── wbso/
│   │       └── estimator.ts    # Computes estimates on the fly
│   └── drizzle.config.ts
├── web/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── index.html
│   └── src/
│       ├── main.ts
│       ├── App.vue
│       ├── router/
│       │   └── index.ts
│       ├── composables/
│       │   ├── useAuth.ts      # Auth state + passkey ceremonies
│       │   ├── useDashboard.ts  # Dashboard data fetching
│       │   ├── useObjectives.ts # OKR CRUD + evidence management
│       │   ├── usePipelines.ts  # Pipeline metrics fetching
│       │   ├── usePipelineWaterfall.ts # Pipeline waterfall data fetching
│       │   └── useWbso.ts       # WBSO week data fetching
│       ├── components/
│       │   ├── dashboard/
│       │       ├── WeekPicker.vue
│       │       ├── StatsCards.vue
│       │       ├── WeekGrid.vue
│       │       ├── DayTimeline.vue    # Compact day summary (meetings + grouped activity)
│       │       ├── ActivityFeed.vue   # Day-grouped activity feed with expand/collapse
│       │       ├── FeedRow.vue        # Single feed item row
│       │       ├── VelocityChart.vue  # SP/ticket velocity bar chart (12 weeks)
│       │       ├── ProjectsPanel.vue  # Tickets worked on this week
│       │       ├── QuickLinks.vue     # Links to Jira, GitLab, Confluence, etc.
│       │       └── WeekDistribution.vue # Work distribution breakdown + daily volume
│       │   ├── objectives/
│       │       ├── ObjectiveCard.vue        # Expandable objective with KR list
│       │       ├── KeyResultRow.vue         # Single KR with status badge + progress
│       │       ├── StatusBadge.vue          # on_track/at_risk/behind/completed pill
│       │       ├── EvidencePanel.vue        # Linked evidence items (epics, tickets, MRs, docs)
│       │       └── EvidencePicker.vue       # Search + add epic evidence to a KR
│       │   ├── pipelines/
│       │   │   ├── PipelineStatsCards.vue   # Max/P90 duration + success rate
│       │   │   ├── DurationTrendChart.vue   # Grouped bar chart with 15m target line
│       │   │   ├── SlowestJobsList.vue      # Top 10 slowest jobs by avg duration
│       │   │   ├── FlakyJobsList.vue        # Top 10 flakiest jobs by retry count
│       │   │   ├── PipelineWaterfallCard.vue # Pipeline list item linking to waterfall
│       │   │   └── WaterfallChart.vue        # Job timeline bars with DAG dependency lines
│       │   └── wbso/
│       │       ├── WbsoCategoryCards.vue    # 5 stat cards (Coding, Dev Meeting, Dev Misc, Non-Dev, Total)
│       │       ├── WbsoWeekGrid.vue         # 5-column Mon-Fri grid with entries per day
│       │       ├── WbsoEntryChip.vue        # Single entry chip with category color + reasoning
│       │       ├── WbsoEpicSummary.vue      # Table grouped by epic for WBSO form
│       │       └── WbsoUnlinkedPanel.vue    # Collapsible panel for MRs without ticket links
│       ├── views/
│       │   ├── DashboardView.vue
│       │   ├── ObjectivesView.vue
│       │   ├── PipelinesView.vue
│       │   ├── PipelineWaterfallView.vue
│       │   ├── WbsoView.vue
│       │   └── LoginView.vue
│       └── api/
│           └── client.ts       # Typed API client
└── shared/
    ├── package.json
    └── types.ts                # Shared TS types
```

## Database Schema

All timestamp columns use `timestamptz`. Single-user app — no user/tenant IDs on any table.

Design principle: **store raw facts, derive meaning at query/report time.** Every claim Isaac makes should be traceable back to a source record.

### tickets

The core entity. Epics are tickets with `issue_type = 'epic'`. Uses Jira key as the primary key.

| Column | Type | Notes |
|---|---|---|
| key | text PK | Jira key, e.g. "DESK-1234" |
| title | text | Ticket title (Jira "summary") |
| issue_type | text | epic, story, task, bug, etc. |
| status | text | Current Jira status |
| story_points | decimal | Nullable |
| epic_key | text FK → tickets | Nullable (epics don't have a parent epic) |
| created_by_me | boolean | |
| assignee_is_me | boolean | |
| closed_at | timestamptz | Nullable, derived from status transitions |
| jira_created_at | timestamptz | |
| jira_updated_at | timestamptz | |
| synced_at | timestamptz | |

### ticket_events

Raw status transitions and other events.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| ticket_key | text FK → tickets | |
| event_type | text | created, status_changed, assigned, etc. |
| from_value | text | Nullable |
| to_value | text | Nullable |
| occurred_at | timestamptz | |

### merge_requests

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| gitlab_id | int unique | |
| gitlab_iid | int | Project-scoped MR number |
| project_path | text | e.g. "group/repo", needed for MR URLs |
| title | text | |
| status | text | opened, merged, closed |
| authored_by_me | boolean | |
| reviewed_by_me | boolean | Default false. True if user approved or commented on the MR. |
| branch_name | text | |
| ticket_key | text FK → tickets | Nullable, inferred from branch name |
| ticket_key_inferred | boolean | Default true. Set to false when manually overridden. |
| additions | int | |
| deletions | int | |
| commit_count | int | |
| gitlab_created_at | timestamptz | |
| merged_at | timestamptz | Nullable |
| synced_at | timestamptz | |

### merge_request_events

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| merge_request_id | int FK → merge_requests | |
| event_type | text | authored, merged, commented |
| external_url | text | Nullable, link to GitLab comment/MR for auditability |
| occurred_at | timestamptz | |

### commits

Individual commits from merge requests, used to distribute coding effort across days for WBSO estimation.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| merge_request_id | int FK → merge_requests | |
| sha | text unique | Git commit SHA |
| title | text | Commit message title |
| authored_at | timestamptz | When the commit was authored |

### confluence_documents

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| confluence_id | text unique | |
| title | text | |
| space_key | text | |
| created_by_me | boolean | |
| epic_key | text FK → tickets | Nullable, manual or inferred |
| epic_key_inferred | boolean | Default true. Set to false when manually overridden. |
| confluence_created_at | timestamptz | |
| confluence_updated_at | timestamptz | |
| synced_at | timestamptz | |

### confluence_document_events

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| document_id | int FK → confluence_documents | |
| event_type | text | published, commented |
| external_url | text | Nullable, link to Confluence page/comment for auditability |
| occurred_at | timestamptz | |

### meetings

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| calendar_event_id | text unique | From Apps Script |
| title | text | |
| category | text | dev, non_dev — initially null, set manually or inferred |
| epic_key | text FK → tickets | Nullable |
| epic_key_inferred | boolean | Default true. Set to false when manually overridden. |
| response_status | text | Nullable, accepted/declined/tentative — proves attendance |
| starts_at | timestamptz | |
| ends_at | timestamptz | |
| synced_at | timestamptz | |

Note: `duration_minutes` is not stored — computed as `ends_at - starts_at` in queries.

### wins

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| title | text | Short description from Slack |
| description | text | Nullable, enriched on web later |
| slack_message_id | text unique | For deduplication |
| created_at | timestamptz | |
| updated_at | timestamptz | |

### entity_links

Generic linking table for wins and KR evidence. No FK constraints (polymorphic trade-off, acceptable at single-user scale).

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| source_type | text | win, key_result |
| source_id | int | |
| target_type | text | ticket, merge_request, confluence_document, meeting, objective, key_result |
| target_id | text | Text to accommodate ticket keys |
| created_at | timestamptz | |

### objectives

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| title | text | |
| description | text | Nullable |
| year | int | |
| status | text | active, completed, abandoned |
| created_at | timestamptz | |

### key_results

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| objective_id | int FK → objectives | |
| title | text | |
| target_value | decimal | Nullable |
| current_value | decimal | Nullable |
| unit | text | Nullable, e.g. "tickets", "percent", "hours" |
| data_source | text | Nullable, auto-update source identifier (e.g. "pipeline:max_duration") |
| status | text | on_track, at_risk, behind, completed |
| created_at | timestamptz | |

### pipelines

GitLab CI/CD pipelines for the project. Tracks all finished pipelines (not just mine) to measure KR "reduce max pipeline duration to below 15 minutes". Uses GitLab pipeline ID as PK.

| Column | Type | Notes |
|---|---|---|
| id | integer PK | GitLab pipeline ID |
| iid | integer | Nullable, project-scoped pipeline number (needed for GraphQL queries) |
| ref | text | Branch/MR ref |
| status | text | success, failed, canceled |
| source | text | merge_request_event, push, web, schedule |
| duration_seconds | integer | Nullable |
| queued_duration_seconds | integer | Nullable |
| coverage | decimal | Nullable |
| web_url | text | |
| gitlab_created_at | timestamptz | |
| started_at | timestamptz | Nullable |
| finished_at | timestamptz | Nullable |
| synced_at | timestamptz | |

### pipeline_jobs

Individual jobs within a pipeline. Uses GitLab job ID as PK.

| Column | Type | Notes |
|---|---|---|
| id | integer PK | GitLab job ID |
| pipeline_id | integer FK → pipelines | |
| name | text | e.g. "playwright_e2e_print_voucher" |
| stage | text | e.g. "test", "lint" |
| status | text | success, failed, canceled, manual, skipped |
| duration_seconds | decimal | Nullable (float seconds) |
| queued_duration_seconds | decimal | Nullable |
| allow_failure | boolean | |
| retried | boolean | Superseded runs marked `retried: true` |
| needs | text[] | Nullable, job names from `needs:` DAG keyword. `null` = default stage ordering, `[]` = no dependencies |
| web_url | text | |
| started_at | timestamptz | Nullable |
| finished_at | timestamptz | Nullable |

### passkey_credentials

For WebAuthn passkey auth.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| credential_id | text unique | WebAuthn credential ID |
| public_key | bytea | |
| counter | int | Signature counter |
| label | text | e.g. "MacBook Touch ID" |
| transports | text | Nullable, JSON-serialized AuthenticatorTransport[] |
| created_at | timestamptz | |

### sync_log

Track sync job runs.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| source | text | jira, gitlab, gitlab-pipelines, confluence, calendar, slack |
| status | text | running, success, error |
| started_at | timestamptz | |
| finished_at | timestamptz | Nullable |
| error | text | Nullable |
| items_synced | int | Nullable |

### No wbso_entries table

WBSO estimates are computed on the fly from activity data (tickets, MRs, meetings, etc.) and rendered as a weekly summary. The WBSO API returns estimation reasoning alongside hours so that estimates are traceable to source events. No persistence needed.

## API Design

All routes under `/api`, JWT-protected except auth and Slack endpoints. Two JWT token types:

- **Owner token** (subject: `isaac-owner`, 7d expiry) — full read/write access, issued via passkey login
- **Share token** (subject: `isaac-share`, 24h expiry) — read-only access, issued via `POST /api/share`

Write endpoints (POST/PATCH/DELETE on objectives, key results, evidence, sync, share) require an owner token (403 for share tokens). The frontend hides write controls in share mode.

Share URL format: `https://isaac.vhtm.eu/share/<jwt>` — the `/share/:token` route stores the token in localStorage and redirects to dashboard.

- **Auth:** GET `/auth/status`, POST `/auth/register/options`, POST `/auth/register/verify`, POST `/auth/authenticate/options`, POST `/auth/authenticate/verify`, POST `/auth/refresh`
- **Tickets:** GET `/tickets`, GET `/tickets/:key`, PATCH `/tickets/:key`
- **MRs:** GET `/merge-requests`, GET `/merge-requests/:id`, PATCH `/merge-requests/:id`
- **Confluence docs:** GET `/confluence-documents`, GET `/confluence-documents/:id`, PATCH `/confluence-documents/:id`
- **Meetings:** GET `/meetings`, GET `/meetings/:id`, PATCH `/meetings/:id`
- **Wins:** GET/POST `/wins`, GET/PATCH/DELETE `/wins/:id`, POST `/wins/:id/links`, DELETE `/wins/:id/links/:linkId`
- **Objectives:** GET/POST `/objectives`, GET/PATCH `/objectives/:id`, GET `/objectives/epics?q=`, POST `/objectives/seed` (owner-only, idempotent seeder for 2026 OKRs)
- **Key Results:** POST `/objectives/:id/key-results`, GET/PATCH `/key-results/:id`, POST `/key-results/:id/evidence`, DELETE `/key-results/:id/evidence/:evidenceId`
- **Pipelines:** GET `/pipelines/metrics?weeks=N`, GET `/pipelines/jobs/slowest?weeks=N`, GET `/pipelines/jobs/flaky?weeks=N`, GET `/pipelines/list?limit=N&source=S`, GET `/pipelines/:id/jobs` (includes `needs` for DAG dependency visualization), GET `/pipelines/merge-requests?limit=N`, GET `/pipelines/merge-requests/:id/pipelines`
- **WBSO:** GET `/wbso/week/:date` (computed weekly summary with per-ticket-per-day breakdown, includes estimation reasoning), PATCH `/wbso/meetings/:id` (override meeting category, owner-only)
- **Dashboard:** GET `/dashboard/week/:date`, GET `/dashboard/velocity?weeks=N` (last N weeks of SP/ticket counts, default 12, max 26)
- **Sync:** POST `/sync/trigger` (accepts `{ sources?: string[], since?: string }` for filtered backfills), GET `/sync/status`, GET `/sync/log`
- **Share:** POST `/share` → `{ url, expiresAt }` (owner-only, generates 24h share link)
- **Slack:** POST `/slack/events`, POST `/slack/commands` (no JWT — verified via Slack signing secret)

## Sync Architecture

Railway cron jobs call `bun run server/src/sync/run.ts` on a schedule. This script:

1. Checks `sync_log` for any `running` status with `started_at > now() - 10 min` → aborts if found (concurrent-sync guard)
2. Imports DB and sync modules directly (same codebase, no HTTP)
3. Runs each source sync in sequence (Jira → GitLab → Confluence → Calendar → GitLab Pipelines)
4. All sync functions accept an optional `sinceOverride` parameter for backfill support
5. Runs the linker to infer relationships (branch name → ticket, etc.), skipping rows where `*_inferred = false`
6. Runs the KR updater to auto-update key results that have a `data_source` set
7. Logs results to `sync_log`

Calendar sync calls an Apps Script endpoint (no OAuth needed). All other sources use API tokens via env vars. Pipeline sync uses both the REST API (for pipeline/job details) and the GraphQL API (for job `needs` DAG dependencies, which aren't exposed via REST).

### Manual sync trigger

`POST /api/sync/trigger` allows on-demand syncs with source filtering and date override. Useful when fixing field mappings or backfilling data. Example:

```bash
curl -X POST https://isaac.vhtm.eu/api/sync/trigger \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"sources": ["jira"], "since": "2025-09-01"}'
```

### Jira field mapping

Story points use `customfield_10502` (FareHarbor's Jira instance). This was discovered via `acli jira workitem view DESK-XXXX --fields '*all' --json`.

## Hosting — Railway

**Project:** isaac
**Repo:** git@github.com:Jason-vh/isaac.git (auto-deploys on push to `main`)

### Services

| Service | Purpose | Start command |
|---|---|---|
| **isaac-web** | Elysia API server + Vue SPA static files | `bun run server/src/index.ts` (from root `package.json` `start` script) |
| **isaac-cron** | Sync cron job | `bun run server/src/sync/run.ts` (via `RAILWAY_START_COMMAND`) |

Both `isaac-web` and `isaac-cron` have sync env vars so the web service can trigger syncs via the API.
| **isaac-db** | PostgreSQL database | Managed by Railway |

### Deployment pipeline (isaac-web)

1. **Build:** `bun run --filter web build` (via `RAILWAY_BUILD_COMMAND`) — builds Vue SPA to `web/dist/`
2. **Pre-deploy:** `bun run --filter server db:migrate` (via `RAILWAY_PRE_DEPLOY_COMMAND`) — runs Drizzle migrations
3. **Start:** `bun run server/src/index.ts` — Elysia serves API routes at `/api/*` and static files from `web/dist/` with SPA fallback

### Architecture note

The `isaac-web` service is a single process: Elysia handles both API requests and static file serving. In dev, Vite runs separately (port 5173) and proxies `/api` to the server (port 3000). In production, Elysia serves everything on a single port.

## Env Vars

Validated at startup via `server/src/env.ts`. Core vars are required at boot — the server fails fast if any are missing. Sync vars are validated lazily (only when sync runs), so the server can start without them.

### Core (required at boot)

- `DATABASE_URL` — Postgres connection string (references `isaac-db` on Railway)
- `JWT_SECRET` — For signing JWTs
- `WEBAUTHN_RP_ID` — Relying party ID (e.g. "isaac.vhtm.eu")
- `WEBAUTHN_ORIGIN` — Origin URL (e.g. "https://isaac.vhtm.eu")

### Sync (required when sync runs)

- `JIRA_BASE_URL` — Jira instance URL
- `JIRA_API_TOKEN` — Personal access token
- `JIRA_EMAIL` — Account email for basic auth
- `GITLAB_BASE_URL` — GitLab instance URL
- `GITLAB_API_TOKEN` — Personal access token
- `GITLAB_PROJECT_ID` — The single repo we care about
- `CONFLUENCE_BASE_URL` — Confluence instance URL
- `CONFLUENCE_API_TOKEN` — Personal access token
- `CONFLUENCE_EMAIL` — Account email
- `CALENDAR_SCRIPT_URL` — Apps Script endpoint URL
- `CALENDAR_SCRIPT_SECRET` — Shared secret for Apps Script auth
- `SLACK_SIGNING_SECRET` — For verifying Slack requests
- `SLACK_BOT_TOKEN` — For sending Slack responses
