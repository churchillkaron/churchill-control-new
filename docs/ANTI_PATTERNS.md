# Avantiqo Engineering Anti-Patterns

**Status: living engineering guidance**

These are patterns that commonly create architecture drift, duplicated truth, unreliable execution, unnecessary latency/cost, or industry lock-in.

## Bad: business logic in delivery routes

Avoid placing accounting, workflow, inventory/resource, AI orchestration, pricing, provider, or lifecycle logic directly in API routes or pages.

Prefer:

**delivery surface → canonical capability/service/runtime → governed persistence/effects → verification**

Reason: routes/pages are interfaces, not parallel business systems.

## Bad: tenant architecture revival

Avoid:

- new `tenant_id` fields as generic business ownership
- `getTenantId()` as the canonical context resolver
- tenant-specific service/query layers
- hardcoded tenant/business IDs

Prefer canonical organization/entity/party context and actual authorization contracts.

Reason: tenant terminology represents a superseded architecture and creates a competing source of identity/context truth.

## Bad: duplicate infrastructure clients and runtimes

Avoid creating random Supabase clients, queues, registries, provider routers, schedulers, GPU endpoints, storage volumes, or execution engines when a canonical shared path already exists.

Reason: duplicated infrastructure creates inconsistent auth, retries, cost, state, and operational ownership.

## Bad: route or industry names becoming architecture

Avoid treating `/pos`, `/kitchen`, `/marketing`, `/staff`, restaurant, hotel, retail, or another solution label as proof that a new top-level domain/runtime is required.

Prefer reusable business primitives and canonical `ERP_REGISTRY` domains/capabilities.

Reason: UI/industry composition should not fork the platform architecture.

## Bad: cross-domain duplication

Avoid copying Finance logic into Commercial, Supply Chain logic into Operations, People logic into Projects, or Creative/provider logic into individual screens.

Prefer explicit capability contracts/events and governed composition.

Reason: duplicate rules eventually diverge and make AI/autonomous execution unsafe.

## Bad: shared dumping ground

Avoid moving business logic into generic `shared`, `utils`, `helpers`, or infrastructure modules merely because many callers need it.

Prefer a real shared platform primitive with clear contract/owner or keep domain logic with its owning capability.

## Bad: shadow registries and maps

Avoid creating a new static list/table/document that becomes another definition of domains, workspaces, capabilities, providers, or execution paths when a canonical executable registry/configuration exists.

Documentation should point to executable truth rather than duplicate volatile inventories.

## Bad: AI-only business paths

Avoid implementing a business action only inside prompts/agents when the real Avantiqo capability already exists.

Prefer:

**AI reasoning → canonical governed capability → deterministic execution/verification where possible**

Reason: humans, APIs, automation, and Intelligence should not produce different business effects for the same action.

## Bad: LLM for deterministic work

Avoid model calls for arithmetic, validation, sorting/filtering, schema checks, exact transformations, idempotency checks, or other reliably computable tasks unless AI materially improves the task.

Reason: unnecessary inference increases latency, cost, nondeterminism, and failure surface.

## Bad: blind retry after ambiguous execution

Never solve uncertain provider/GPU/payment/posting/communication state by submitting the same expensive/destructive action again without reconciliation.

Prefer:

**identify → dispatch once → retain exact execution ID → observe/resume → verify → settle**

Reason: uncertainty is not proof that the first action failed.

## Bad: paid compute as convenience backend

Avoid moving orchestration, validation, CPU media work, polling, storage finalization, or ordinary business logic to paid accelerator workers simply because dependencies already exist there.

Reason: paid compute should execute the smallest irreducible accelerated operation unless evidence proves a different boundary is superior.

## Bad: duplicate persistent model storage

Avoid multiple persistent stores/caches for one AI engine merely to bypass temporary capacity/placement problems.

Duplicates require demonstrated availability, isolation, geography, security, scaling, or economic need.

## Bad: optimistic success without verification

Avoid declaring success because:

- an HTTP call returned 200
- a provider accepted a job
- code compiled
- a button rendered
- an LLM response looked plausible

Verify the intended business/runtime result and its evidence.

## Bad: frontend as source of truth

Avoid business state that exists only in React/page state when it represents a durable business fact, approval, payment, posting, task, document, or lifecycle transition.

The UI is an interface over governed truth.

## Bad: screen-shaped schema

Avoid adding tables/columns because a screen needs somewhere to store its fields before understanding the real business object, relationship, lifecycle, and ownership.

Model business reality first.

## Bad: historical document as current architecture

Avoid following an old audit, migration note, Churchill-era map, benchmark snapshot, or authoritative-sounding legacy filename as current technical truth without checking `main` and documentation authority.

Reason: historical evidence explains the past; it does not silently override the current architecture.

## Bad: uncontrolled mass refactor

Avoid large rewrites with no migration strategy, dependency analysis, checkpoints, or staged verification.

Large architectural changes are allowed when evidence justifies them, but they require deliberate convergence rather than simultaneous unverified replacement.

## Bad: standard practice as the only justification

Avoid “this is how everybody does it” as the design rationale.

Research the strongest approaches, challenge assumptions, prototype alternatives, and measure the winner.

## Bad: skipping real verification

For substantial work, use the applicable ladder:

**source/static → focused deterministic tests → broader tests/build → subsystem E2E → controlled external/paid proof when necessary**

A migration/refactor is not complete until the relevant real workflow and invariants agree with the intended architecture.
