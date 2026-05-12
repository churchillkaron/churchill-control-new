# Platform Principles

## 1. Operational Stability First

Churchill powers real restaurant operations.

Protect:
- revenue
- payroll
- inventory
- production
- accounting
- operational continuity

Prefer:
stable incremental evolution

over:
risky rewrites.

---

## 2. Multi-Tenant By Design

Churchill is a multi-tenant SaaS platform.

All systems should remain:
- tenant-safe
- tenant-aware
- tenant-isolated

Never:
- hardcode tenant IDs
- bypass tenant resolution
- trust frontend tenant data blindly

---

## 3. Thin APIs

API routes should remain:
- predictable
- small
- observable
- orchestration-only

Routes should:
- validate
- resolve tenant
- call services
- return responses

---

## 4. Services Own Business Logic

Business workflows belong in services.

Services should:
- remain composable
- remain domain-owned
- remain testable

---

## 5. Shared Infrastructure Only

Shared layer exists for:
- logging
- validation
- tenant resolution
- framework utilities
- shared infrastructure

Never:
place business logic in shared.

---

## 6. Incremental Migration

Prefer:
small safe migrations.

Avoid:
massive refactors.

Workflow:
refactor
→ build
→ verify
→ commit

---

## 7. AI Assists, Humans Control

AI should:
- recommend
- optimize
- analyze
- predict

AI should NOT:
- bypass approvals
- own financial truth
- override operational controls

---

## 8. Domains Own Their Systems

Marketing owns marketing.
Finance owns finance.
Operations owns operations.

Avoid:
cross-domain chaos.

---

## 9. Observability Matters

Systems should remain:
- debuggable
- observable
- auditable

Hidden complexity becomes operational risk.

---

## 10. Architecture Is Product Strategy

Architecture decisions directly affect:
- scalability
- operational stability
- AI capability
- tenant safety
- business growth

Architecture is not cleanup.
Architecture is platform strategy.