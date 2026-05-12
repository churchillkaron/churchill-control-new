# ADR-001 — Churchill SaaS Platform Architecture

## Status
Accepted

---

## Context

The Churchill platform evolved from rapid feature delivery into a growing multi-tenant SaaS platform.

Problems identified:
- Massive API routes
- Mixed infrastructure/business logic
- Hardcoded tenant IDs
- Repeated validation
- Direct Supabase usage everywhere
- Weak domain boundaries

A standardized architecture was needed to support:
- scalability
- maintainability
- multi-tenant safety
- AI orchestration
- operational stability

---

## Decision

The platform adopts:

### Thin API Architecture
Routes only handle:
- validation
- tenant resolution
- service orchestration
- standardized responses

### Service Layer
Business logic moves into:
lib/{domain}/services/*

### Shared Infrastructure Layer
Shared platform utilities live in:
lib/shared/*

### Persistence Layer
Database/storage wrappers live in:
lib/supabase/*

### Domain Ownership
Domains own their own business logic:
- marketing
- finance
- operations

---

## Consequences

Benefits:
- scalable architecture
- easier onboarding
- reduced duplication
- safer migrations
- cleaner multi-tenant design
- easier AI integration

Tradeoffs:
- more structure
- more files
- stricter engineering discipline

---

## Rules

- No mass refactors
- Build before commit
- One migration at a time
- Shared layer contains no business logic
- Routes stay thin