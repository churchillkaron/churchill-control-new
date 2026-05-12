# Migration Priority

## Phase 1 — SAFE
Marketing APIs
Finance APIs
Analytics APIs

Reason:
- Lower operational risk
- Easier architecture validation

---

## Phase 2 — MEDIUM
History
Reporting
Management
Staff performance

Reason:
- Moderate coupling
- Internal workflows

---

## Phase 3 — HIGH RISK
POS
Kitchen
Production
Control
Orders

Reason:
- Real-time operations
- Revenue critical
- High coupling
- Inventory impact

Rules:
- One route at a time
- Build after every migration
- Commit after every stable milestone
- Never mass refactor