# Avantiqo Database Rules

**Status: living database contract**

This document is subordinate to [`../ARCHITECTURE.md`](../ARCHITECTURE.md) and [`DATABASE_GOVERNANCE.md`](./DATABASE_GOVERNANCE.md).

## Core philosophy

The database represents canonical business truth and durable execution evidence. It is not temporary UI storage and must not mirror arbitrary page layouts.

Tables should represent real concepts such as:

- business master data and relationships
- operational state
- lifecycle/workflow state
- financial state
- events and movements
- evidence and audit history
- tasks/jobs where durable async state is required
- documents and their relationships

## Canonical business scoping

Avantiqo uses:

**organization → entity → party**

Use `organization_id` on business records that belong to an organization boundary. Use `entity_id` where the business fact belongs to a legal/operating entity. Use party relationships when the record relates to customers, suppliers, employees, contractors, contacts, shareholders, partners, leads, creditors, debtors, or other actors.

Do **not** create `tenant_id` as the default scoping model for new Avantiqo business tables.

Not every table should mechanically contain every context key. Model the real ownership/relationship and enforce access through the appropriate canonical parent/context.

## One source of truth

Before creating a table or materialized state:

1. Identify the existing business concept and owning capability/domain.
2. Search for existing canonical tables, views, events, documents, or runtimes.
3. Determine whether new persistence is truly required.
4. Avoid parallel representations that can diverge.
5. If migration requires temporary coexistence, define the source of truth and convergence/removal plan explicitly.

## Lifecycle and state

Persist business lifecycle state when the state has business meaning.

Examples can include:

- draft
- pending / submitted
- approved / rejected
- posted
- received / fulfilled
- open / closed
- queued / running / succeeded / failed / uncertain
- ready for review / changes requested / reviewed / cleared

Do not force one generic status vocabulary onto every domain. States must represent the real lifecycle and valid transitions of the owning capability.

## Audit and evidence

Important operations should preserve enough evidence to answer:

- who initiated or authorized the operation
- organization/entity/business context
- what capability/process acted
- prior state where relevant
- requested change
- resulting state
- execution/job/provider identity where relevant
- timestamps
- financial/operational effect
- verification outcome
- approval/review state
- error or uncertainty state

Use append-only/event/history structures where immutability is required. Do not rely on `updated_at` alone as an audit trail.

## Financial integrity

Financial data must remain deterministic, reproducible, auditable, and reconcilable.

Rules include:

- do not silently overwrite posted/historical financial truth
- use governed reversal/correction mechanisms where accounting semantics require them
- preserve journal/posting references and evidence
- preserve period/entity/dimension context where applicable
- protect idempotency and duplicate-posting boundaries
- verify ledger invariants after important financial mutations

## Inventory and movement integrity

Inventory/asset/resource quantities should be derived from or reconciled with governed movements where the business model requires traceability.

Do not hardcode restaurant-specific movement concepts such as `ingredient_movements`, production logs, or waste logs as universal infrastructure. Model generic movements/events and domain-specific extensions where appropriate.

Any direct quantity adjustment that bypasses normal movement flow must itself be a governed, attributable business event with evidence.

## Async job persistence

Long-running work may use durable job/task state when durability, resume, monitoring, or external execution requires it.

Typical durable fields may include:

- immutable execution/job identity
- organization/entity context
- capability/task identity
- requested input/contract reference
- lifecycle status
- attempt/dispatch state
- external provider/function/job identity
- timestamps
- error/uncertainty details
- verification/evidence references

Do not create a queue table for every asynchronous function by default. Use the platform's current canonical task/queue/runtime primitives first.

## At-most-once data contract

For payments, postings, purchases, external communications, GPU/provider execution, destructive mutations, and similar actions, persistence must support reconciliation of a single intended execution.

Preferred lifecycle:

**prepare → identify → claim/reserve → dispatch once → observe → verify → settle**

If execution becomes ambiguous, persist uncertainty and reconcile the existing execution before creating another one.

## AI and learned data

AI memory, learned evidence, hypotheses, generated artifacts, and model outputs must not silently become authoritative financial/operational source-of-truth.

AI-related data should:

- carry organization/entity/context when it is business-specific
- preserve provenance and evidence
- distinguish observation, inference, hypothesis, recommendation, and verified fact
- support expiration/versioning/quality state where appropriate
- connect decisions/actions to the actual governed capability that executed them

Do not store durable intelligence only inside prompt text.

## Schema naming

Use clear, stable names that describe business concepts rather than screens or temporary implementations.

Prefer `snake_case` for database identifiers unless the current schema contract dictates otherwise.

Use explicit relationship names such as `organization_id`, `entity_id`, `party_id`, `created_at`, and `updated_at` where they model the real relation/state.

## Migration rules

Before applying a migration:

1. Identify the exact target database/project/environment.
2. Inspect current schema, data volume, constraints, RLS/policies, and callers.
3. Understand compatibility and rollback/recovery implications.
4. Prefer additive, reversible, idempotent, or safely repeatable migration patterns where practical.
5. Separate large destructive backfills/rewrites from unrelated feature changes.
6. Verify affected invariants and representative workflows after migration.
7. Never use a local command as evidence that the target data is disposable.

## Schema governance checklist

Before creating or materially changing persistence, answer:

1. What real business concept/event/state is being modeled?
2. Which domain/workspace/capability owns it?
3. What organization/entity/party relationship applies?
4. Is there already a source of truth?
5. What lifecycle/transitions must be enforced?
6. What authorization/RLS boundary applies?
7. What evidence/audit must survive?
8. What financial/operational invariants must hold?
9. What async/idempotency requirements exist?
10. How will the schema and its real workflow be verified?

Do not create random tables ad hoc. Persistence should strengthen the canonical platform model.
