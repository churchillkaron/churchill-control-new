# Naming Conventions

## Services
Pattern:
getX
createX
updateX
deleteX
processX
runX
buildX
calculateX

Examples:
getFinanceSummary
createCampaignFlow
updateCampaignPerformance
runGenerationEngine

---

## API Routes
Pattern:
resource/action

Examples:
/api/marketing/generate
/api/finance/summary
/api/production/run

Rules:
- No vague route names
- No duplicated route meanings
- Prefer verbs for actions
- Prefer nouns for resources

---

## Shared Utilities
Pattern:
shared responsibility names

Examples:
withApiHandler
getTenantId
requireFields
logInfo
logError

---

## File Naming
Rules:
- camelCase for JS files
- Clear intent naming
- No vague names like:
  - helper.js
  - utils.js
  - temp.js
  - new.js

---

## Domains
Pattern:
lib/{domain}/

Examples:
lib/marketing
lib/finance
lib/operations
lib/shared

Rules:
- Domains own business logic
- Shared owns infrastructure
- Persistence separated from business logic