# CHURCHILL SaaS SYSTEM MAP

## CORE MODULES

### Operations
- /control
- /dashboard
- /history
- /production
- /kitchen

### Commerce
- /pos
- /orders

### Finance
- /accounting
- /accounting/revenue
- /accounting/payroll
- /accounting/payout
- /accounting/reports

### Marketing
- /marketing
- /marketing/design
- /marketing/operations
- /marketing/assets
- /marketing/social

### Staff
- /staff
- /staff/performance
- /staff/upload
- /staff/reviews

---

# API STRUCTURE

## Marketing APIs
/app/api/marketing/*

## Finance APIs
/app/api/finance/*

## Production APIs
/app/api/production/*

## Staff APIs
/app/api/staff/*

---

# LIB STRUCTURE

## Shared
/lib/shared

## Marketing
/lib/marketing

## Services
/lib/services

## Supabase
/lib/supabase

---

# RULES

- No duplicate routes
- No duplicate APIs
- No direct DB calls in pages
- Service layer handles orchestration
- Engines handle business logic
- Shared utilities only in shared/
- One source of truth per module