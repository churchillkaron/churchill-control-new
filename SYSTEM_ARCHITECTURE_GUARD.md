# CHURCHILL / AVANTIQO ARCHITECTURE LOCK

## CORE PRINCIPLES
- Single source of truth per domain
- No duplicate engines
- No parallel runtime systems

## IMMUTABLE SYSTEMS
- UBTE (execution only)
- SYSTEM_REGISTRY (structure only)
- DOMAIN_REGISTRY (capability only)
- buildWorkspaceRuntime (orchestration only)
- buildNavigationRuntime (navigation only)
- moduleRegistry (single file only)

## FORBIDDEN SYSTEMS
- safeNav
- normalizeNavForUI
- syncWorkspaceNav
- buildPlatformNav
- getWorkspaceNavigation
- domainEngine
- bootstrapDomains
- duplicate module registries

## VIOLATION RULE
If any forbidden system appears:
→ must be deleted immediately
→ no migration allowed
→ no coexistence allowed

## ARCHITECTURE GOAL
Single deterministic enterprise OS with:
- one execution engine
- one navigation engine
- one module registry
- one runtime system
