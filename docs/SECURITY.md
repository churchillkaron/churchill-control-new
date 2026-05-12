# Security Governance

## Core Principles

Security priorities:
- tenant isolation
- operational protection
- financial integrity
- controlled AI behavior
- infrastructure consistency

---

## Multi-Tenant Security

Never:
- hardcode tenant IDs
- bypass tenant resolution
- trust frontend tenant data blindly

Always:
- resolve tenant centrally
- validate tenant access
- keep queries tenant-safe

---

## Supabase Security

Rules:
- shared infrastructure clients only
- avoid random createClient usage
- separate admin/server/browser usage

Shared locations:
- lib/shared/supabase/client
- lib/shared/supabase/server
- lib/shared/supabase/admin

---

## Service Role Safety

Never expose:
SUPABASE_SERVICE_ROLE_KEY

to:
- frontend
- client components
- browser-executed code

Service role belongs ONLY in:
- server routes
- secure services
- backend execution

---

## Authentication Goals

Future requirements:
- centralized auth
- role enforcement
- tenant-aware permissions
- protected operational actions

---

## Operational Security

Critical systems:
- payroll
- payouts
- accounting
- inventory
- production

Require:
- controlled workflows
- auditability
- approval layers

---

## AI Security

AI systems must NEVER:
- bypass approvals
- directly control finance
- directly modify operational truth
- bypass tenant validation

AI may:
- recommend
- analyze
- optimize
- generate

But controlled workflows own execution.

---

## Logging & Monitoring

Future goals:
- security event logging
- failed auth tracking
- suspicious activity monitoring
- tenant access monitoring

---

## Deployment Security

Never deploy:
- unverified auth changes
- unverified tenant changes
- mixed frontend/backend secret handling

Always:
- build
- verify
- validate security-sensitive flows

---

## Future Security Goals

Planned:
- RLS enforcement
- permission layers
- role-based access
- audit trails
- API rate limiting
- secure queue processing
- secret rotation