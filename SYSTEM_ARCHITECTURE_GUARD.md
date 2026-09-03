# Avantiqo Architecture Guard

**Status: living compatibility and coherence guard**

This document protects architectural coherence. It is subordinate to [`ARCHITECTURE.md`](./ARCHITECTURE.md) and must be interpreted using [`docs/README.md`](./docs/README.md).

## Core principles

- One source of truth per business concept.
- One canonical domain/workspace/capability topology through `ERP_REGISTRY`.
- One canonical production execution path per capability unless an explicit migration or evidence-backed requirement justifies temporary coexistence.
- Shared business behavior belongs in shared governed runtimes rather than duplicated route/customer/industry implementations.
- Organization/entity/party is the canonical business model; do not create a parallel tenant architecture.
- Delivery surfaces such as routes, pages, navigation builders, or industry solutions do not define a second platform taxonomy.

## Canonical platform contract

**PLATFORM → USER → BUSINESS CONTEXT → UBTE → ERP_REGISTRY → DOMAIN → WORKSPACE → CAPABILITY → DOCUMENT / ACTION / PROCESS**

Current implementation on newest `main` is the authority for exact symbols and file paths. The architecture contract defines the direction and invariants those symbols must implement.

## Guarded anti-patterns

Treat these as architecture defects unless an explicit migration/evidence-backed exception exists:

- duplicate capability registries
- duplicate execution routers for the same capability
- duplicate provider/runtime paths for the same production operation
- duplicate persistent model stores without a demonstrated requirement
- route-specific copies of domain business logic
- industry-specific core engines when generic primitives solve the same business problem
- independent AI-only business logic that bypasses the real capability
- navigation/domain taxonomies that compete with `ERP_REGISTRY`
- blind retries of expensive/destructive operations after ambiguous execution state
- frontend state treated as canonical business truth

## Historical forbidden-name lists

Older versions of this file listed exact symbols such as `safeNav`, `normalizeNavForUI`, `syncWorkspaceNav`, `buildPlatformNav`, `getWorkspaceNavigation`, `domainEngine`, `bootstrapDomains`, `SYSTEM_REGISTRY`, and `DOMAIN_REGISTRY` as universally forbidden or immutable.

That approach is obsolete: architecture should guard **contracts and duplication**, not fossilize historical symbol names forever.

A historical symbol may still exist temporarily for compatibility or migration. Judge it by whether it violates current architecture, creates a second source of truth, or duplicates a canonical runtime.

## Violation handling

Do not automatically delete a suspicious system merely because its name matches an old blacklist. First determine:

1. What business/runtime contract it currently serves.
2. Whether a canonical replacement already exists.
3. Whether callers/data still depend on it.
4. Whether coexistence is an intentional migration state.
5. How to remove or converge it without losing data, behavior, or evidence.

Then migrate deliberately and certify the resulting canonical path.

## Architecture goal

A coherent intelligent business operating platform with reusable primitives, governed capabilities, minimal duplication, deterministic verification, safe AI/autonomous execution, low latency, efficient cost, and clear evidence of correctness.
