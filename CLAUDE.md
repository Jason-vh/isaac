# Isaac

Personal impact tracker and WBSO hour estimation tool for FareHarbor.

## Key Documents

- `DISCOVERY.md` - Domain discovery document covering vision, design principles, domain model, user flows, and technical decisions.
- `ARCHITECTURE.md` - Technical architecture covering tech stack, project structure, database schema, API design, sync architecture, and env vars.

## Development

- **Install:** `bun install` from root
- **Dev server:** `bun run dev:server` (Elysia on port 3000)
- **Dev frontend:** `bun run dev:web` (Vite on port 5173, proxies `/api` to server)
- **Generate migration:** `bun run --filter server db:generate` (after changing `server/src/db/schema.ts`)
- **Run migration locally:** `DATABASE_URL=<url> bun run --filter server db:migrate`
- Migrations run automatically on deploy via Railway pre-deploy command.
- Pushing to `main` triggers auto-deploy on Railway.

## Testing & Debugging

- **Generate a local JWT:** `cd server && bun --env-file ../.env -e "import { SignJWT } from 'jose'; const s = new TextEncoder().encode(process.env.JWT_SECRET); const t = await new SignJWT({}).setProtectedHeader({alg:'HS256'}).setSubject('isaac-owner').setIssuedAt().setExpirationTime('1h').sign(s); console.log(t)"`
- **Trigger a backfill sync locally:** `curl -s -X POST http://localhost:3000/api/sync/trigger -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"sources": ["jira"], "since": "2026-01-01"}'`
- **Inspect Jira tickets:** `acli jira workitem view DESK-XXXX --fields '*all' --json` — useful for checking field values, parent/epic links, custom fields.
- **Search Jira:** `acli jira workitem search --jql "project = DESK AND ..." --fields "key,summary" --json`
- **Count Jira tickets:** `acli jira workitem search --jql "project = DESK" --count`

## Working Rules

- If any new domain concepts, entities, relationships, or design decisions emerge during development, update `DISCOVERY.md` to reflect them. The discovery document should always match the current understanding of the domain.
- If any architectural decisions change (schema, API, tech stack, etc.), update `ARCHITECTURE.md` accordingly.
