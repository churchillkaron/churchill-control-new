# MIGRATION LOG

## COMPLETED

- Removed duplicate AI systems
- Removed duplicate Meta systems
- Removed dead branding systems
- Removed duplicate management systems
- Removed dead utility systems
- Consolidated payout into accounting
- Consolidated staff-control into staff
- Consolidated assets into marketing
- Removed waiter/expeditor legacy pages
- Removed menu-ai/menu-decisions legacy pages
- Stabilized Supabase architecture
- Stabilized tenant architecture
- Stabilized build/deployment

---

## NEXT PHASE

### Finance Module
- Merge finance APIs into accounting domain
- Standardize payout/payroll/revenue services

### Operations Module
- Merge kitchen/orders into operations architecture
- Centralize control logic

### Marketing Module
- Standardize generation pipeline
- Add publish retry queue monitoring
- Add analytics aggregation

### Staff Module
- Centralize attendance/performance/payroll

---

## IMPORTANT

- No massive rewrites
- One module at a time
- Preserve working routes
- Preserve working APIs
- Preserve production stability