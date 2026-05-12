# Developer Onboarding

## First Read Order

New developers should read:

1. PRODUCT_VISION.md
2. ARCHITECTURE.md
3. DOMAIN_OWNERSHIP.md
4. ENGINEERING_WORKFLOW.md
5. ANTI_PATTERNS.md
6. SECURITY.md
7. OPERATIONAL_SAFETY.md

---

## Core Philosophy

Churchill is:
- a Restaurant Operating System
- an AI Intelligence Platform
- a multi-tenant SaaS architecture

Not just:
- a POS
- a dashboard
- a marketing tool

---

## Architecture Overview

Main layers:

API Layer
→ thin routes only

Service Layer
→ orchestration/business logic

Domain Layer
→ domain engines/logic

Shared Layer
→ infrastructure/framework/utilities

Persistence Layer
→ database/storage wrappers

---

## Domains

### Marketing
AI generation, campaigns, publishing, analytics

### Finance
Revenue, payroll, payouts, accounting

### Operations
POS, kitchen, production, inventory, control

### Shared
Validation, logging, HTTP framework, tenant resolution

---

## Critical Rules

Never:
- mass refactor
- hardcode tenant IDs
- place business logic in routes
- bypass shared infrastructure
- skip builds before commit

Always:
refactor
→ build
→ verify
→ commit

---

## High-Risk Systems

Require extra caution:
- POS
- Kitchen
- Production
- Payroll
- Accounting
- Inventory

---

## Migration Philosophy

Prefer:
incremental architecture evolution

over:
massive rewrites.

---

## Current Platform Stage

Current focus:
- architecture stabilization
- tenant standardization
- service extraction
- operational safety
- AI orchestration foundation

---

## Long-Term Goal

Build:
an intelligent hospitality operating system
capable of scaling across multiple venues,
teams, and operational domains.