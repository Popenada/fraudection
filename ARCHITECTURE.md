# Fraudection — Proposed Architecture

Draft tech stack for a payment fraud detection system, built around the existing Next.js/TypeScript scaffold. This is a starting proposal, not a locked decision — revise as requirements firm up.

## Overview

```
┌─────────────────────┐      ┌──────────────────────┐
│   Next.js (App)      │      │   Payment Provider /   │
│  - Dashboard/UI       │      │   Merchant Webhooks    │
│  - Case review        │      └──────────┬───────────┘
│  - Auth (NextAuth)    │                 │
└──────────┬───────────┘                 ▼
           │                    ┌──────────────────────┐
           │  REST/tRPC         │  Ingestion API         │
           ▼                    │  (Next.js route or     │
┌──────────────────────┐        │   dedicated service)   │
│   Postgres             │◄─────┤                         │
│  - Transactions         │      └──────────┬───────────┘
│  - Cases/decisions      │                 │ enqueue
│  - Audit log             │                 ▼
└──────────┬───────────┘        ┌──────────────────────┐
           │                    │  Queue (Redis/BullMQ    │
           │ read features       │  or Kafka)              │
           ▼                    └──────────┬───────────┘
┌──────────────────────┐                 │
│  Feature Store          │                 ▼
│  (Redis for hot/         │        ┌──────────────────────┐
│   Postgres for cold)      │◄──────┤  Scoring Service        │
└──────────────────────┘        │  (Python/FastAPI)       │
                                  │  - Rules engine          │
                                  │  - ML model (XGBoost)    │
                                  └──────────┬───────────┘
                                            │ score + decision
                                            ▼
                                  ┌──────────────────────┐
                                  │  Decision/Action        │
                                  │  (allow/hold/block,      │
                                  │   webhook back to caller)│
                                  └──────────────────────┘
```

## Layers

### 1. Frontend — Next.js (already scaffolded)
- **Next.js 16 / React 19 / TypeScript / Tailwind v4** — dashboards for reviewing flagged transactions, case management UI, analyst tools, metrics.
- **Auth**: NextAuth.js or Clerk for analyst/admin login; role-based access (analyst vs admin).
- **Data fetching**: tRPC or a typed REST client to talk to the API layer.

### 2. API / Ingestion layer
- Options, in order of complexity:
  - **Simplest**: Next.js API routes (or Route Handlers) receive payment events, validate, write to Postgres, enqueue for scoring.
  - **If you need real-time/high-throughput**: a small dedicated ingestion service (Node/Fastify or Python/FastAPI) in front of a proper broker.
- Validates payloads (Zod), handles idempotency keys (payment webhooks retry), writes raw event + enqueues scoring job.

### 3. Queue
- **Redis + BullMQ** — good enough for most volumes, easy to run, TypeScript-native. Start here.
- **Kafka/Redpanda** — only if you need durable event streaming, replay, or multiple downstream consumers (e.g., analytics + scoring + alerting all reading the same stream). Upgrade path, not a day-1 requirement.

### 4. Scoring service — Python
- **FastAPI** service, separate deployable from the Next.js app.
- **Rules engine**: deterministic checks first (velocity limits, blocklists, geo mismatch, card BIN checks) — cheap, explainable, catches obvious fraud without ML.
- **ML model**: gradient-boosted trees (XGBoost/LightGBM) trained on labeled transaction history — good default for tabular fraud data, interpretable via SHAP, doesn't need GPU infra.
- **Model serving**: just load the model in-process in FastAPI to start; only reach for something like BentoML/Triton if you have multiple models or need canarying at scale.
- Why Python here and not JS: the ML tooling (scikit-learn, XGBoost, SHAP, pandas) is materially more mature than JS equivalents — this is the one place worth crossing language boundaries.

### 5. Data stores
- **Postgres** — system of record: transactions, cases, analyst decisions, audit trail. Use a managed instance (Supabase, Neon, RDS).
- **Feature store**:
  - Hot/online features (e.g., "transactions from this card in last 10 min") — **Redis**, sub-millisecond reads needed at scoring time.
  - Cold/offline features (for model training) — computed from Postgres/warehouse, no new infra needed initially.
- **Graph/network analysis** (later stage) — if you need to detect fraud rings (shared devices, addresses, cards across accounts), a graph DB (Neo4j) or graph queries over Postgres becomes useful. Not needed for v1.

### 6. Decisioning & feedback loop
- Scoring service returns a risk score + decision (allow/hold/block) synchronously (target <200ms) or async via webhook depending on the payment provider's flow.
- Analyst decisions on held cases feed back into the training set — this loop is what actually improves the model over time; plan for it from the start even if the first model is simple rules.

### 7. Observability
- **Structured logging** (pino on the Node side, structlog on the Python side).
- **Metrics**: Prometheus + Grafana, or a hosted option (Datadog) — track false positive rate, score latency, queue depth.
- **Alerting** on scoring service errors/latency spikes — a stalled fraud check is worse than a slow one only up to a point.

### 8. Deployment
- **Next.js app** → Vercel (matches the existing scaffold's grain).
- **Scoring service + queue** → a separate host (Fly.io, Railway, or AWS/GCP) since it's Python + needs to stay warm/low-latency; Vercel serverless functions are a poor fit for a long-lived scoring process.
- **Postgres/Redis** → managed (Supabase/Neon + Upstash or a managed Redis).

## Suggested build order
1. Postgres schema (transactions, cases) + Next.js ingestion route writing raw events.
2. Rules engine only (no ML) in the FastAPI scoring service — ships value fast, establishes the pipeline.
3. Case review UI in Next.js for analysts to action holds.
4. Once you have labeled decisions accumulating, train the first ML model and add it alongside rules (rules as a floor/ceiling, model for the gray zone).
5. Queue, feature store, graph analysis — add as volume/sophistication demands, not upfront.

## Main tradeoffs to revisit
- **Monolith (rules in Next.js/TS) vs. split scoring service (Python)**: split costs you a second deployable and network hop, but unlocks real ML — recommended given "detect fraudulent payments" implies ML eventually.
- **Redis/BullMQ vs. Kafka**: start simple; only move to Kafka if you need replay/multiple consumers.
- **Sync vs. async scoring**: sync is simpler for the caller but caps how heavy your model/rules can be within the payment's latency budget.
