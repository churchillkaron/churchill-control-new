# AVANTIQO / CHURCHILL OS ARCHITECTURE LOCK

## DO NOT CHANGE WITHOUT EXPLICIT REQUEST

### 1. SYSTEM LAYER (EXECUTIVE)
SYSTEM_REGISTRY defines:
- runtime
- operations
- finance
- people
- growth
- platform

### 2. DOMAIN LAYER (BUSINESS LOGIC)
DOMAIN_REGISTRY defines:
- pos
- inventory
- procurement
- finance
- payroll
- marketing
- kitchen
- floor
- expo

### 3. EXECUTION LAYER (UBTE)
UBTE is the ONLY transaction engine.

ALL writes must go through:
executeTransaction()

### 4. MODULE MARKETPLACE
platform_modules = available modules
organization_modules = enabled modules

### 5. NAVIGATION RULE
Navigation MUST be composed from:
SYSTEM_REGISTRY + DOMAIN_REGISTRY + organization_modules

NOT from any single table or file.

### 6. GOLDEN RULE
No new module system may be created.
No duplicate registry is allowed.
All new features MUST attach to existing domains.

