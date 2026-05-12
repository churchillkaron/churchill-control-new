# Anti-Patterns

## BAD: Massive API Routes

Avoid:
- DB logic in routes
- Calculations in routes
- AI orchestration in routes
- Inventory logic in routes

Reason:
Routes should orchestrate only.

---

## BAD: Hardcoded Tenant IDs

Avoid:
const tenant_id = "..."

Use:
getTenantId(request)

Reason:
Hardcoded tenant IDs break multi-tenant architecture.

---

## BAD: Direct createClient Everywhere

Avoid:
createClient(...) inside random files.

Use:
shared Supabase infrastructure.

Reason:
Prevents auth inconsistency and infrastructure chaos.

---

## BAD: Cross-Domain Leakage

Avoid:
Finance logic inside marketing domain.
Marketing logic inside operations domain.

Reason:
Creates coupling and maintenance complexity.

---

## BAD: Shared Layer Business Logic

Avoid:
Business logic inside lib/shared/*

Reason:
Shared layer should remain infrastructure-only.

---

## BAD: Duplicate Validation

Avoid:
Repeated validation everywhere.

Use:
requireFields()

Reason:
Prevents API drift.

---

## BAD: Mass Refactors

Avoid:
Huge architecture rewrites.

Use:
Incremental migration.

Reason:
Protects operational stability.

---

## BAD: Root-Level Random Files

Avoid:
lib/helper.js
lib/temp.js
lib/final.js

Reason:
Creates architecture entropy.

---

## BAD: Skipping Build Verification

Rule:
Every migration must:
refactor
→ build
→ verify
→ commit

Reason:
Protects platform stability.