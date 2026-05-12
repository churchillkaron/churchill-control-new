# SYSTEM RULES

## ARCHITECTURE

- app/ = routes and UI only
- lib/services = orchestration only
- lib/engines = business logic engines
- lib/shared = shared utilities only
- lib/marketing = marketing domain only
- lib/finance = finance domain only
- lib/staff = staff domain only
- lib/operations = operations domain only
- lib/production = production domain only

---

## DATABASE

- No direct database calls inside pages
- Use service layer
- Use shared Supabase clients only

---

## AI

- One AI architecture only
- No duplicate prompt systems
- No duplicate engines
- No duplicate providers

---

## ROUTES

- One source of truth per route
- No duplicate pages
- No abandoned routes

---

## FILE STRUCTURE

- No random root lib files
- No backup files
- No old/final/test copies

---

## DEVELOPMENT

- One change at a time
- Full file replacements only
- Never break working systems
- Fix root cause only