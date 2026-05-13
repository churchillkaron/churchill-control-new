# Churchill Platform Architecture

## Vision
Restaurant Operating System + AI Business Operating Platform

Core philosophy:
- accountability
- operational control
- performance-to-money
- approval flows
- AI-assisted operations
- tenant-aware SaaS architecture

---

# Core Domains

## POS
Sales execution only.

Responsibilities:
- orders
- tables
- kitchen dispatch
- payments
- receipts

Never handles:
- inventory deduction
- production cost
- payroll
- accounting

---

## Production
Production + recipe + cost engine.

Responsibilities:
- recipe execution
- inventory deduction
- cost calculations
- waste calculations
- production logs

Triggered by:
ORDER_COMPLETED events.

---

## Inventory
Stock state system.

Responsibilities:
- ingredient quantities
- stock alerts
- low stock
- movement logs
- supplier tracking

---

## Finance
Financial intelligence system.

Responsibilities:
- revenue
- expenses
- COGS
- profit/loss
- accounting analytics
- audit tracking

---

## Payroll
Staff payout engine.

Responsibilities:
- salary
- attendance
- lateness
- service charge
- bonuses
- deductions
- payout approvals

---

## Marketing AI
AI marketing operating system.

Responsibilities:
- campaign generation
- AI recommendations
- publishing queue
- learning memory
- engagement analysis
- Meta publishing

---

# Shared Infrastructure

Location:
lib/shared/

Contains:
- supabase
- tenant
- validation
- http
- auth (future)

Rules:
- no duplicate infrastructure
- no random createClient
- centralized governance

---

# Supabase Governance

Allowed:
- shared/supabase/client.js
- shared/supabase/admin.js
- shared/supabase/server.js

Forbidden:
- random createClient usage

---

# Tenant Architecture

All tenant access:
getTenantId()

Never:
hardcoded tenant IDs

Future:
session/auth-driven tenant resolution

---

# API Philosophy

app/api/*
=
thin orchestration layer only

Business logic belongs in:
lib/**/services/*

---

# Queue Philosophy

Universal async architecture.

Examples:
- AI generation
- publishing
- OCR
- payroll generation
- report generation
- production processing

---

# Operational Philosophy

POS ≠ Production ≠ Inventory ≠ Finance ≠ Payroll

Connected systems.
Not merged systems.

---

# Development Rules

- full file replacements only
- one controlled change at a time
- fix root cause only
- no architecture drift
- stabilize before expanding
- verify flows after changes
