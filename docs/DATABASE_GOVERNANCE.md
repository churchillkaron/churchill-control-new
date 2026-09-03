# Avantiqo Database Governance

**Status: living database governance**

This document governs database design and change safety. It is subordinate to the permanent architecture contract in [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## Core principles

Database design must support:

- correct organization and entity authorization boundaries
- real business relationships through reusable party concepts where applicable
- operational stability
- auditability and evidence
- deterministic financial integrity
- lifecycle correctness
- scalability and performance
- safe automation and AI execution
- one source of truth per business concept

## Business scoping

Avantiqo's canonical business model is:

**organization → entity → party**

Use `organization_id`, `entity_id`, `party_id`, and related keys only where they represent the real relationship of the record.

Do not use `tenant_id` as the default business ownership model for new Avantiqo persistence.

Legacy tenant-named schema may exist during migration. Treat it as migration debt or compatibility state, not as the target architecture.

## Authorization and RLS

Database authorization must not rely on frontend filtering.

RLS/policies and server-side authorization should enforce the actual business boundary represented by the data model. Depending on the table, that can include:

- organization membership/authorization
- entity authorization
- role/capability permission
- party ownership/relationship
- platform/system-only access
- immutable/system-managed records

Do not mechanically apply one policy template to every table. Security policy must match the real ownership and action semantics.

## Financial integrity

Financial source-of-truth must remain:

- deterministic
- reproducible
- auditable
- entity/period aware where required
- protected against duplicate posting/settlement
- correct under retries and concurrent execution

Important mutations should use governed lifecycle transitions and verification rather than direct arbitrary row edits.

Where accounting semantics require correction of posted history, use the appropriate reversal/correction mechanism rather than silently rewriting history.

## Operational integrity

Operational state should model events and movements that matter to the business.

Examples include order/fulfilment changes, inventory/resource movements, receipts, approvals, reservations, jobs, schedules, communications, document state, and other capability-specific transitions.

Do not elevate industry-specific terms such as kitchen/ingredient/waste into universal database architecture unless they are genuine scoped domain extensions.

## AI data governance

AI outputs, learned memory, embeddings, hypotheses, recommendations, generated content, and model traces are not automatically business truth.

AI-related data should preserve appropriate:

- organization/entity/business context
- provenance/source references
- timestamps/version
- evidence
- confidence/quality/verification state where relevant
- relationship to the governed capability/action that consumed or produced it

AI may reason over operational/financial truth, but it must not silently replace deterministic source-of-truth records.

## Execution evidence

Expensive, external, destructive, or irreversible operations should be persistently reconcilable.

Where applicable preserve:

- intended execution identity
- capability/action identity
- organization/entity context
- reservation/claim state
- dispatch state
- external job/provider identity
- resulting state
- cost/usage/settlement state
- verification result
- error/uncertainty state

This supports the canonical lifecycle:

**prepare → identify → claim/reserve → dispatch once → observe → verify → settle**

## Naming standards

Prefer clear `snake_case` database identifiers unless an existing canonical contract requires otherwise.

Names should describe stable business concepts rather than screens, temporary UI labels, providers, or implementation details.

Examples of appropriate relationship fields include `organization_id`, `entity_id`, `party_id`, `created_at`, and `updated_at` when those relationships actually exist.

## Migration governance

Never treat a migration as safe merely because the SQL runs.

Before a material migration:

1. Identify the target Supabase/database environment.
2. Inspect affected schema, policies, constraints, triggers, views/functions, data volume, and callers.
3. Understand the current source of truth and migration direction.
4. Prefer additive/backward-compatible phases where they reduce risk.
5. Design destructive/backfill work for resumability/idempotency when practical.
6. Preserve financial, audit, and business history.
7. Verify representative real workflows and invariants after change.
8. Define cleanup/removal of legacy structures when a migration introduces temporary coexistence.

Do not combine unrelated schema rewrites simply because they are convenient to execute together.

## Soft deletion and retention

Soft deletion is not a universal rule. Choose retention behavior based on the business concept, audit requirement, privacy/legal requirement, and referential integrity.

Financial/audit evidence may require durable retention. Other data may require true deletion under policy. Model the requirement explicitly rather than adding `deleted_at` everywhere by habit.

## Performance and scale

Performance is part of database architecture.

For important workflows evaluate:

- query plans and indexes
- N+1/database round trips
- row counts and cardinality
- aggregation/materialization strategy
- transaction scope and locks
- concurrency/race conditions
- pagination and streaming
- cache suitability
- event-driven alternatives to repeated polling

Optimize measured bottlenecks without compromising business correctness or creating duplicate sources of truth.

## Governance checklist

Before approving a schema change, answer:

1. What real business concept is represented?
2. Which capability/domain owns it?
3. What organization/entity/party boundary applies?
4. What is the existing source of truth?
5. What lifecycle and invariants must hold?
6. What RLS/authorization is required?
7. What audit/evidence must survive?
8. Are financial or irreversible effects involved?
9. How does retry/concurrency/idempotency behave?
10. What is the migration and legacy-removal plan?
11. What performance characteristics matter?
12. How will correctness be verified end to end?

A schema change is complete only when the data model, authorization, migration, callers, verification, and documentation agree on the same architecture.
