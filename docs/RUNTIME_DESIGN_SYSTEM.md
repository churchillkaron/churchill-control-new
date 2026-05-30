# Avantiqo / Churchill Runtime Design System

## Core Architecture

We build one platform with three runtime entry points:

1. Platform Runtime
- For Avantiqo owner/admin.
- Purpose: manage SaaS clients, billing, subscriptions, organizations, platform health.

2. Workspace Runtime
- For owners, managers, accounting firms, and business operators.
- Purpose: run a company or client organization.
- Example: Churchill, WR Accounting, PCS, Cole Ley.

3. Staff Runtime
- For employees.
- Purpose: shifts, schedule, payslips, tasks, documents, training, AI assistant.

## Shared Visual Language

All runtimes must use:
- Dark luxury background
- Glass panels
- Rounded 32-42px cards
- Violet/cyan glow accents
- Large typography
- Strong hierarchy
- Real data first
- AI insight panels
- Domain-based navigation
- No generic admin-table feeling

## Key Rule

Do not build separate designs for each company.

Dashboards must be generated from:
- organization_type
- active_modules
- user_role
- permissions
- real database metrics
