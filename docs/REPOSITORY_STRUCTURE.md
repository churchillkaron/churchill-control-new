# Repository Structure

## Purpose

The repository structure exists to:
- enforce architectural clarity
- reduce coupling
- support scalability
- support onboarding
- protect operational stability

---

## Root Structure

### app/
Application routes and UI.

Contains:
- Next.js routes
- pages
- layouts
- API routes

Rules:
- API routes stay thin
- pages should not contain backend orchestration

---

## lib/
Platform/business logic.

Contains:
- domains
- services
- shared infrastructure
- persistence layer

---

## lib/marketing/
Marketing domain.

Owns:
- AI generation
- campaigns
- publishing
- analytics
- recommendations

---

## lib/finance/
Finance domain.

Owns:
- accounting
- payroll
- payouts
- profit analytics
- revenue systems

---

## lib/operations/
Operations domain.

Owns:
- POS
- kitchen
- production
- inventory
- control systems

---

## lib/shared/
Shared infrastructure layer.

Owns:
- logging
- validation
- HTTP framework
- tenant resolution
- shared clients

Rules:
No business logic.

---

## lib/supabase/
Persistence layer.

Owns:
- DB wrappers
- storage wrappers
- queue persistence
- persistence utilities

Rules:
Persistence only.
No orchestration logic.

---

## docs/
Governance + platform documentation.

Purpose:
- preserve architecture decisions
- enforce engineering standards
- support onboarding
- prevent architectural drift

---

## Future Structure Goals

Planned:
- tests/
- workers/
- queues/
- observability/
- migrations/
- infrastructure/