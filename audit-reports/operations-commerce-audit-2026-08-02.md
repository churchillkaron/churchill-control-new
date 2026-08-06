# Operations Commerce Audit — 2026-08-02

## Scope

Deep architecture review of Operations, POS, restaurant service, kitchen execution, order capture, checkout, receipts and cash control.

The immediate objective is to make restaurant operations work end to end without making the platform restaurant-specific. POS must remain reusable for retail, hotel, healthcare, field service, entertainment and future industries.

## Canonical ownership decision

### Operations owns

- neutral work, queues, dispatch, work centres, handoffs and completion evidence
- point-of-sale application execution
- order capture at operational channels
- checkout orchestration and tender capture
- receipt issuance
- till, drawer, terminal and cash-session control
- fulfillment dispatch from submitted demand into queues and work centres

### Commercial owns

- customer demand and commercial orders
- catalog, products, services, prices, promotions and customer agreements

### Finance owns

- payment accounting
- tax policy and effective tax rules
- cash and clearing accounts
- journals, ledgers, reconciliation and financial reporting

### Supply Chain owns

- item availability
- inventory movements
- consumption, production usage and cost layers

### Industry applications own

- industry terminology and workflow adapters
- restaurant tables, seats, waiter service, courses and kitchen presentation
- hotel rooms and folios
- retail baskets and pickup
- healthcare encounters and charge contexts
- service jobs, visits and equipment contexts

Industry applications may consume Operations primitives but must not redefine the Operations core.

## Confirmed strengths

- The existing `OperationsRuntime` already models neutral operational primitives.
- POS order creation uses an atomic database transaction.
- POS settlement requires idempotency and supports retry-safe duplicate resolution.
- Selected-item settlement has allocation integrity checks.
- Kitchen dispatch was previously converged toward single idempotent dispatch.
- Tax and service-charge values are resolved from organization policy rather than jurisdiction constants.
- Organization access is enforced on the audited active POS and restaurant endpoints.

## Critical findings

### 1. Universal POS shell embedded restaurant behavior

The POS workspace directly imported waiter, table-oriented checkout and restaurant order components. Generic organizations could therefore receive restaurant behavior by default.

**Repair in this branch:** POS modes are now resolved through a configurable application profile. Restaurant components are bound only by the restaurant profile. An unconfigured organization no longer silently falls back to restaurant tables.

### 2. Operations capability catalog omitted commerce execution

The canonical Operations runtime covered work execution but did not formally register POS, order capture, checkout, receipts, cash control or fulfillment dispatch.

**Repair in this branch:** a neutral commerce capability catalog is merged into the canonical Operations runtime.

### 3. POS runtime endpoint is restaurant-shaped

`/api/pos/runtime` directly queries `restaurant_zones`, `restaurant_tables` and `dishes`. This endpoint is therefore not a universal POS runtime despite its name.

**Required next convergence:** split it into a neutral POS runtime resolver and registered application adapters. The restaurant adapter may continue using current tables during migration.

### 4. Checkout is table-shaped

The payment-state and settlement contracts use `tableNumber` as the primary payable context. This prevents clean reuse for retail baskets, hotel folios, service jobs or other order groups.

**Required next convergence:** introduce a neutral payable-context contract:

- `context_type`
- `context_id`
- `order_ids`
- optional industry metadata

The restaurant adapter will translate the legacy table context during compatibility migration.

### 5. Order creation requires seats

The atomic POS order route requires a table and a valid seat for every item. Those are restaurant rules, not universal order-capture rules.

**Required next convergence:** move seat and table validation into the restaurant adapter. The neutral order contract should require an order context only when the selected application declares one.

### 6. Kitchen display bypasses neutral work-centre execution

The kitchen UI reads restaurant tickets directly through `/api/restaurant/operations` even though canonical work-centre capabilities exist.

**Required next convergence:** represent kitchen as a restaurant production application over neutral queue entries, work centres, assignments, handoffs and completion evidence. Kitchen names remain presentation metadata, not Operations core concepts.

### 7. ERP registry exposes industry screens inside universal Operations

The Operations workspace currently lists Waiter, Table Management and Kitchen Operations as universal groups.

**Required next convergence:** universal Operations navigation should expose POS, Orders, Checkout, Receipts, Cash Control, Work Centres, Queues and Dispatch. Restaurant Tables, Service and Kitchen must be contributed by the restaurant solution/application registry.

## Capability model added in this branch

- `point-of-sale`
- `order-capture`
- `checkout`
- `receipts`
- `cash-control`
- `fulfillment-dispatch`

Each capability declares cross-domain dependencies and ownership boundaries.

## POS application model added in this branch

Universal modes:

- Sell
- Checkout
- Orders
- Receipts
- Cash Control

Restaurant application contribution:

- restaurant order-capture implementation
- restaurant checkout implementation
- restaurant orders implementation
- restaurant receipt implementation
- restaurant cash-control implementation
- additional Service mode for waiter/tableside execution
- service-location context with temporary legacy `table` compatibility

Supported configured restaurant classifications currently include restaurant, restaurant bar, bar restaurant, food and beverage, café and bar.

## Priority continuation plan

### Wave 2 — neutral API facade

1. Add application resolver using organization configuration.
2. Add neutral POS runtime endpoint.
3. Add neutral orders endpoint.
4. Add neutral checkout state and settlement endpoints.
5. Preserve current restaurant services as adapter implementations.

### Wave 3 — neutral order context

1. Replace mandatory table and seat fields in the universal contract.
2. Introduce configurable context schemas.
3. Keep restaurant table/seat validation in the restaurant adapter.
4. Add explicit retail and service application fixtures to prove neutrality.

### Wave 4 — kitchen/work-centre convergence

1. Map restaurant production stations to Operations work centres.
2. Map tickets to queue entries and work items.
3. Map Expo to handoff and completion-evidence flows.
4. Remove direct restaurant-table dependencies from the neutral execution runtime.

### Wave 5 — registry and UI convergence

1. Move restaurant navigation contributions into the restaurant solution registry.
2. Keep universal Operations navigation industry-neutral.
3. Add capability-aware top actions, row actions and application configuration.
4. Validate every route from domain to workspace to capability to document.

## Validation status

This branch is source-only. No database migration has been added. Existing restaurant database functions and runtime behavior are preserved. Full build and end-to-end smoke validation remain required because the connected environment does not provide a local checkout or dependency runtime.
