# Churchill ERP Domain Ownership Audit

## Goal

Every business capability must have:

- ONE owner domain
- ONE source of truth
- ONE canonical flow
- NO duplicate architecture
- NO fake routes
- NO legacy routes connected to production

---

## Domain Decisions

| Current Domain | Decision | Owner Domain | Status | Notes |
|---|---|---|---|---|
| finance | KEEP | Finance | Active | Canonical financial engine |
| accounting | REVIEW | Finance | Suspect duplicate | Likely merge into Finance |
| payroll | KEEP | Payroll | Active | Canonical payroll domain |
| salary | REVIEW | Payroll | Suspect duplicate | Likely merge into Payroll |
| approval | REVIEW | Governance | Duplicate candidate | Compare with approvals |
| approvals | REVIEW | Governance | Duplicate candidate | Compare with approval |
| inventory | KEEP | Inventory | Active | Canonical inventory domain |
| warehouse | REVIEW | Inventory | Depends | Keep only if true warehouse logic |
| production | KEEP | Production | Active | Canonical production domain |
| recipes | REVIEW | Production | Suspect duplicate | Likely merge into Production |
| pos | KEEP | POS | Active | Sales/order execution |
| restaurant | REVIEW | POS/Operations | Suspect duplicate | Likely legacy/facade |
| procurement | KEEP | Procurement | Active but split | Needs consolidation |
| organizations | KEEP | Organization Runtime | Active | Canonical org system |
| auth | KEEP | Identity/Security | Active | Needs cleanup from tenant legacy |
| workspace | KEEP | Workspace Runtime | Active | Canonical workspace entry |
| marketing | KEEP | Marketing | Active | SaaS marketing engine |
| governance | KEEP | Governance | Active | Enterprise control layer |
| orchestration | KEEP | Orchestration | Active | Workflow/event engine |
| observability | KEEP | Observability | Active | Monitoring/health |
| security | KEEP | Security | Active | Platform security |
