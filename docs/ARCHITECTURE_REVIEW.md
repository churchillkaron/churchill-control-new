# Avantiqo Architecture Review

**Status: living architecture-review framework**

The permanent architecture contract in [`../ARCHITECTURE.md`](../ARCHITECTURE.md) is authoritative. This review exists to prevent accidental architecture, not to create bureaucracy.

Use it for changes that materially affect platform structure, business truth, execution semantics, AI/runtime boundaries, security, performance, cost, or cross-domain behavior.

## 1. Problem and outcome

Before reviewing a proposed implementation, state the real problem and desired measurable outcome.

Ask:

- What user/business outcome are we improving?
- What is wrong or constrained in the current system?
- What evidence establishes the current behavior/baseline?
- Is an architecture change actually necessary, or can the existing capability/runtime solve it cleanly?

Do not approve architecture merely because a proposed library, service, agent, queue, provider, or database pattern is fashionable.

## 2. Existing-system discovery

Inspect newest `main` before proposing a new structural element.

Check:

- `ERP_REGISTRY`
- owning domain/workspace/capability
- shared runtimes/primitives
- schema and source of truth
- existing APIs/events/tasks/workflows
- provider/compute paths
- tests/certifications
- current living documentation

A review is incomplete if it evaluates a new architecture without understanding what Avantiqo already has.

## 3. Business reality and ownership

Ask:

- What business object, event, state, responsibility, document, action, or evidence exists in reality?
- Which canonical domain owns that meaning?
- Which capability should expose/execute it?
- Is a screen, route, provider, customer, or industry label being mistaken for a domain?
- Does the proposal preserve industry neutrality where the concept is generic?

The canonical domain topology comes from `ERP_REGISTRY`; review documents must not create a shadow taxonomy.

## 4. Business context and authorization

Avantiqo uses organization/entity/party context, with period where applicable.

Review:

- organization ownership/scoping
- entity semantics where relevant
- party relationships where relevant
- role/capability authorization
- RLS/server-side enforcement
- platform/system-only boundaries
- secrets and privileged execution

Do not introduce tenant architecture as a shortcut.

## 5. Source-of-truth and duplication review

Ask:

- What is the source of truth before and after this change?
- Does the proposal create another registry, table, cache, state machine, provider path, queue, worker, navigation model, or execution engine for the same concept?
- If temporary coexistence is required, what is authoritative and when is the legacy path removed?
- Can human UI, API, Intelligence, and automation reuse one governed capability instead of parallel implementations?

Duplication requires evidence, not convenience.

## 6. Execution semantics and failure modes

For state-changing work, define:

- lifecycle/state transitions
- transaction boundaries
- concurrency/race behavior
- idempotency/at-most-once behavior
- exact execution/job identity
- external side effects
- retry policy
- ambiguous/uncertain execution handling
- verification and reconciliation
- settlement/cost handling where relevant

For expensive, destructive, or irreversible actions, prefer:

**prepare → identify → claim/reserve → dispatch once → observe → verify → settle**

Never use blind retry as the ambiguity strategy.

## 7. Deterministic versus AI review

Ask whether AI is actually needed.

Use deterministic systems for reliably computable work. Use AI where reasoning, synthesis, interpretation, creativity, ambiguity handling, or adaptation materially improves the result.

Preferred pattern:

**AI reasoning/judgment → governed capability → deterministic execution where possible → deterministic verification → explanation/result**

If AI executes business work, it must use canonical capabilities and the same or stronger authorization/governance as human execution.

## 8. Provider and compute boundary

For AI/provider/accelerator architecture review:

- What is Avantiqo-owned versus supplier-specific?
- Can the provider/model be replaced without rebuilding the business capability?
- Is paid compute limited to the irreducible accelerated/external operation where appropriate?
- Are duplicate endpoints/storage/caches/runtimes being created to bypass a temporary problem?
- What warm/cold behavior is justified by measured latency and economics?
- How are usage, supplier cost, customer price, wallet settlement, and evidence handled?
- What happens when capacity/placement/transport fails versus model/business logic failing?

Choose architecture based on total successful-outcome quality/cost/latency, not vendor habit.

## 9. Performance review

Performance is architectural.

Measure the real end-to-end workflow and inspect:

- network/database round trips
- repeated reads/calculations
- serial work that could safely run in parallel
- repeated model inference
- context size
- cold starts/model loading
- polling versus event-driven observation
- serialization/framework overhead
- query/index behavior
- caching/precomputation opportunities
- user-perceived latency

Do not trade correctness/governance for speed, and do not accept unnecessary slowness because the architecture is technically correct.

## 10. Cost review

Evaluate total cost per successful outcome:

- model/provider cost
- GPU/accelerator time
- persistent storage/cache cost
- idle/warm infrastructure
- database/network cost
- repeated retries/inference
- engineering/operational complexity
- human effort and manual steps

Cheapest supplier price is not automatically lowest total cost. More expensive compute can be correct if measured throughput/quality/latency lowers total successful-outcome cost.

## 11. Evidence, audit, and observability

For important workflows, confirm the design can answer:

- who/what initiated it
- which organization/entity/context
- which capability executed
- prior/requested/resulting state where relevant
- exact execution/provider/job identity
- financial/operational effect
- verification result
- approval/review state
- usage/cost
- errors/uncertainty
- timestamps and document/evidence references

Do not use raw private model chain-of-thought as the audit mechanism.

## 12. UX and autonomy review

Architecture should reduce user effort, not merely reorganize backend code.

Ask:

- How many human steps does the workflow require?
- Can context be inferred safely instead of repeatedly configured?
- Can multiple screens/hand-offs become one coherent capability/workflow?
- Can Intelligence discuss, navigate, prepare, execute, monitor, and verify through the same capability model?
- Does automation preserve user control and authorization without forcing unnecessary manual work?

A technically elegant architecture that creates a worse operator experience is not world-class.

## 13. Competitive research and invention review

For major decisions, research the strongest current reference systems, research, open-source approaches, commercial products, and benchmarks.

Ask:

- What do the strongest competitors/reference systems do well?
- Where are they slow, manual, expensive, fragmented, constrained, or hard to use?
- Which assumptions are historical rather than necessary?
- Can Avantiqo remove steps, reduce latency/cost, improve reliability, or invent a better primitive?
- What experiment would prove the alternative?

Canonical loop:

**research → understand → challenge assumptions → invent → prototype → measure → compare → improve → certify**

“This is standard practice” is not sufficient evidence.

## 14. Migration and coexistence review

Architecture evolution may require staged migration.

Define:

- current canonical path
- target canonical path
- compatibility boundary
- data/backfill strategy
- caller migration order
- feature/routing controls if needed
- rollback or forward-repair strategy
- observability during migration
- explicit removal criteria/date/condition for legacy path

Temporary coexistence is acceptable when governed. Permanent ambiguity is not.

## 15. Verification and certification plan

Before approval, define how the architecture will be proven.

Use the minimum reliable ladder:

**static/contract → deterministic tests → build/integration → E2E/state verification → controlled provider/paid proof where necessary → benchmark/certification**

Define the success thresholds before testing where possible.

Claims such as *faster*, *safer*, *cheaper*, *better*, *world-class*, or *production-ready* need reproducible evidence.

## Review outcomes

A review should end with one of these outcomes:

- **Use existing architecture** — no new structural element needed.
- **Prototype/benchmark** — credible alternative exists but needs evidence.
- **Approve** — design strengthens canonical architecture and proof plan is sufficient.
- **Approve staged migration** — temporary coexistence is explicitly governed.
- **Reject** — duplicates truth/runtime, weakens safety, hardcodes an industry, or lacks a credible advantage.
- **Defer** — missing evidence or dependency makes the decision premature.

Record the decisive reasoning and measurable trade-offs for major architecture decisions. Use an ADR only when the decision is important enough that future engineers need to understand why an alternative was rejected; do not create process paperwork for routine implementation choices.
