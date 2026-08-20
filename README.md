# Fraudection

An early-stage payment fraud detection system. A Next.js app with a Postgres/Drizzle schema for the fraud case-review domain, a transaction ingestion endpoint, and a synchronous rules engine that scores each transaction on write.

## Getting started

1. Copy `.env.example` to `.env` and point `DATABASE_URL` at a Postgres instance.
2. Install dependencies and push the schema:
   ```bash
   npm install
   npm run db:push
   ```
3. Run the dev server:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Commands

- `npm run dev` — start dev server
- `npm run build` / `npm run start` — production build / serve
- `npm run lint` — ESLint
- `npm run db:generate` — generate a Drizzle migration from `db/schema.ts`
- `npm run db:migrate` — apply migrations in `db/migrations/`
- `npm run db:push` — push schema directly to the DB without a migration (dev only)
- `npm run db:studio` — open Drizzle Studio

No test suite is configured yet.

## What's here

- `db/schema.ts` — the data model: `transactions`, `cases`, `case_decisions`, `analysts`, `audit_log`.
- `app/api/transactions/route.ts` — ingests a payment provider webhook (idempotent on `externalId`), then scores it.
- `lib/rules-engine.ts` — deterministic rules engine (BIN blocklist, high amount, velocity, thin data) producing a risk score and an allow/hold/block decision.
- `app/` — otherwise still the default `create-next-app` page; no fraud-review UI yet.
