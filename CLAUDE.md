# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Astro 5 site deployed on Cloudflare Workers. Uses React for interactive components, Tailwind for styling, MDX for blog content, and Cloudflare D1 (SQLite) via Prisma for persistence. The site bundles several distinct sub-apps under one Astro install: blog, hotel booking (`bl-house`), golf scoring/MBTI, and stock (`joogatu`) tools.

## Common commands

- `npm run dev` — local Astro dev server (`localhost:4321`). Note: D1 bindings are not available here; use `preview` for anything that hits `DB`.
- `npm run preview` — `astro build` + `wrangler dev`. Use this to exercise D1, the worker runtime, and `platformProxy` bindings.
- `npm run build` — runs `prisma generate` then `astro build`. Output goes to `./dist`, which Wrangler serves as `_worker.js` + static assets.
- `npm run check` — build + `tsc` + `wrangler deploy --dry-run`. Run before deploys.
- `npm run deploy` — `wrangler deploy` (does not build; pair with `npm run build`).
- `wrangler tail` — live worker logs.

### D1 database (`bl-house`)

Migrations live in `migrations/` and are applied manually via Wrangler:

- `npm run db:migrate` — apply `0001_initial_schema.sql` to local D1.
- `npm run db:migrate:remote` — same, against the remote D1 instance.
- `npm run db:reset` — drops hotel-related tables locally.
- `npm run db:shell` — opens `sqlite3` against the local `.wrangler` SQLite file.
- Other `db:*` scripts in `package.json` are ad-hoc SELECT helpers for hotels/rooms/prices/reservations.
- `D1_MANAGEMENT_GUIDE.md` and `HOTEL_SETUP.md` document the D1 workflow and hotel schema in more depth.

## Architecture

### Runtime / build pipeline

- **Adapter:** `@astrojs/cloudflare` with `platformProxy.enabled = true`, so `npm run dev` exposes Cloudflare bindings (incl. `DB`) via `Astro.locals.runtime.env`. API routes read D1 from there.
- **Vite config (`astro.config.mjs`)** marks `@prisma/client`, `.prisma/client`, `better-sqlite3`, `path`, `fs` as SSR-external and Rollup-external. `better-sqlite3` is a dev-only convenience for local SQLite scripts and must never be bundled into the worker — keep it out of any code that ships to `dist/`.
- **Prisma + D1:** `src/lib/db.ts` lazily `import()`s `@prisma/client` and `@prisma/adapter-d1` and wraps the D1 binding. Always go through `getPrismaClient(env.DB)` from server code; never instantiate Prisma at module top level (breaks the worker bundle).

### Routing layout (`src/pages/`)

- `index.astro`, `about.astro`, `blog/` — marketing + blog (Astro content collections in `src/content/`, schema in `src/content.config.ts`).
- `hotel*`, `hotel/`, `booking.astro` — hotel booking sub-app backed by D1 tables (`hotels`, `room_types`, `room_prices`, `rooms`, `reservations`). API under `src/pages/api/hotels*` and `src/pages/api/reservations/`.
- `golf*`, `mbti.astro` — golf scoring + MBTI app. Scores are sourced from a Google Sheet via `googleapis` (see `src/lib/google-auth.ts` and `src/pages/api/golf-data.ts`, `check-golf-sheet.ts`). Service account JSON is read from `GCP_SERVICE_ACCOUNT_KEY` env (see `GCP_SETUP.md`).
- `stock/joogatu/` — stock portfolio views, served by `src/pages/api/portfolio-data.ts`.

### Frontend conventions

- Mix of `.astro` pages/components and React (`.jsx`/`.tsx`) islands. React is enabled via `@astrojs/react`; hydrate with the standard `client:*` directives.
- Tailwind is the styling system (`tailwind.config.mjs`); avoid introducing parallel CSS frameworks.

### External integrations

- **Google Sheets / Drive:** `src/lib/google-auth.ts` builds an auth client from `GCP_SERVICE_ACCOUNT_KEY` (stringified service-account JSON in env / Wrangler secret). All sheet reads should reuse this helper.
- **Cloudflare D1:** the only persistent store. Schema changes require a new migration file in `migrations/` and a `wrangler d1 execute` run for both local and remote.

## Repo-specific notes

- `dev-server.log` and `dist/` are build artifacts — don't edit.
- `deploy.sh`, `run_local.sh` are convenience wrappers around the npm scripts above.
- `queries/` contains hand-written SQL used by `db:status` and similar scripts.
- README.md is the unmodified Astro template README; it does **not** describe the hotel/golf/stock features. Treat the setup guides (`D1_MANAGEMENT_GUIDE.md`, `HOTEL_SETUP.md`, `GCP_SETUP.md`) as the authoritative docs for those subsystems.
