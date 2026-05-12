# Route Audit

## GOOD
- Thin route
- Uses withApiHandler
- Uses getTenantId
- Uses service layer

## WARNING
- Contains DB logic
- Contains calculations
- Contains validation duplication

## BAD
- Hardcoded tenant IDs
- Raw createClient inside route
- Massive business logic in route
- Duplicated orchestration