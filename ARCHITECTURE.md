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
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── tickets.ts
│   │   │   ├── merge-requests.ts
│   │   │   ├── confluence-documents.ts
│   │   │   ├── meetings.ts
│   │   │   ├── wins.ts
│   │   │   ├── objectives.ts
│   │   │   └── wbso.ts
│   │   ├── sync/
│   │   │   ├── run.ts          # Cron entry point (with concurrent-sync guard)
│   │   │   ├── jira.ts
│   │   │   ├── gitlab.ts
│   │   │   ├── confluence.ts
│   │   │   ├── calendar.ts     # Calls Apps Script endpoint
│   │   │   └── linker.ts       # Infers links between entities
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
│       ├── stores/
│       ├── composables/
│       ├── components/
│       ├── views/
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
| status | text | on_track, at_risk, behind, completed |
| created_at | timestamptz | |

### passkey_credentials

For WebAuthn passkey auth.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| credential_id | text unique | WebAuthn credential ID |
| public_key | bytea | |
| counter | int | Signature counter |
| label | text | e.g. "MacBook Touch ID" |
| created_at | timestamptz | |

### sync_log

Track sync job runs.

| Column | Type | Notes |
|---|---|---|
| id | serial PK | |
| source | text | jira, gitlab, confluence, calendar, slack |
| status | text | running, success, error |
| started_at | timestamptz | |
| finished_at | timestamptz | Nullable |
| error | text | Nullable |
| items_synced | int | Nullable |

### No wbso_entries table

WBSO estimates are computed on the fly from activity data (tickets, MRs, meetings, etc.) and rendered as a weekly summary. The WBSO API returns estimation reasoning alongside hours so that estimates are traceable to source events. No persistence needed.

## API Design

All routes under `/api`, JWT-protected except auth and Slack endpoints.

- **Auth:** POST `/auth/register`, POST `/auth/authenticate`, POST `/auth/refresh`
- **Tickets:** GET `/tickets`, GET `/tickets/:key`, PATCH `/tickets/:key`
- **MRs:** GET `/merge-requests`, GET `/merge-requests/:id`, PATCH `/merge-requests/:id`
- **Confluence docs:** GET `/confluence-documents`, GET `/confluence-documents/:id`, PATCH `/confluence-documents/:id`
- **Meetings:** GET `/meetings`, GET `/meetings/:id`, PATCH `/meetings/:id`
- **Wins:** GET/POST `/wins`, GET/PATCH/DELETE `/wins/:id`, POST `/wins/:id/links`, DELETE `/wins/:id/links/:linkId`
- **Objectives:** GET/POST `/objectives`, GET/PATCH `/objectives/:id`
- **Key Results:** POST `/objectives/:id/key-results`, GET/PATCH `/key-results/:id`, POST `/key-results/:id/evidence`, DELETE `/key-results/:id/evidence/:evidenceId`
- **WBSO:** GET `/wbso/week/:date` (computed weekly summary with per-ticket-per-day breakdown, includes estimation reasoning)
- **Dashboard:** GET `/dashboard/week/:date`, GET `/dashboard/stats`
- **Sync:** POST `/sync/trigger`, GET `/sync/status`, GET `/sync/log`
- **Slack:** POST `/slack/events`, POST `/slack/commands` (no JWT — verified via Slack signing secret)

## Sync Architecture

Railway cron jobs call `bun run server/src/sync/run.ts` on a schedule. This script:

1. Checks `sync_log` for any `running` status with `started_at > now() - 10 min` → aborts if found (concurrent-sync guard)
2. Imports DB and sync modules directly (same codebase, no HTTP)
3. Runs each source sync in sequence (Jira → GitLab → Confluence → Calendar)
4. All sync functions accept a `since` parameter for backfill support
5. Runs the linker to infer relationships (branch name → ticket, etc.), skipping rows where `*_inferred = false`
6. Logs results to `sync_log`

Calendar sync calls an Apps Script endpoint (no OAuth needed). All other sources use API tokens via env vars.

## Env Vars

Validated at startup via `server/src/env.ts`. App fails fast if any required var is missing.

- `DATABASE_URL` — Postgres connection string
- `JWT_SECRET` — For signing JWTs
- `WEBAUTHN_RP_ID` — Relying party ID (e.g. "isaac.vhtm.eu")
- `WEBAUTHN_ORIGIN` — Origin URL (e.g. "https://isaac.vhtm.eu")
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
