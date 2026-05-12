# Coding Standards

## Core Principles

Code should be:
- readable
- modular
- predictable
- observable
- tenant-safe

Prefer:
clarity over cleverness.

---

## Route Standards

API routes should:
- stay thin
- validate input
- resolve tenant
- call services
- return standardized responses

API routes should NOT:
- contain calculations
- contain orchestration
- contain AI workflows
- contain inventory logic

---

## Service Standards

Services should:
- own orchestration
- own workflows
- remain domain-focused
- remain composable

Prefer:
small focused services.

---

## Shared Layer Standards

Shared layer owns:
- logging
- validation
- infrastructure
- tenant resolution
- framework utilities

Never place:
business logic
inside shared layer.

---

## Tenant Safety Standards

Never:
- hardcode tenant IDs
- trust frontend tenant data blindly
- bypass tenant resolution

Always:
use centralized tenant resolution.

---

## Error Handling Standards

Prefer:
centralized error handling.

Use:
withApiHandler()

Avoid:
duplicated try/catch everywhere.

---

## Validation Standards

Use:
requireFields()

Avoid:
duplicated validation logic.

---

## Logging Standards

Logging should:
- remain centralized
- include scope
- remain structured

Avoid:
random console.log chaos.

---

## Naming Standards

Use:
clear intent-based names.

Good:
- getFinanceSummary
- createCampaignFlow
- runGenerationEngine

Avoid:
- helper.js
- temp.js
- new.js
- final.js

---

## Migration Standards

Always:
refactor
→ build
→ verify
→ commit

Never:
mass refactor.

---

## Operational Safety Standards

High-risk systems:
- POS
- Kitchen
- Production
- Payroll
- Accounting

Require:
incremental migration only.