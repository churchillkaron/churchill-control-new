# Database Governance

## Core Principles

Database design must support:
- tenant isolation
- operational stability
- auditability
- scalability
- deterministic financial calculations

---

## Multi-Tenant Rules

All operational tables should contain:
tenant_id

Examples:
- orders
- payroll
- campaigns
- inventory
- production
- payouts

Never rely on frontend-only tenant protection.

---

## RLS Goals

Future requirement:
Row Level Security on all tenant tables.

Rules:
- tenant-safe queries
- tenant-safe APIs
- tenant-safe services

---

## Financial Integrity

Financial tables must remain:
- deterministic
- reproducible
- auditable

Critical domains:
- payroll
- payouts
- revenue
- accounting
- cost tracking

---

## Naming Standards

Prefer:
snake_case

Examples:
tenant_id
created_at
updated_at

---

## Migration Rules

Never:
- mass alter operational tables
- combine schema rewrites with feature launches
- change critical financial structures without verification

Always:
- incremental migrations
- backup awareness
- verification after schema changes

---

## AI Data Governance

AI-related tables should remain separated from:
- financial source-of-truth
- operational source-of-truth

AI should consume data,
not own critical operational state.

---

## Auditability Goals

Future audit targets:
- inventory changes
- payroll approvals
- payout changes
- AI publishing actions
- operational overrides

---

## Future Database Goals

Planned:
- migration tracking
- schema versioning
- tenant-safe RLS
- audit trails
- event history
- soft delete standards
- operational snapshots