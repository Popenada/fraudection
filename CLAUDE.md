# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project state

Fraudection is an early-stage payment fraud detection system. Right now the repo is a Next.js App Router scaffold (mostly unmodified `create-next-app` boilerplate in `app/`) plus a Drizzle/Postgres schema modeling the fraud case-review domain — no API routes, scoring, or auth exist yet.

## Commands

- `npm run dev` — start dev server
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` — ESLint (flat config via `eslint-config-next`)
- `npm run db:generate` — generate a Drizzle migration from `db/schema.ts`
- `npm run db:migrate` — apply migrations in `db/migrations/`
- `npm run db:push` — push schema directly to the DB without a migration (dev only)
- `npm run db:studio` — open Drizzle Studio

No test suite is configured yet. All `db:*` commands and the app runtime require `DATABASE_URL` (see `.env.example`) — `db/index.ts` and `drizzle.config.ts` both throw at import time if it's unset.

## Architecture

- `db/schema.ts` — single source of truth for the data model (Drizzle ORM, `pg-core`, Postgres dialect). Core tables: `transactions` (payment events, keyed by the provider's `external_id` for webhook idempotency), `cases` (opened against a transaction for analyst review), `case_decisions` (append-only analyst verdicts: approve/reject/escalate), `analysts`, and `audit_log` (append-only, keyed by `entity_type`/`entity_id`, kept independent of the domain tables so it survives edits to the rows it describes). `analysts` has no auth wired up yet — see the comment in schema.ts.
- `db/index.ts` — the Drizzle client (`node-postgres` driver), exported as `db`.
- `drizzle.config.ts` — points `drizzle-kit` at `db/schema.ts` / `db/migrations`, with `strict`/`verbose` on.
- `ARCHITECTURE.md` — a draft proposal for the full target system (ingestion API, Redis/BullMQ queue, a separate Python/FastAPI scoring service with a rules engine + XGBoost model, feature store, observability). None of it beyond the Next.js scaffold and the Postgres schema is built yet — treat it as directional context for where the schema/API are headed, not a description of current code. Worth reading before structural decisions that could conflict with the intended direction (e.g. where scoring logic should live).
- `app/` — still the default `create-next-app` page; no fraud-review UI exists yet.

`AGENTS.md`, `CLAUDE.md`, and `ARCHITECTURE.md` are gitignored — they're local-only context files, not committed to the repo.
