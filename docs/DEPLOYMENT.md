# Deployment Workflow

## Standard Deployment Flow

1. Refactor
2. Build locally
3. Verify critical flows
4. Commit
5. Push
6. Verify deployment
7. Verify production behavior

---

## Never Deploy Without

- successful local build
- architecture consistency
- tenant safety verification
- operational verification for critical systems

---

## Critical Systems Requiring Manual Verification

After deployment always verify:

- POS
- Kitchen
- Orders
- Production
- Payroll
- Accounting
- Marketing generation
- Queue systems

---

## Deployment Safety Rules

Never:
- deploy massive refactors
- combine architecture migration with major features
- deploy unverified tenant changes
- deploy without build verification

---

## Rollback Philosophy

Every deployment should be:
- incremental
- reversible
- isolated

Prefer:
small safe deployments
over
large risky deployments.

---

## Architecture Migration Rule

For architecture migrations:

refactor
→ build
→ verify
→ commit
→ deploy
→ verify again

---

## Multi-Tenant Deployment Safety

Critical checks:
- tenant isolation
- auth flow
- tenant resolution
- RLS behavior
- permission handling

---

## Future Goals

Planned:
- staging environment
- preview deployments
- automated smoke tests
- deployment health checks
- migration tracking