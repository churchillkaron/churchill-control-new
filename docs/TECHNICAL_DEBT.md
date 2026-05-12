# Technical Debt

## Purpose

Track:
- temporary architecture compromises
- incomplete migrations
- known weak areas
- future cleanup requirements

Technical debt should be:
- visible
- intentional
- prioritized

Never hidden.

---

## Current Debt

### Tenant Resolver Dev Fallback

Location:
lib/shared/tenant/getTenantId.js

Current behavior:
Fallback tenant ID used during development.

Reason:
Auth + tenant cookie flow not fully standardized yet.

Future fix:
- remove fallback
- require authenticated tenant context
- enforce tenant-safe auth flow

Priority:
HIGH

---

## Hardcoded Tenant IDs

Still exists in:
- operations routes
- production routes
- control routes
- finance routes
- analytics routes

Future fix:
Gradual migration to:
getTenantId(request)

Priority:
HIGH

---

## Thin Route Migration

Some routes still contain:
- DB logic
- calculations
- orchestration

Future fix:
Move logic into services.

Priority:
MEDIUM

---

## Direct createClient Usage

Still exists in multiple routes/services.

Future fix:
Shared infrastructure adoption.

Priority:
MEDIUM

---

## Operational System Risk

High-risk domains:
- POS
- Kitchen
- Production
- Orders
- Control

Need:
- careful incremental migration
- operational verification

Priority:
CRITICAL

---

## Future Cleanup Goals

Planned:
- auth standardization
- RLS enforcement
- queue standardization
- observability expansion
- audit logging
- service extraction completion
- operational testing expansion

---

## Rules

Technical debt must:
- be documented
- be intentional
- have migration plans

Avoid:
hidden architecture debt.