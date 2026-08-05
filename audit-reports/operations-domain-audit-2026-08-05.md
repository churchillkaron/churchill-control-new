# Avantiqo Operations Domain Forensic Audit

Date: 2026-08-05  
Repository: `churchillkaron/churchill-control-new`  
Branch: `agent/operations-domain-convergence`

## Executive conclusion

The Operations domain has a strong industry-neutral functional model and does not require another architecture. Its base catalogue covers work intake and execution, planning and scheduling, orchestration, operational resources, controlled execution, resilience, quality, performance, intelligence, and universal commerce execution.

The audit did, however, identify a release-blocking catalogue convergence defect. Six commerce capabilities were included in the canonical catalogue and workspace registry but excluded from the handler, repository, API, readiness, and lifecycle layers. This made them visible without making them executable through the canonical Operations runtime.

The branch repairs that defect and adds a release gate that fails when catalogue declarations drift from execution layers.

## Canonical capability model

The domain contains two intentionally separate catalogues that are merged into one canonical Operations catalogue:

1. Industry-neutral operational primitives, including work requests, work orders, work items, runs, plans, schedules, queues, dispatch, assignments, handoffs, work centres, resources, procedures, checklists, approvals, incidents, corrective actions, quality controls, service levels, KPIs, monitoring, alerts, forecasting, timeline, audit trail, and command centre.
2. Universal commerce execution primitives: point of sale, order capture, checkout, receipts, cash control, and fulfillment dispatch.

Restaurant, retail, warehouse, field service, hospitality, clinic, salon, construction, and similar business experiences must be adapters and application profiles over these primitives. They must not become core Operations capability IDs, generic database columns, or generic lifecycle rules.

## Critical defects found and repaired

### 1. Canonical catalogue drift

**Before**

`CanonicalOperationsCapabilityCatalog` merged base and commerce capabilities, while handlers, repositories, API lookup, and readiness used only the base catalogue.

**Impact**

- Commerce workspaces appeared active.
- Generic API lookup could return `Unknown Operations capability`.
- Runtime execution could return `No handler registered`.
- No canonical repository existed for the six commerce capability IDs.
- Readiness counts excluded commerce and could report healthy despite missing execution bindings.

**Repair**

Handlers, repositories, repository validation, API capability resolution, and readiness now consume `CANONICAL_OPERATIONS_CAPABILITY_CATALOG`.

### 2. Missing commerce lifecycle

**Before**

Commerce capabilities declared `lifecycle: "commerce"`, but JavaScript and PostgreSQL lifecycle policies did not define that lifecycle. Unknown lifecycle names silently fell back to master-data rules.

**Impact**

Checkout allocation/authorization/capture/refund, receipt delivery, cash counting/reconciliation/closure, and fulfillment hold/release/redispatch were invalid or misclassified.

**Repair**

A governed commerce lifecycle now covers application activation, order submission, checkout, receipt, cash-control, and fulfillment transitions.

### 3. Create-command disagreement

**Before**

The workspace registry treated `prepare`, `issue`, `open`, and `dispatch` as create commands, while handlers and the atomic database executor recognized only `create`, `record`, `report`, `raise`, and `set`.

**Impact**

The UI could present a valid primary action that the persistence layer treated as an update requiring an existing record ID.

**Repair**

The command family is centralized in the lifecycle policy and aligned with the database function. Command-aware initial states are used:

- `configure` → `inactive`
- `prepare` → `prepared`
- `issue` → `issued`
- `open` → `open`
- `dispatch` → `dispatched`

### 4. Static audits could pass a false-positive release

**Before**

The existing release audit verified that files and contract strings existed but did not compare the canonical catalogue with the execution layers.

**Repair**

`operations-capability-integrity-audit.mjs` now verifies:

- base and commerce catalogue counts;
- canonical catalogue composition;
- canonical catalogue use by handlers, repositories, API, and readiness;
- commerce lifecycle and database convergence;
- build-gate integration;
- absence of tenant scope;
- absence of industry terminology in the generic runtime, API, repository, form, and command-schema core.

## Industry-hardcoding assessment

### Generic Operations core

The generic catalogue, runtime, API, persistence, forms, command schemas, security, workspace registry, event outbox, and readiness model are industry-neutral.

Neutral ownership boundaries are explicit:

- People owns employees, qualifications, rosters, leave, attendance, and payroll time.
- Supply Chain owns inventory availability and physical stock state.
- Commercial owns catalogue, pricing, customers, and commercial order authority.
- Finance owns payment methods, tax configuration, accounting, journals, ledgers, and cash accounts.
- Administration owns organization, legal-entity, location, and device masters.
- Operations owns execution state, queues, work centres, dispatch, evidence, incidents, quality execution, service performance, and operational events.

### Industry adapters

Restaurant and retail names remain in adapter/application-profile files and dedicated industry routes. This is acceptable isolation: they translate business-specific language and workflows into neutral Operations contracts.

The central POS application registry is still code-registered. That is not core-domain hardcoding, but it is an extensibility limitation. A future plugin/provider registration mechanism should allow new application adapters to register without editing the central file.

## End-to-end status

### Canonical Operations runtime

The repaired branch aligns:

`ERP registry → Operations workspace registry → canonical capability → authorization → API → runtime → handler → scoped repository → atomic RPC → lifecycle guard → operations_records → command ledger → transactional event outbox`

### Universal POS

The universal POS shell is correctly separated from industry adapters. Restaurant is the active reference adapter. Retail remains explicitly marked `partially_ready` in the existing application profile because refunds, provider-authorized tenders, receipt rendering, and fulfillment consumption are not all complete. The audit does not relabel those transitions as production-ready.

This means the Operations architecture is converged, but the retail application adapter still requires its own completion work before it can honestly be called fully end-to-end.

## Capability completeness judgement

No major missing category was found in the neutral Operations domain. The catalogue already covers the functional breadth expected of a general operational execution platform. New industries should normally add:

- configuration data;
- work classifications;
- work-centre types;
- queues and routing policies;
- procedures and checklist templates;
- application adapters and presentation labels;

They should not add new industry-named core capabilities unless a genuinely universal operational primitive is missing.

## Files changed

- `lib/operations/runtime/CanonicalOperationsHandlers.js`
- `lib/operations/runtime/OperationsLifecyclePolicy.js`
- `lib/operations/repositories/CanonicalOperationsRepositories.js`
- `lib/operations/repositories/OperationsRepositoryRegistry.js`
- `lib/operations/api/OperationsApiController.js`
- `lib/operations/readiness/OperationsReadinessService.js`
- `supabase/migrations/20260805093000_operations_canonical_capability_convergence.sql`
- `scripts/operations-capability-integrity-audit.mjs`
- `package.json`

## Release conditions

Before merging to production:

1. Rebase or merge the latest `main` because concurrent commits landed during this audit.
2. Run `npm run audit:operations-capabilities`.
3. Run the full Operations audit suite.
4. Run `npm run build`.
5. Apply the new Supabase migration in the target environment.
6. Execute authenticated smoke tests for at least one neutral work capability and each universal commerce lifecycle family.
7. Keep retail marked partially ready until its adapter-specific blocked transitions are completed and tested.
