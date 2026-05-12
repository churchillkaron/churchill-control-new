# Data Flow Architecture

## Core Principle

Data should flow predictably through defined layers.

Preferred flow:

Request
→ validation
→ tenant resolution
→ service orchestration
→ persistence layer
→ response

---

## API Layer

Responsibilities:
- receive requests
- validate input
- resolve tenant
- call services
- return standardized responses

Should NOT:
- contain calculations
- contain orchestration
- contain persistence logic
- contain AI workflows

---

## Service Layer

Responsibilities:
- business orchestration
- calculations
- analytics
- AI coordination
- workflow logic

Should remain:
- modular
- composable
- domain-owned

---

## Persistence Layer

Responsibilities:
- database access
- storage access
- queue persistence
- Supabase wrappers

Should NOT:
- contain business orchestration
- contain tenant logic duplication

---

## Shared Infrastructure Layer

Responsibilities:
- logging
- validation
- tenant resolution
- HTTP framework
- shared clients

Should NOT:
- contain business logic

---

## AI Data Flow

Preferred flow:

Route
→ service
→ AI orchestration
→ persistence

NOT:

Route
→ AI provider
→ DB
→ orchestration chaos

---

## Tenant Data Flow

Preferred:

Request
→ getTenantId()
→ tenant-safe service
→ tenant-safe query

Never:
- trust frontend tenant blindly
- hardcode tenant IDs
- bypass tenant validation

---

## Financial Data Flow

Financial calculations should remain:
- deterministic
- auditable
- reproducible

Critical domains:
- payroll
- payouts
- accounting
- profit analytics

---

## Operational Data Flow

High-risk operational systems:
- POS
- kitchen
- production
- inventory

Require:
- isolated workflows
- careful migrations
- operational verification

---

## Future Goals

Planned:
- event-driven architecture
- queue orchestration
- audit event streams
- background workers
- observability pipelines