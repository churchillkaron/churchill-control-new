# Architecture Review Process

## Purpose

Prevent:
- architectural drift
- domain chaos
- unsafe migrations
- scaling problems
- operational instability

All major architectural changes should be evaluated before adoption.

---

## Review Questions

Before introducing new code ask:

### Domain Ownership
- Which domain owns this?
- Should this live in shared?
- Is this cross-domain leakage?

---

### Service Boundaries
- Does this belong in a route?
- Does this belong in a service?
- Does this belong in persistence?

---

### Tenant Safety
- Is tenant resolution centralized?
- Is tenant filtering enforced?
- Is this multi-tenant safe?

---

### Operational Safety
Could this impact:
- POS
- payroll
- accounting
- production
- inventory
- kitchen

If yes:
extra caution required.

---

### Infrastructure Consistency
Does this:
- reuse shared utilities?
- bypass infrastructure standards?
- duplicate validation/logging/tenant logic?

---

### Scalability
Will this:
- scale across tenants?
- remain observable?
- remain replaceable?
- remain maintainable?

---

## Migration Review Rules

Prefer:
incremental architecture evolution.

Avoid:
large unverified rewrites.

Every migration should:
refactor
→ build
→ verify
→ commit

---

## AI Architecture Review

AI systems must:
- remain modular
- remain observable
- remain replaceable

AI should not:
- bypass operational controls
- bypass approval systems
- own financial truth

---

## Shared Layer Review

Shared layer should only contain:
- infrastructure
- utilities
- framework logic

Never:
business workflows.

---

## Future Goals

Planned:
- formal ADR process
- architecture scoring
- migration tracking
- automated linting/governance checks