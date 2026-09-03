# Avantiqo Engineering Rules

**Status: living engineering contract**

This document defines day-to-day engineering rules. It is subordinate to the permanent architecture contract in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) and the repository operating contract in [`../AGENTS.md`](../AGENTS.md).

## Core philosophy

Avantiqo is one intelligent, multi-industry business operating platform, not a collection of pages, customer-specific mini-products, or disconnected AI tools.

Changes must preserve or improve:

- operational integrity
- organization/entity authorization boundaries
- auditability and evidence
- financial correctness
- workflow/lifecycle correctness
- execution safety
- reliability
- performance
- cost efficiency
- maintainability
- cross-industry reuse

## Change rules

Always:

- fetch and inspect newest `main` before substantial work and immediately before writes
- identify the root cause before changing architecture
- inspect the existing domain, capability, runtime, schema, and tests before creating new structures
- make cohesive changes that preserve concurrent work
- verify affected workflows from cheapest deterministic proof to broader E2E proof
- commit stable checkpoints directly to `main` unless explicitly instructed otherwise
- distinguish implemented, tested, E2E verified, provider-proven, certified, and production-deployed states

Never:

- introduce architecture by accident
- create duplicate infrastructure or business logic to bypass a temporary failure
- create a second source of truth for the same business concept
- reintroduce `tenant` as a business architecture
- hardcode a generic platform capability around one industry
- claim success from source existence, optimistic UI, or provider acceptance alone
- overwrite unrelated concurrent work

## Research, invention, and competitive standard

Best practice is a baseline, not the target.

For important product, architecture, AI, workflow, UX, automation, infrastructure, performance, cost, and capability decisions:

1. Research the strongest current systems, technologies, research, open-source implementations, commercial products, benchmarks, and emerging approaches relevant to the decision.
2. Understand where those approaches are strong and where they remain slow, expensive, manual, fragmented, fragile, difficult to use, or constrained by inherited assumptions.
3. Challenge whether the conventional design is necessary.
4. Prototype a materially better alternative when there is a credible opportunity.
5. Measure it against the conventional/reference solution.
6. Keep the new design only when evidence supports it.
7. Certify the actual runtime behavior before making world-class claims.

Canonical loop:

**research → understand → challenge assumptions → invent → prototype → measure → compare → improve → certify**

Useful comparison dimensions include:

- correctness
- reasoning/decision quality
- task completion
- autonomy
- latency
- reliability
- cost per successful outcome
- safety/governance
- usability
- number of human steps

Failure is evidence. If Avantiqo loses a meaningful benchmark, investigate and improve the system rather than weakening the benchmark.

## Canonical business context

Business logic must use the canonical Avantiqo business model:

**organization → entity → party**

Context may include:

- `organization_id`
- `entity_id` where applicable
- `period_id` where applicable
- party relationships where applicable

Rules:

- authenticate the actor
- authorize access to the requested organization/entity/context
- never hardcode organization or entity IDs into generic business logic
- never create `tenant_id`, `getTenantId()`, tenant isolation, or equivalent parallel business-context architecture as the preferred model
- if legacy tenant-named code still exists, treat it as migration debt and converge it toward the canonical organization/entity model when safely touched

## API rules

Routes under `app/api/*` are delivery boundaries, not independent business systems.

Normal responsibilities:

- authenticate the actor
- resolve and authorize canonical business context
- parse the request
- validate input
- invoke the owning capability/service/runtime
- return the governed result

Do not put large business logic, accounting engines, workflow state machines, AI prompt/orchestration systems, inventory calculations, payroll calculations, pricing policy, or provider-specific product logic directly in routes when an owned capability/runtime should hold it.

## Capability and service rules

Business logic belongs with the domain/capability/runtime that owns the underlying business problem.

Services and runtimes should:

- model real business behavior and invariants
- remain reusable across delivery surfaces
- avoid UI/request-response assumptions
- preserve lifecycle, authorization, evidence, and verification
- use shared platform primitives when the concept is genuinely shared

A new service directory is not automatically the correct answer. Inspect the existing runtime first.

## Shared infrastructure rules

Use the repository's current canonical shared infrastructure and clients. Do not instantiate competing infrastructure clients, registries, queues, schedulers, provider abstractions, execution routers, or persistence layers merely for local convenience.

Where the repository has a canonical client or runtime, extend it or deliberately migrate it rather than silently creating another one.

## Avantiqo-first compute and cost boundary

Canonical contracts include:

- `docs/STUDIO_FIRST_COMPUTE.md`
- `config/avantiqo-compute-cost-policy.json`
- `AVANTIQO_STUDIO_FIRST_COMPUTE_BOUNDARY_V1`
- `AVANTIQO_COMPUTE_COST_ARCHITECTURE_V1`

Mandatory priority:

1. reuse a valid existing result/cache/artifact when possible
2. execute inside Avantiqo without separate supplier-variable compute cost when technically sensible
3. use an Avantiqo-owned paid accelerator only for the smallest irreducible GPU/model stage
4. use a paid external specialist only when the capability genuinely cannot be provided by Avantiqo or the specialist is measurably superior for the governed workload

Rules:

- business logic, orchestration, validation, wallet/pricing, storage ownership, deterministic CPU work, verification, final persistence, and ordinary gateways belong in Avantiqo when technically appropriate
- accelerator workers should execute the smallest irreducible accelerator/model operation rather than becoming an alternative application backend
- implementation convenience is not a valid reason to move ordinary work onto paid compute
- CPU media work such as encode/transcode, mux/demux, frame extraction, ordinary resize/crop, storage finalization, metadata, deterministic validation, packaging, and cleanup should stay off paid accelerator workers when technically practical
- paid workers should return control when the irreducible paid operation completes
- scale expensive GPU workers to zero by default unless measured latency/economic evidence justifies warm retention
- use the hardware tier that minimizes total cost per successful outcome while satisfying model fit, quality, and latency requirements
- high-end H100/B200-class hardware requires evidence that lower-cost hardware cannot satisfy the workload or that the higher tier materially improves total economics/quality/latency
- no speculative expensive prewarming without evidence
- no duplicate Modal + RunPod execution for the same job
- no repeated paid retries against an unchanged structural failure
- paid model bake/cache seeding requires explicit approval where the current governance contract requires it
- maintain one canonical persistent model storage/cache per engine unless a demonstrated availability, isolation, geography, security, scaling, or cost requirement justifies more
- certification should pass zero-cost/static gates before paid proof; use the minimum paid executions needed to establish the runtime claim

Existing transitional infrastructure is not precedent for new architecture. When touched, evaluate whether it should converge toward the canonical boundary.

Relevant paid-worker changes must run the current repository audits, including where applicable:

- `scripts/studio-first-compute-boundary-audit.mjs`
- `scripts/avantiqo-compute-cost-policy-audit.mjs`

Always inspect current `package.json` and scripts because audit names and scope can evolve.

## Deterministic systems and AI

Do not use an LLM where deterministic computation can provide a reliable answer.

Preferred pattern:

**AI reasoning/judgment → deterministic execution → deterministic verification → AI explanation when useful**

Use AI where reasoning, interpretation, synthesis, creativity, ambiguity handling, or adaptation materially improves the outcome.

Avoid unnecessary model chains, repeated inference, redundant agents, and model calls that can be replaced by deterministic validation or cached computation.

## AI execution rules

Avantiqo Intelligence must use the same governed business capabilities as human interfaces whenever practical.

AI may:

- read authorized business state
- reason and discuss alternatives
- navigate
- show numbers/evidence
- prepare documents/content
- invoke capabilities
- execute authorized actions
- monitor and verify outcomes

AI must not bypass authorization, lifecycle rules, financial controls, evidence requirements, or at-most-once safety.

## Operational safety

Treat these classes as high risk when they mutate state or incur spend:

- finance, accounting, posting, settlement, payments, refunds
- payroll, compensation, workforce-sensitive actions
- inventory and supply-chain movements
- purchases and procurement commitments
- customer/external communications and publishing
- paid AI/provider/GPU executions
- destructive or irreversible mutations
- authentication, permissions, secrets, and security boundaries

For high-risk changes:

- isolate the change
- inspect blast radius
- prefer read-only/static proof first
- use test/benchmark-scoped data for mutating verification
- verify the actual resulting state/evidence
- reconcile ambiguous execution rather than blindly retrying

## At-most-once execution

For expensive, external, destructive, or irreversible operations, use explicit execution identity and idempotency/at-most-once protection.

Preferred lifecycle:

**prepare → identify → claim/reserve → dispatch once → observe → verify → settle**

If the result becomes uncertain, record uncertainty and inspect/reconcile the existing execution before any resubmission.

## Async and event rules

Heavy or long-running work should not block request lifecycles unnecessarily.

Use async/event-driven execution when it materially improves reliability, latency, scalability, or user experience. Do not make something asynchronous merely because it is fashionable.

Good candidates can include:

- AI/media generation
- publishing
- OCR/document processing
- large analytics/reconciliation jobs
- long-running imports/exports
- workflows awaiting external events

Preserve exact job identity across dispatch, polling/resume, verification, and evidence.

## Database rules

The database represents canonical business truth.

Always:

- preserve organization scoping and entity context where applicable
- model real relationships and lifecycle state
- preserve audit/evidence and timestamps
- preserve immutable/historical financial evidence where required
- use safe migrations and inspect data assumptions before destructive changes
- maintain one source of truth per business concept

Never:

- mutate protected historical financial/payroll evidence without the governed correction mechanism
- bypass inventory/financial movement evidence
- create a second table/store simply to avoid understanding the existing model
- infer architecture from a frontend screen and mirror it blindly into schema

## Frontend rules

Pages and components should orchestrate user interaction with canonical capabilities.

Prefer shared workspace, capability, action, document, navigation, and data primitives when they support a strong workflow.

Never duplicate backend financial, execution, workflow, provider, or authorization logic in the frontend.

Reuse is not an excuse for mediocre UX. If a shared primitive blocks a materially better workflow, improve the primitive for the platform.

## Verification and certification

Verification should progress from cheapest/deterministic to broadest/most expensive:

1. inspect exact changed source and contracts
2. run syntax/static/architecture audits
3. run focused deterministic tests
4. run broader repository tests/lint where relevant
5. run the normal full build for substantial changes
6. run subsystem E2E/smoke/certification
7. perform a controlled real-provider/paid execution only when it proves something the earlier layers cannot

Do not conflate:

- implemented
- connected
- tested
- E2E verified
- provider execution passed
- certified
- production deployed

Claims such as **world-class**, **faster**, **better**, **6/6**, or **production-ready** require reproducible evidence from a meaningful contract/benchmark.

## Git and release workflow

`main` is the canonical branch unless the user explicitly requests another workflow.

Follow [`../AGENTS.md`](../AGENTS.md) for concurrency and release safety.

Key rules:

- fetch newest `main` before work and before writes
- preserve parallel agents' unrelated changes
- use cohesive commits
- do not include the production-deploy marker in ordinary development commits
- production deployment is a separate intentional final release step

## Long-term goal

Build the most intelligent, fast, reliable, autonomous, coherent, and economically efficient business operating platform possible.

Do not target feature parity with conventional ERP or AI products. Understand the strongest competing approaches, retain what is proven, eliminate unnecessary human steps and system complexity, and invent better primitives where evidence shows they win.
