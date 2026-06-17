# Churchill OS Architecture (CLEAN STATE)

## CORE ENGINE
- UBTE: Transaction Engine (single source of truth for writes)

## STRUCTURE LAYER
- SYSTEM_REGISTRY: Global system structure (Operations / Finance / Growth / Platform)

## DOMAIN LAYER
- DOMAIN_REGISTRY: UI + capability mapping for modules

## RUNTIME LAYER
- buildWorkspaceRuntime: user + org + modules orchestration

## NAVIGATION RULE
- ONLY runtime-generated navigation allowed
- NO static nav builders

## MODULE RULE
- Modules come ONLY from:
  organization_modules → platform_modules

## FORBIDDEN SYSTEMS
- buildPlatformNav ❌
- syncWorkspaceNav ❌
- duplicate moduleRegistry ❌
- domainEngine ❌

