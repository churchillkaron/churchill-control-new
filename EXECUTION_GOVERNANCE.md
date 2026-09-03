# Avantiqo Execution Governance

**Status: living execution-governance contract**

The permanent architecture contract is [`ARCHITECTURE.md`](./ARCHITECTURE.md). Exact implementation paths and symbols must be read from current `main`; this document governs execution semantics rather than freezing an old Churchill event/queue stack.

## Core principle

A business action must execute through the **canonical governed capability/runtime that owns the action**, with authorization, lifecycle rules, exact execution identity where needed, persistence, verification, and evidence.

Canonical platform flow:

**PLATFORM → USER → BUSINESS CONTEXT → UBTE → ERP_REGISTRY → DOMAIN → WORKSPACE → CAPABILITY → DOCUMENT / ACTION / PROCESS**

Not every capability must traverse the same queue, event bus, kernel, or worker topology. Different workloads legitimately have different synchronous, asynchronous, event-driven, AI, provider, and accelerator requirements.

The invariant is one coherent business architecture and one canonical production path per capability—not one physical runtime pipeline for every kind of work.

## Entry paths

A governed capability may be initiated by:

- human UI
- API/integration
- Avantiqo Intelligence
- automation/workflow
- business event
- scheduled process
- external callback/webhook

All entry paths must converge on the same business rules and authorization/evidence contracts when they represent the same action.

## Business context

Execution must preserve canonical context:

- `organization_id`
- `entity_id` where applicable
- `period_id` where applicable
- party relationships where applicable
- actor/system identity and permissions

Do not create a separate tenant execution model.

## Capability ownership

The owning capability/runtime is responsible for the business execution contract, including where relevant:

- validation/invariants
- lifecycle transitions
- authorization beyond transport authentication
- deterministic calculations
- transaction/side-effect boundaries
- idempotency/at-most-once behavior
- persistence
- verification
- evidence

Shared infrastructure can provide queueing, workflow, events, tasks, scheduling, provider transport, wallet/usage, observability, and other common mechanics without owning domain business semantics.

## Synchronous execution

Use synchronous execution when the operation is bounded, reliable within the request lifecycle, and doing so provides the simplest/fastest correct user experience.

Do not force every action through a queue/event chain merely for architectural uniformity.

## Asynchronous execution

Use durable asynchronous execution when it materially improves reliability, latency, scalability, resumability, external-job observation, or user experience.

Typical candidates include:

- AI/media generation
- long-running analysis/import/export
- provider/accelerator jobs
- publication/communication workflows
- large reconciliation/reporting work
- processes waiting on external events

Async work should preserve an immutable Avantiqo execution identity and, where external work exists, the exact provider/function/job identity.

## Event-driven execution

Events are appropriate when a completed business fact should trigger decoupled downstream work or when event-driven observation is superior to repeated polling.

Events must represent meaningful facts/contracts, not become an opaque alternative command bus that hides business ownership.

A business feature does **not** need to emit an event before every execution. Commands/actions and events serve different purposes.

## AI execution

Avantiqo Intelligence may reason, discuss, prepare, navigate, and execute authorized capabilities.

Preferred pattern:

**intent/reasoning → canonical capability → deterministic execution where possible → deterministic verification → result/evidence**

AI does not need to manufacture an intermediate event merely to execute a capability unless the owning execution contract is genuinely event-driven.

AI may not bypass permissions, approvals, financial controls, lifecycle rules, at-most-once safety, or evidence requirements.

## External, paid, destructive, and irreversible actions

Use explicit execution identity and controlled dispatch.

Preferred lifecycle:

**prepare → identify → claim/reserve → dispatch once → observe → verify → settle**

Examples include payments, posting, purchases, external communications, publishing, GPU/model jobs, provider generation, destructive mutations, and other costly/irreversible effects.

If execution becomes ambiguous:

1. record/retain the uncertain state
2. inspect the existing execution and external identity
3. reconcile/observe that execution
4. only resubmit when evidence proves a new execution is safe and necessary

Do not use blind retry as recovery.

## Retry and recovery

Retry policy belongs to the layer that can safely understand the operation's semantics.

- Pure deterministic/read-only work may be freely retryable.
- Idempotent mutations require a stable idempotency/execution key.
- External/paid/destructive work requires reconciliation before resubmission after ambiguity.
- Capacity/scheduling/transport failures must be distinguished from model/business failures.

A generic queue retry counter must not override business-level at-most-once safety.

## Provider and accelerator execution

Provider/GPU workers should execute the smallest irreducible external/accelerated operation where technically and economically sensible.

Keep Avantiqo-owned:

- business orchestration
- authorization
- wallet/usage/pricing logic
- deterministic validation
- evidence
- persistence/finalization
- verification that does not require paid acceleration

Use exact provider/job identity and avoid duplicate endpoints/storage/caches/executions unless a demonstrated requirement justifies them.

## Financial execution

Financial changes must remain deterministic, auditable, entity/period aware where relevant, and protected against duplicate posting/settlement.

AI/workflow/event initiation may prepare or request a financial capability, but the accounting/settlement runtime owns the deterministic financial effect and verification.

## Cross-domain execution

A workflow spanning domains should compose the owning capabilities rather than centralize every rule into a mega-runtime.

Cross-domain coordination should preserve:

- shared business context
- explicit ownership of each business effect
- stable contracts/events between domains where useful
- exact execution identity for important side effects
- resulting evidence and invariant verification

Finance, People, Supply Chain, Commercial, Operations, Creative, and other domains do not need one identical physical execution stack; they need one coherent governed capability architecture.

## Evidence and observability

For important executions preserve enough information to reconstruct:

- initiator/actor
- organization/entity context
- capability/action
- requested/prior/resulting state where applicable
- execution identity
- external provider/job identity where applicable
- lifecycle/status transitions
- financial/operational effect
- usage/cost/settlement where applicable
- verification result
- errors/uncertainty
- timestamps and related documents/evidence

## Duplication guard

Do not create parallel queues, workflow engines, execution routers, provider routers, or runtimes for the **same capability contract** merely because the existing path is temporarily inconvenient.

Specialized runtimes are valid when the workload genuinely differs. Duplication is judged by contract and ownership, not by whether two modules both happen to execute code.

## Evolution rule

Execution architecture may evolve when evidence proves a better design.

**research → prototype → measure → compare → prove → migrate deliberately**

Do not preserve obsolete queue/kernel/event paths as architectural authority solely because historical files reference them.
