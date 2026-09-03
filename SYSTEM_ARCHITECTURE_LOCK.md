# Avantiqo System Architecture Lock — Compatibility Pointer

**Status: living compatibility guard**

This historical filename is retained for compatibility. It does not define a second architecture.

Read instead:

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — permanent architecture contract
- [`SYSTEM_MAP.md`](./SYSTEM_MAP.md) — current logical system map
- [`docs/README.md`](./docs/README.md) — documentation authority

## Current locked structure

Avantiqo's canonical structure is:

**PLATFORM → USER → BUSINESS CONTEXT → UBTE → ERP_REGISTRY → DOMAIN → WORKSPACE → CAPABILITY → DOCUMENT / ACTION / PROCESS**

`ERP_REGISTRY` is the canonical ERP domain/workspace/capability topology. Exact runtime implementation must be read from current `main`.

## Business-context rule

Use organization, entity where applicable, period where applicable, and party relationships. Do not restore a tenant-based business architecture.

## Runtime rule

Prefer one canonical production execution path for a capability. Shared runtimes should be reused across human UI, Intelligence, automation, APIs, and Studio where they represent the same business capability.

Do not create parallel engines, registries, navigation systems, provider paths, or persistence models merely because a legacy implementation or one-off UI makes that locally easier.

## Navigation rule

Navigation is a delivery surface over the canonical registry/capability architecture. A route tree, menu builder, customer-specific module list, or historical folder structure must not redefine the platform's domain taxonomy.

## Legacy model

Historical references in this file to `SYSTEM_REGISTRY`, `DOMAIN_REGISTRY`, `buildWorkspaceRuntime`, or `organization_modules → platform_modules` were part of an earlier Churchill-era architecture. They are not current canonical authority.

Those symbols may still exist as implementation or migration facts. Their existence does not grant them architectural authority over `ERP_REGISTRY` and the current permanent architecture rule.

## Change rule

If current source diverges from the canonical architecture, record and resolve the divergence explicitly. Do not solve disagreement by maintaining both models indefinitely.
