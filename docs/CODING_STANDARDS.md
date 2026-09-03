# Avantiqo Coding Standards

**Status: living coding guidance**

This document is subordinate to [`../ARCHITECTURE.md`](../ARCHITECTURE.md), [`../AGENTS.md`](../AGENTS.md), and [`ENGINEERING_RULES.md`](./ENGINEERING_RULES.md).

## Core principles

Code should be:

- correct
- readable
- explicit about business meaning
- modular without unnecessary abstraction
- observable
- organization/entity safe
- deterministic where possible
- reusable across industries
- easy to verify
- performant enough for the actual workflow

Prefer clarity and strong contracts over cleverness. Prefer a simpler measurable solution over architecture ceremony.

## Business-context standards

Use canonical Avantiqo context:

- `organization_id`
- `entity_id` where applicable
- `period_id` where applicable
- party relationships where applicable

Never hardcode organization/entity/customer IDs into generic code.

Do not add new `tenant_id`, `getTenantId()`, tenant-resolution, or tenant-isolation architecture as the preferred model. Legacy names may exist during migration; do not copy them into new design merely for consistency with old code.

## Route standards

API routes should normally:

- authenticate
- resolve/authorize canonical business context
- parse and validate input
- invoke the canonical capability/service/runtime
- translate the governed result into a response

Routes should not independently implement:

- accounting or financial logic
- domain workflow state machines
- AI orchestration/provider routing
- inventory/resource calculations
- payroll calculations
- wallet/pricing policy
- provider-specific business rules

## Capability/runtime standards

Place business behavior with the capability/runtime that owns the real business problem.

Good capability/runtime code:

- models explicit invariants and lifecycle
- has clear input/output contracts
- can be reused by UI/API/AI/automation when they perform the same operation
- preserves authorization and evidence
- separates deterministic computation from AI judgment
- supports idempotency/at-most-once semantics where required
- is testable without requiring production deployment

Avoid creating tiny service layers that only forward calls without adding a meaningful boundary.

## Shared-layer standards

Shared infrastructure is for genuinely cross-domain mechanics such as clients, auth/context foundations, audit/evidence primitives, workflow/task infrastructure, wallet/usage, communication, automation, and common utilities.

Do not put domain business rules into shared code merely to make them accessible everywhere.

Shared code must have clear ownership and a stable contract; `shared` is not a dumping ground.

## Persistence standards

Persistence code should model business truth and governed state, not UI components.

- use canonical organization/entity/party relationships
- avoid duplicate sources of truth
- preserve audit/evidence and lifecycle
- keep financial state deterministic and reconcilable
- use explicit execution/job identity for important async/paid/destructive operations
- understand concurrency and retries

Do not scatter direct client construction across the repository when a canonical shared client/access path exists.

## Error handling

Errors should preserve enough context to diagnose the real failure without exposing secrets.

Prefer structured error contracts and centralized transport handling where appropriate, but do not hide meaningful domain errors behind a generic 500.

Distinguish classes such as:

- validation
- authorization
- lifecycle/conflict
- dependency/provider
- uncertain execution state
- verification failure
- infrastructure/scheduling/capacity

Do not catch an error only to return optimistic success.

## Validation

Centralize reusable validation contracts where doing so reduces drift.

Validation must cover business invariants, not only required fields. A payload can be syntactically valid and still violate lifecycle, authorization, accounting, or execution rules.

## Logging and observability

Logging should be structured, scoped, and useful for reconstructing execution.

Where relevant include safe identifiers for:

- capability/action
- organization/entity context
- execution/job identity
- lifecycle/status transition
- provider/engine identity
- verification outcome

Never log secrets or private credentials.

Avoid random high-volume `console.log` output that obscures real signal.

## Naming

Use names that describe stable intent and business meaning.

Prefer capability-oriented names such as:

- `reconcileBankStatement`
- `postJournal`
- `createPurchaseOrder`
- `dispatchProductionTask`
- `verifyExecutionResult`

Avoid names such as:

- `helper`
- `temp`
- `new`
- `final`
- `fix2`

Do not use an industry-specific name for a generic primitive unless the concept is genuinely industry-specific.

## AI coding standards

Before adding a model call ask whether deterministic code can solve the task more reliably/faster/cheaper.

When AI is appropriate:

- pass only context that materially helps
- keep provider-specific transport behind Avantiqo runtime boundaries
- avoid duplicated model calls/reasoning
- verify important outputs deterministically where possible
- never let AI bypass capability authorization/lifecycle
- preserve action identity and evidence for execution

## Async and paid execution

For long-running/provider/GPU work:

- submit once with an immutable execution identity
- retain the exact provider/function/job identity
- resume/poll/observe that same execution
- separate transport/capacity failures from model/business failures
- do not blindly retry on ambiguous state
- run zero-cost/static preflight before paid proof where possible
- clean up/scaledown expensive resources according to the owning runtime contract

## Performance standards

For important workflows, measure end-to-end latency.

Avoid:

- unnecessary DB/network round trips
- serial independent work
- repeated inference
- repeated parsing/serialization
- avoidable cold starts
- polling where event-driven observation is superior
- abstractions that add measurable overhead without value

Optimization must preserve correctness, governance, and maintainability.

## Change standards

Before substantial change:

**fetch newest main → inspect current contract/callers → change coherently → deterministic checks → focused tests → build/E2E as applicable → commit → refetch newest main**

Do not perform uncontrolled mass refactors. Large migrations are allowed when the evidence and design justify them, but they need an explicit migration strategy, staged verification, and preservation of concurrent work.

## High-risk code

Apply stronger review/verification to:

- financial posting/payments/refunds/settlement
- payroll/compensation
- inventory/resource movements
- authorization/security
- external communications/publishing
- purchases/procurement commitments
- destructive data changes
- paid provider/GPU execution
- migrations of canonical business truth

The risk category is based on business effect, not old route names such as POS/Kitchen.

## Definition of quality

Code is not world-class because it uses modern patterns. It is world-class when the actual workflow is measurably correct, fast, reliable, safe, maintainable, economical, and easy for humans/Intelligence to operate.
