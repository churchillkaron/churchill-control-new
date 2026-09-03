# AVANTIQO SYSTEM MAP

This document is the repository-level map of Avantiqo's canonical technical architecture.

It describes the platform as it exists and evolves on `main`. It must not be replaced by an industry-specific route list, legacy Churchill application structure, or historical UI navigation.

## CANONICAL PLATFORM FLOW

`PLATFORM -> USER -> BUSINESS CONTEXT -> UBTE -> ERP_REGISTRY -> DOMAIN -> WORKSPACE -> CAPABILITY -> DOCUMENT`

This flow is an architectural invariant.

### 1. PLATFORM

Avantiqo is one generic multi-industry business operating platform. Product behavior must be expressed through reusable business primitives rather than hardcoded restaurant, hotel, retail, construction, accounting, agency, or other industry roots.

### 2. USER

The authenticated actor. Identity and authorization determine which business contexts and capabilities may be accessed; a user is not itself the business context.

### 3. BUSINESS CONTEXT

Business context resolves the active:

- `organization_id`
- `entity_id` where applicable
- `period_id` where applicable
- party relationships where applicable

`tenant` is not an Avantiqo business-context primitive and must not be introduced as an alternative architecture.

### 4. UBTE

UBTE is the shared business transaction/execution boundary through which reusable business behavior is coordinated. Domain implementations should converge on shared governed execution rather than inventing parallel industry runtimes.

### 5. ERP_REGISTRY

`ERP_REGISTRY` is the canonical runtime topology for domains, workspaces, and capabilities.

Routes, menus, pages, historical folders, and industry-specific experiences do not redefine the platform taxonomy. They are delivery surfaces over registry-backed business capabilities.

### 6. DOMAIN

Canonical Avantiqo domains are:

- Dashboard
- Finance
- Operations
- Supply Chain
- Commercial
- People
- Projects
- Documents
- Analytics
- AI
- Solutions
- Administration
- Compliance
- Creative

A new top-level domain requires an intentional platform architecture change. It must not emerge accidentally from a route, feature folder, customer implementation, or industry name.

### 7. WORKSPACE

A workspace is a domain-owned operating surface that groups related business work. Workspaces are registry-driven and should remain reusable across industries wherever the underlying business problem is the same.

### 8. CAPABILITY

A capability is the executable/readable unit of business behavior. Capabilities should use neutral business primitives and governed shared runtimes instead of duplicating behavior for individual industries or screens.

### 9. DOCUMENT

Documents are governed business outputs and records produced, consumed, or referenced by capabilities. Document behavior must inherit business context, authorization, evidence, and lifecycle rules from the capability/runtime that owns it.

## INDUSTRY COMPOSITION RULE

Industries are compositions and configurations of generic Avantiqo capabilities, not competing architectures.

Examples:

- A restaurant POS experience composes Commercial, Operations, Finance, Supply Chain, People, and related capabilities.
- A kitchen experience is an Operations workflow, not a top-level `/kitchen` architecture.
- Marketing work belongs to the appropriate Commercial/Creative/Analytics capabilities rather than defining a separate platform root merely because a `/marketing` route exists.
- Staff experiences compose People plus the capabilities required for the job; `/staff` is not a canonical domain.

The same principle applies to every industry Avantiqo supports.

## LEGACY ROUTE STATUS

Historical routes such as `/kitchen`, `/pos`, `/marketing`, `/staff`, `/accounting`, or other customer/application-specific paths may still exist while the product converges. Their presence is an implementation or compatibility fact only.

They must not be used as evidence for a second domain taxonomy, second service architecture, or second source of technical truth.

When touched, legacy surfaces should converge toward the canonical registry/context/runtime architecture rather than expanding their own parallel structure.

## TECHNICAL AUTHORITY

For architecture and implementation decisions, use this authority order:

1. Current `main` implementation and its enforced contracts.
2. Permanent Avantiqo architecture/engineering rules that govern `main`.
3. `ERP_REGISTRY` for runtime domain/workspace/capability topology.
4. Current generated/navigation/delivery surfaces that implement those contracts.

A stale document, route name, historical Churchill module, customer-specific screen, or old folder taxonomy may not redefine the platform.

If implementation and an architectural rule disagree, treat that as a coherence defect to be resolved explicitly rather than silently maintaining both descriptions.

## COHERENCE INVARIANTS

Every platform change must preserve these invariants:

- One canonical platform flow: `PLATFORM -> USER -> BUSINESS CONTEXT -> UBTE -> ERP_REGISTRY -> DOMAIN -> WORKSPACE -> CAPABILITY -> DOCUMENT`.
- One generic multi-industry domain taxonomy.
- `organization`, `entity`, and `party` are the business identity/context primitives; no `tenant` architecture.
- `ERP_REGISTRY` owns domain/workspace/capability topology.
- Industry terminology may shape configured experiences but may not create parallel core architecture.
- Shared business behavior belongs in shared governed runtimes, not duplicated route-specific implementations.
- Pages do not become sources of business truth merely because they render a workflow.
- No duplicate canonical APIs or execution paths for the same capability without an explicit migration/compatibility contract.
- Architecture documentation must describe current Avantiqo, not a historical Churchill-only application.

## ENGINEERING PRINCIPLES

- One source of truth per business concept.
- No duplicate routes or APIs that represent the same canonical capability without an explicit compatibility reason.
- Business orchestration belongs in governed service/runtime layers, not ad hoc page code.
- Business logic belongs in reusable capability/runtime primitives.
- Shared utilities remain genuinely shared; do not turn `shared` into an unowned dumping ground.
- Prefer deterministic enforcement and certification of architecture rules over documentation-only convention.
- When standard practice creates unnecessary steps, latency, cost, fragility, or user effort, research and prove a better design rather than copying convention by default.

## CHANGE RULE

Before adding a new route family, domain, engine, service boundary, workflow primitive, or industry-specific runtime, answer:

1. Which canonical domain/workspace/capability owns this business problem?
2. Can an existing generic primitive solve it?
3. Would the change create a second source of truth or duplicate execution path?
4. Is an industry-specific concept being mistaken for a platform primitive?
5. Is there a measurably simpler, faster, safer, or more reusable solution?

If the proposed change conflicts with the canonical flow or creates a competing taxonomy, change the proposal rather than weakening the architecture.