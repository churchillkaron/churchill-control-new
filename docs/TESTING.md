# Testing Strategy

## Current Strategy

Current workflow:
- incremental migrations
- local builds
- manual verification
- operational testing

---

## Core Rule

Every migration must:
refactor
→ build
→ verify
→ commit

---

## Critical System Testing

Always manually verify:
- POS
- Kitchen
- Orders
- Production
- Payroll
- Accounting
- Marketing generation
- Queue systems

---

## Multi-Tenant Testing

Critical checks:
- tenant isolation
- tenant-safe queries
- tenant-safe APIs
- tenant resolution behavior

---

## Financial Testing

Critical calculations:
- revenue
- cost
- payroll
- payouts
- accounting summaries

Must remain:
- deterministic
- reproducible
- auditable

---

## AI Testing

Verify:
- generation flows
- recommendation flows
- provider failures
- queue processing
- campaign persistence

---

## Future Goals

Planned:
- unit tests
- integration tests
- API tests
- operational smoke tests
- tenant isolation tests
- queue tests
- financial verification tests

---

## Operational Safety

High-risk domains require extra caution:
- POS
- Production
- Inventory
- Payroll
- Accounting

Rules:
- isolated migrations
- one route at a time
- verify before deployment

---

## Build Rules

Never commit:
- failing builds
- unresolved architecture migrations
- partially migrated systems