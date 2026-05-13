# Database Rules

# Core Philosophy

Database is:
system state infrastructure

NOT:
temporary UI storage.

Every table must represent:
- operational state
- audit state
- workflow state
- historical state

---

# Multi-Tenant Rule

ALL business tables require:

tenant_id

Examples:
- orders
- inventory
- invoices
- campaigns
- payroll
- events
- performance
- history

Never create operational tables without tenant_id.

---

# Auditability Rule

Important workflows must be traceable.

Use:
- created_at
- updated_at
- approved_by
- rejected_by
- status
- action_logs

---

# State-Driven Design

Tables should model:
state transitions

Examples:
- pending
- approved_manager
- approved_accounting
- rejected
- completed
- failed
- queued
- publishing
- published

---

# Queue Architecture

Heavy processes should use queue tables.

Examples:
- campaign_publish_queue
- generation_jobs
- payroll_jobs
- report_jobs

Required fields:
- status
- retries
- last_error
- started_at
- completed_at

---

# Financial Integrity

Never overwrite:
- payouts
- payroll
- invoices
- history
- financial calculations

Use:
append-only historical tracking when possible.

---

# Inventory Integrity

Inventory changes must be traceable.

Required:
- ingredient_movements
- production_logs
- waste_logs

Never directly mutate stock without logging movement.

---

# AI Memory Rules

AI memory must be:
- tenant-aware
- historical
- score-based
- queryable

Never store AI memory only in prompts.

---

# Future Required Infrastructure

Planned:
- audit_logs
- system_events
- queue_workers
- notifications
- tenant_settings
- role_permissions
- activity_stream

---

# Schema Governance

Before creating new tables:
1. Identify domain
2. Identify state flow
3. Identify ownership
4. Identify audit requirements
5. Identify async needs
6. Identify tenant requirements

Never create random tables ad hoc.