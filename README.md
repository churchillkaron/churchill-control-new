# Avantiqo

Avantiqo is an intelligent, multi-industry business operating platform that unifies business context, domain capabilities, documents, execution, automation, analytics, and AI in one coherent architecture.

This repository is the canonical product and engineering source for Avantiqo. It is not a Vercel example application, a restaurant-only system, or a collection of disconnected mini-products.

## Canonical architecture

The platform flow is:

**PLATFORM → USER → BUSINESS CONTEXT → UBTE → ERP_REGISTRY → DOMAIN → WORKSPACE → CAPABILITY → DOCUMENT / ACTION / PROCESS**

Canonical business context uses:

- `organization_id`
- `entity_id` where applicable
- `period_id` where applicable
- party relationships where applicable

**Do not introduce `tenant` as a business concept.**

The canonical domain families are:

- Dashboard
- Finance
- Operations
- Supply Chain
- Commercial
- People
- Projects
- Documents
- Analytics
- AI
- Solutions
- Administration
- Compliance
- Creative

Industry solutions are compositions of shared capabilities and business primitives. Restaurant, retail, hotel, construction, accounting, agency, manufacturing, and other industry behavior must not become competing top-level architectures.

## Documentation authority

Read these first:

1. [`AGENTS.md`](./AGENTS.md) — repository operating contract for engineering agents and sessions.
2. [`ARCHITECTURE.md`](./ARCHITECTURE.md) — permanent architecture principles and constraints.
3. [`SYSTEM_MAP.md`](./SYSTEM_MAP.md) — current logical map of the platform.
4. [`docs/README.md`](./docs/README.md) — documentation index, authority levels, and historical-document policy.
5. [`docs/ENGINEERING_RULES.md`](./docs/ENGINEERING_RULES.md) — engineering, verification, cost, and execution rules.

If documentation conflicts, current `main`, the permanent architecture contract, and the implementation evidence take precedence as defined in `docs/README.md`.

## Engineering objective

Best practice is a baseline, not the target.

For important architecture, AI, workflow, UX, automation, infrastructure, performance, cost, and capability decisions, Avantiqo should research the strongest current approaches, challenge conventional assumptions, prototype better alternatives, measure them, and certify the winner.

The working loop is:

**research → understand → challenge assumptions → invent → prototype → measure → compare → improve → certify**

Claims such as *world-class*, *faster*, *more intelligent*, *better*, or *production-ready* require evidence. Compare meaningful workloads using correctness, completion quality, autonomy, latency, reliability, cost, safety, usability, and human effort.

## Development model

`main` is the canonical branch and technical source of truth.

The normal lifecycle is local-first:

**develop → verify locally → commit to `main` → run relevant deterministic/E2E certification → repair → repeat → deploy production only as an intentional final release step**

Production is not the normal debugging loop. Do not add a production deployment marker to ordinary development commits.

Before changing code, read `AGENTS.md`, fetch newest `main`, inspect the current implementation, and use the repository's current `package.json` scripts rather than stale commands copied from old documents.

## Core implementation principles

- One coherent platform; no parallel product architectures.
- `ERP_REGISTRY` is authoritative for ERP domain/workspace/capability structure.
- Prefer reusable business primitives over industry hardcoding.
- Prefer capabilities and workflows over CRUD-shaped product design.
- Use shared runtimes rather than duplicated business logic.
- Use deterministic systems where reliable computation is sufficient; use AI for judgment, synthesis, reasoning, creativity, and adaptation.
- Human UI and Avantiqo Intelligence should ultimately operate the same governed capabilities.
- Expensive or destructive actions require identity, idempotency/at-most-once protection, observation, verification, and evidence.
- External providers sit behind Avantiqo-owned capability/service boundaries.
- Cost, latency, security, auditability, and verification are architectural concerns, not afterthoughts.

## Runtime stack

The active implementation is a Next.js application with Supabase-backed platform services and Avantiqo-owned/shared runtimes plus governed external execution where required. Exact versions, providers, models, scripts, and infrastructure change over time; inspect `package.json`, configuration, current source, and the relevant canonical runtime documents instead of encoding volatile claims here.

## Verification

Use the cheapest reliable proof first:

**source/static checks → focused tests → repository build → subsystem E2E → controlled paid/provider proof only when necessary**

A feature is not certified merely because source exists or a provider accepted a request. Certification must exercise the intended runtime contract and verify the resulting state/evidence.
