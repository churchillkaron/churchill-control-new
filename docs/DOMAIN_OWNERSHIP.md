# Domain Ownership

## Marketing Domain
Location:
lib/marketing/*

Owns:
- AI generation
- Campaigns
- Assets
- Publishing
- Analytics
- Recommendations
- Meta integrations

---

## Finance Domain
Location:
lib/finance/*

Owns:
- Revenue
- Profit
- Cost analysis
- Payroll
- Accounting
- Financial reports
- Payout logic

---

## Operations Domain
Location:
lib/operations/*

Owns:
- POS
- Kitchen
- Orders
- Production
- Waste
- Inventory
- Control systems

---

## Shared Domain
Location:
lib/shared/*

Owns:
- Validation
- Logging
- HTTP framework
- Tenant resolution
- Shared infrastructure
- Shared clients/utilities

---

## Persistence Layer
Location:
lib/supabase/*

Owns:
- Database persistence
- Storage persistence
- Queue persistence
- Supabase wrappers

Rules:
- Domains do not own shared infrastructure
- Shared layer contains no business logic
- API routes never contain domain logic
- Domains should not depend heavily on each other