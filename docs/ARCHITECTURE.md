# Avantiqo Architecture Guide

**Status: living, scoped guidance**

This file explains implementation layering. It is **not** an independent architecture constitution.

Canonical authority:

1. [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — permanent Avantiqo architecture rule.
2. [`../SYSTEM_MAP.md`](../SYSTEM_MAP.md) — current repository-level logical system map.
3. Current implementation on `main` — exact implementation fact.

If this guide conflicts with those sources, this guide is wrong and must be corrected.

## Platform structure

Avantiqo's canonical platform flow is:

**PLATFORM → USER → BUSINESS CONTEXT → UBTE → ERP_REGISTRY → DOMAIN → WORKSPACE → CAPABILITY → DOCUMENT / ACTION / PROCESS**

Business context is organization-centric and may include:

- `organization_id`
- `entity_id` where applicable
- `period_id` where applicable
- party relationships where applicable

`tenant` is not a canonical Avantiqo business concept and must not be reintroduced through APIs, services, persistence, UI, or documentation.

## API boundary

API routes should remain thin delivery boundaries. Their normal responsibilities are:

- authenticate the actor
- resolve and authorize business context
- parse and validate input
- invoke the canonical capability/service/runtime
- translate the governed result into the transport response

API routes should not become parallel homes for business rules, accounting logic, AI orchestration, workflow state machines, pricing logic, or provider-specific product behavior.

## Capability and domain layers

Business behavior belongs to the domain/capability/runtime layer that owns the underlying business problem.

Use the current repository structure rather than assuming a fixed folder pattern. Conceptually these layers own:

- business invariants and lifecycle rules
- capability orchestration
- deterministic calculations
- workflows and state transitions
- domain intelligence and decision support
- reusable business primitives
- evidence and verification rules

A route, page, customer implementation, or industry-specific surface does not create a new domain simply because it has a unique pathname or UI.

## Shared platform layer

Cross-domain behavior should converge on shared governed runtimes and primitives where the business concept is genuinely shared.

Examples include:

- authorization and business context
- documents and files
- approvals
- workflow and tasks
- audit and evidence
- wallet, usage, pricing, and settlement
- communications
- AI execution
- automation and events
- scheduling and notifications
- provider/runtime boundaries

`shared` must not become an unowned dumping ground. A shared primitive needs a clear contract and owner.

## Persistence layer

Persistence represents canonical business truth, not a copy of the current screen layout.

Persistence code must preserve:

- organization scoping
- entity context where applicable
- real business relationships
- lifecycle state
- auditability and evidence
- financial integrity where relevant
- a single source of truth per business concept

Before adding tables or stores, inspect the current schema and capability model. Do not create a second persistence model merely because it is locally convenient.

## Frontend layer

The frontend is an interface to capabilities, not the architecture itself.

Prefer shared workspace, capability, table/data, action, document, navigation, and context primitives. When a shared primitive prevents a world-class workflow, improve the primitive rather than bypassing the architecture with a permanent one-off page.

## AI and automation

Avantiqo Intelligence must operate through the same governed business capabilities used by human interfaces.

Preferred pattern:

**intent/reasoning → authorized capability → deterministic execution where possible → verification → evidence → explanation/result**

Do not create fake AI-only business logic when the real capability already exists.

## Execution safety

For payments, postings, purchases, external communications, GPU/provider jobs, destructive mutations, and other expensive or irreversible actions, use explicit execution identity and at-most-once/idempotent patterns.

Preferred lifecycle:

**prepare → identify → claim/reserve → dispatch once → observe → verify → settle**

Ambiguity must trigger reconciliation of the existing action, not a blind duplicate execution.

## Engineering test for a new component

Before creating a new service, engine, route family, database model, worker, registry, or runtime, ask:

1. Which existing domain/workspace/capability owns the business problem?
2. Is there already a canonical primitive/runtime that should be extended?
3. Will this create a second source of truth or execution path?
4. Is an industry/UI concept being mistaken for a reusable business primitive?
5. Can a simpler, faster, safer, cheaper, or more general design be proven?
6. How will the new behavior be verified end to end?

Architecture is allowed to evolve, but only deliberately: **research → prototype → compare → prove → migrate** rather than accidental coexistence of competing systems.
