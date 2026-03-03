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

## Working Rules

- If any new domain concepts, entities, relationships, or design decisions emerge during development, update `DISCOVERY.md` to reflect them. The discovery document should always match the current understanding of the domain.
- If any architectural decisions change (schema, API, tech stack, etc.), update `ARCHITECTURE.md` accordingly.
