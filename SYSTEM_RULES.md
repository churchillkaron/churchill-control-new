# Avantiqo System Rules

**Status: living system coherence guard**

The permanent architecture authority is [`ARCHITECTURE.md`](./ARCHITECTURE.md). This file protects core runtime boundaries without freezing historical implementation names or forbidding architecture that current Avantiqo explicitly requires.

## 1. Structure and discovery

- `ERP_REGISTRY` is the canonical ERP domain/workspace/capability topology.
- Do not create competing domain/module/capability registries for the same platform structure.
- Delivery surfaces, routes, industry solutions, provider lists, and navigation models must not redefine canonical business topology.

## 2. Business execution

UBTE is the canonical business transaction/execution architecture where the current capability contract uses UBTE.

The rule is **one governed production execution path per capability**, not “no runtime engines allowed.”

Avantiqo legitimately contains specialized runtimes/engines for capabilities such as Intelligence, Code, Video, Voice/Audio, Image, workflows, documents, communications, and provider-backed execution. Those runtimes must integrate with the canonical capability/business-execution architecture rather than become alternative ERP systems.

Do not create another execution router for the same capability merely to bypass a temporary problem.

## 3. Billable execution

Billable execution must use the current canonical Avantiqo usage/wallet/pricing/settlement contract.

Where `WalletRuntime` is the current canonical implementation, do not bypass it with direct untracked provider spend.

The durable invariant is:

**request → governed capability/service → reserve/authorize resources when required → execute → capture usage/supplier cost → verify → price/settle → evidence**

Do not fossilize one class/function name as permanent architecture if the canonical wallet implementation is deliberately migrated later.

## 4. Provider architecture

Provider abstraction is **required where it preserves Avantiqo ownership of the business capability**.

External providers/models should sit behind Avantiqo-owned capability/runtime boundaries so that business workflows are not tightly coupled to a supplier.

Provider registries/routers are acceptable when they are the canonical implementation of provider selection/governance. What is forbidden is a **second competing provider abstraction or routing system for the same operation** without an explicit migration/evidence-backed reason.

## 5. AI and specialized engines

Strategic AI engines may have specialized runtimes because Intelligence, Code, Video, Voice/Audio, Image, and similar workloads have different execution, hardware, latency, and verification requirements.

Rules:

- one canonical production path per capability/engine
- same governed business capability accessible to human UI/AI/automation where it represents the same action
- exact execution identity for async/paid work
- no blind duplicate submission on ambiguity
- deterministic preflight/verification where possible
- provider/compute details must not become duplicated business logic

## 6. Source-of-truth invariants

Canonical sources of truth are defined by concept, not by a blanket list of historical classes:

- business topology → `ERP_REGISTRY` and current canonical implementation
- business/financial data → owning canonical persistence/domain contracts
- business execution → owning governed capability/UBTE/runtime contract
- money/usage/settlement → canonical wallet/usage/pricing runtime
- provider job state → canonical execution record plus exact external identity
- documentation authority → [`docs/README.md`](./docs/README.md)

Do not maintain two permanent sources of truth for the same concept.

## 7. Forbidden patterns

Unless explicitly governed as a migration or proven architectural requirement, do not add:

- a second domain/capability registry
- a second business execution path for the same capability
- a second provider router for the same operation
- duplicate persistent model storage/cache for one engine
- provider-specific business logic copied into product surfaces
- industry-specific core architecture for a generic business primitive
- untracked billable provider calls
- AI-only business logic that bypasses the real capability
- retries that can duplicate expensive/destructive side effects after uncertain status

## 8. Evolution rule

System rules protect coherence, not stagnation.

If research and measured evidence prove a better architecture:

**investigate → prototype → compare → prove → migrate deliberately**

Do not solve architectural evolution by leaving old and new systems permanently authoritative at the same time.
