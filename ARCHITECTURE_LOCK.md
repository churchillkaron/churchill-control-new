# Avantiqo Architecture Lock — Compatibility Pointer

**Status: living compatibility guard**

This filename is retained because older code, audits, or engineering sessions may reference it. It no longer defines a separate architecture.

The canonical architecture contract is [`ARCHITECTURE.md`](./ARCHITECTURE.md). The current logical map is [`SYSTEM_MAP.md`](./SYSTEM_MAP.md). Documentation authority is defined in [`docs/README.md`](./docs/README.md).

## Locked invariants

The following principles are protected unless Avantiqo deliberately changes its canonical architecture through research, proof, and migration:

- Avantiqo is one coherent multi-industry platform.
- Canonical platform flow: `PLATFORM → USER → BUSINESS CONTEXT → UBTE → ERP_REGISTRY → DOMAIN → WORKSPACE → CAPABILITY → DOCUMENT / ACTION / PROCESS`.
- Canonical business context uses organization, entity where applicable, period where applicable, and party relationships — not a tenant architecture.
- `ERP_REGISTRY` is the canonical ERP domain/workspace/capability topology.
- Industry experiences such as POS, kitchen, hotel, retail, accounting, marketing, or staff workflows are compositions/surfaces over reusable capabilities; they are not competing platform registries.
- Shared execution/runtime behavior must not be duplicated without an explicit migration or evidence-backed architectural reason.
- Expensive, external, destructive, and irreversible operations require governed identity, at-most-once/idempotent handling, verification, and evidence.
- Architecture changes must preserve one source of truth per business concept.

## Explicit legacy invalidation

The historical model that treated `SYSTEM_REGISTRY` plus `DOMAIN_REGISTRY` with `pos`, `kitchen`, `floor`, `expo`, `marketing`, and similar product/industry modules as the canonical Avantiqo taxonomy is obsolete.

Historical references to `executeTransaction()`, `platform_modules`, `organization_modules`, or specific navigation builders are implementation/history facts only. They do not override the permanent architecture contract or prove that every current write/navigation path must use those exact historical symbols.

## Change rule

Do not weaken this guard to accommodate a one-off feature. If evidence shows the canonical architecture itself should change, use the deliberate process defined in `ARCHITECTURE.md`:

**investigate → prototype → compare → prove → migrate deliberately**

Until that happens, new work must converge toward the canonical Avantiqo architecture rather than reviving the legacy Churchill registry model.
