# Avantiqo Data Flow Architecture

**Status: living data-flow guidance**

This document describes how information and actions should move through Avantiqo. It is subordinate to [`../ARCHITECTURE.md`](../ARCHITECTURE.md).

## Core principle

Data flow should preserve business context, capability ownership, authorization, lifecycle rules, execution identity, and evidence from intent to result.

Canonical business flow:

**actor/request/event → authenticate → resolve/authorize business context → discover/invoke capability → governed execution → persistence/side effects → verification → evidence/result**

For AI-assisted work:

**user intent → Intelligence → business context → capability discovery → discussion/plan when needed → authorized execution → verification → result/evidence**

## Business context

Canonical context is organization-centric:

- `organization_id`
- `entity_id` where applicable
- `period_id` where applicable
- party relationships where applicable

Do not create a parallel tenant-resolution flow.

## API flow

Typical API flow:

**request → authentication → business-context authorization → validation → capability/service/runtime → governed result → response**

Routes should not become alternative homes for business logic, persistence orchestration, financial calculations, or AI/provider workflows.

## Capability/runtime flow

The owning capability/runtime is responsible for business behavior such as:

- invariants and lifecycle transitions
- deterministic calculations
- workflow orchestration
- authorization requirements beyond transport authentication
- execution identity/idempotency
- side effects
- verification
- evidence

Cross-domain behavior should use shared platform primitives rather than copied route-specific logic.

## Persistence flow

Persistence should record canonical business state and durable evidence.

Do not make persistence a passive dump behind arbitrary UI flows. Schema, transactions, events/movements, lifecycle state, and evidence must reflect the real business process.

## Event and async flow

Where asynchronous/event-driven execution improves reliability or user experience:

**business event/request → durable execution identity → dispatch → observe/resume same execution → verify → persist final evidence/result**

Do not submit a second paid/destructive operation merely because polling or transport became uncertain.

## AI flow

AI is part of the platform, not a provider call inserted directly into a route.

Preferred pattern:

**authorized context → Intelligence/reasoning → canonical capability → deterministic execution where possible → deterministic verification → explanation/result**

AI may recommend, prepare, discuss, navigate, and **execute authorized capabilities**. It must not bypass governance, financial integrity, lifecycle rules, or evidence requirements.

## Provider flow

External providers sit behind Avantiqo-owned service/runtime boundaries.

Typical commercial/provider flow:

**request → capability/service → reserve resources/wallet when required → select approved runtime/provider → execute once → capture usage/cost → verify → calculate price → settle → evidence**

Provider-specific transport must not become the business capability itself.

## Financial flow

Financial data flow must remain deterministic, auditable, reproducible, and entity/period/dimension aware where relevant.

Typical controlled mutation:

**business event/document → validate accounting contract → authorize → post/settle once → persist immutable references → verify ledger/settlement invariants → evidence/reporting**

AI may assist interpretation and preparation but does not replace deterministic accounting integrity.

## Operational flow

Operations uses neutral primitives such as:

- order
- service/job/task
- reservation/schedule
- location/resource/workstation
- fulfilment
- payment
- inventory/resource movement
- asset
- customer interaction

Restaurant POS or kitchen workflows are industry compositions of these primitives, not the universal operational architecture.

## Document flow

Documents are first-class business objects:

**capability/process → document state/content → approval/review where required → business effect/reference → evidence/audit → delivery/publication**

A generated PDF/file is an output representation; the governed document lifecycle and underlying business relationship are the source of truth.

## Performance rule

Avoid unnecessary round trips, repeated model inference, repeated DB fetches, polling when events are superior, and serialization/orchestration layers that add no business value.

Parallelize independent work safely, cache deterministic/reusable results where valid, and measure latency at the end-to-end workflow level.

## Verification rule

Every important data flow should have a proof strategy. Prefer:

**static/contract checks → deterministic tests → E2E state verification → controlled external/paid proof only when necessary**

A successful HTTP response is not sufficient evidence if the business side effect, persistence, or verification is missing.
