# Operational Safety

## Critical Domains

High-risk operational systems:
- POS
- Kitchen
- Production
- Orders
- Inventory
- Payroll
- Accounting
- Payouts
- Control systems

Changes to these domains require:
- incremental migration
- build verification
- manual testing
- isolated changes

---

## Migration Rules

Never:
- mass refactor operational systems
- rewrite multiple critical flows simultaneously
- mix architecture migration with feature expansion

Always:
- isolate changes
- verify operational behavior
- preserve business continuity

---

## Tenant Safety

Never:
- hardcode tenant IDs
- bypass tenant resolution
- bypass permission checks

All operational queries must remain tenant-safe.

---

## Financial Safety

Financial calculations must:
- remain deterministic
- remain auditable
- remain reproducible

Critical finance domains:
- revenue
- cost
- payroll
- payouts
- accounting

---

## AI Operational Safety

AI systems must NEVER:
- directly modify financial records
- directly approve payouts
- directly modify inventory
- bypass approval flows

AI may:
- recommend
- analyze
- optimize
- predict

But critical operational actions require controlled workflows.

---

## Stability Rules

Every operational migration:
refactor
→ build
→ verify
→ commit

No exceptions.

---

## Incident Prevention

Avoid:
- hidden architecture changes
- silent refactors
- duplicated operational logic
- cross-domain operational coupling

Reason:
Operational instability impacts real restaurant operations.