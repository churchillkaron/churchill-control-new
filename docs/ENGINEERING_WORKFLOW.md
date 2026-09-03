# Avantiqo Engineering Workflow

**Status: living engineering workflow**

This document is subordinate to [`../AGENTS.md`](../AGENTS.md), [`../ARCHITECTURE.md`](../ARCHITECTURE.md), and [`ENGINEERING_RULES.md`](./ENGINEERING_RULES.md).

## Standard workflow

For meaningful changes:

1. Fetch newest `main` and inspect parallel work.
2. Define the actual business/runtime outcome, not only the requested file or screen change.
3. Inspect the current `ERP_REGISTRY`, owning capability/runtime, schema, callers, tests, and relevant living documentation.
4. Reproduce or establish the current behavior with evidence.
5. Identify root cause and the canonical owner of the change.
6. For important architecture/product/AI/performance decisions, research the strongest current approaches and challenge inherited assumptions.
7. Implement one coherent solution that strengthens the canonical platform rather than adding a parallel path.
8. Verify from cheapest deterministic checks through the level of E2E/provider proof actually required.
9. Refetch newest `main` immediately before writing/committing when concurrent work may have landed.
10. Preserve unrelated changes and commit a stable checkpoint to `main`.
11. Treat production deployment as a separate explicit release step.

Do not turn this sequence into ceremony. Skip irrelevant layers, but never skip the proof needed for the claim being made.

## Architecture workflow

Before creating a domain, workspace, capability, service, engine, registry, route family, queue, worker, storage system, or table, answer:

- What real business object/event/state/action is being modeled?
- Which canonical domain/workspace/capability owns it?
- Does the current platform already contain the needed primitive/runtime?
- Would this create a second source of truth or execution path?
- Is an industry, route, or UI label being mistaken for architecture?
- Can deterministic code solve the requirement more reliably than AI?
- Can a simpler/faster/safer/cheaper design be proven than the conventional approach?
- What evidence will certify the resulting behavior?

Canonical improvement loop:

**research → understand → challenge assumptions → invent → prototype → measure → compare → improve → certify**

## API workflow

Routes should normally:

- authenticate the actor
- resolve and authorize canonical business context
- parse/validate the request
- invoke the owning capability/service/runtime
- translate the governed result to the transport response

Canonical business context is organization/entity/party based, with period where applicable. Do not introduce tenant resolution as a new preferred architecture.

Routes should not independently own accounting, workflow, AI/provider orchestration, inventory/resource calculation, payroll, pricing, or other domain logic.

## Capability and service workflow

Business behavior belongs with the capability/runtime that owns the real business problem.

A service layer is useful when it creates a meaningful contract, composition, lifecycle, or business boundary. Do not create forwarding layers solely to satisfy a folder convention.

Human UI, API, Intelligence, and automation should reuse the same governed capability when they perform the same business action.

## Migration workflow

Migration strategy should follow the risk and dependency graph, not arbitrary rules such as “one route at a time.”

Prefer staged/additive/backward-compatible migration when it lowers risk. A larger atomic migration can be correct when splitting it would create inconsistent intermediate states.

Every migration should define:

- current and target source of truth
- affected callers/data/runtime paths
- compatibility period if any
- authorization and lifecycle implications
- rollback/recovery or forward-repair strategy
- legacy removal/convergence plan
- verification of the actual business workflow

Do not preserve two architectures indefinitely merely because migration is inconvenient.

## Verification workflow

Use the layers relevant to the change:

1. exact source/config/contract inspection
2. syntax/static/architecture checks
3. focused deterministic tests
4. broader tests/lint where relevant
5. normal full build for substantial application changes
6. subsystem E2E/smoke/certification
7. controlled external/paid proof only when earlier layers cannot establish the claim

For expensive/destructive/external actions, verify exact execution identity and reconcile uncertainty instead of blindly resubmitting.

## High-risk changes

Risk is based on business effect, not historical route names.

Apply stronger verification to changes involving:

- authentication, authorization, RLS, secrets, or business context
- financial posting, payments, refunds, settlement, tax, or accounting integrity
- payroll/compensation
- inventory/resource movements and procurement commitments
- destructive or irreversible data changes
- customer/external communications and publication
- paid provider/GPU execution
- canonical registries/shared runtimes
- migrations of source-of-truth data

## Performance and cost workflow

For material performance/cost work:

1. measure the end-to-end baseline
2. identify the real bottleneck/cost center
3. remove unnecessary round trips, serial work, repeated inference, polling, cold starts, or overpowered compute
4. test the alternative under a representative workload
5. compare correctness, latency, reliability, and total cost per successful outcome
6. retain the change only when it improves the actual system

Do not optimize a metric that does not improve the user/business outcome.

## Documentation workflow

Do not duplicate the same architecture rule across every document.

For a major change:

1. update the executable contract/source first or together with the change
2. update the minimum canonical/living documents required to keep the system understandable
3. search for terminology/contracts made obsolete by the change
4. mark historical snapshots as historical rather than rewriting history
5. ensure README, root architecture, system map, engineering rules, and scoped docs no longer disagree

Documentation authority and status rules are defined in [`README.md`](./README.md).

## Completion standard

A task is complete only at the level actually proven. Keep these states distinct:

**implemented → connected → tested → E2E verified → provider/runtime proven → certified → production deployed**

“World-class”, “better”, “faster”, and “production-ready” are evidence claims, not adjectives.
