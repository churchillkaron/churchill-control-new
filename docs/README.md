# Avantiqo Documentation Index and Governance

**Status: canonical documentation governance**

Avantiqo has accumulated architecture notes, migration records, audits, certification evidence, historical Churchill documents, domain reviews, and implementation guides over time. Those artifacts are useful, but they must not become competing descriptions of technical truth.

This document defines how repository documentation is interpreted and maintained.

## Authority hierarchy

Use the following order when sources disagree.

### 1. Current implementation evidence on newest `main`

For exact implementation facts, current source, schema, migrations, configuration, runtime contracts, tests, generated registries, and current `package.json` scripts are authoritative.

A document cannot make nonexistent code real or make obsolete code canonical.

### 2. Root `ARCHITECTURE.md`

[`../ARCHITECTURE.md`](../ARCHITECTURE.md) is the permanent architecture contract. It defines the principles the implementation is expected to converge toward, including the canonical platform flow, organization/entity/party model, industry neutrality, shared runtimes, execution safety, evidence, AI architecture, performance, cost, and certification rules.

If current implementation violates this contract, that is an explicit architecture/coherence defect to resolve, not permission to maintain two permanent architectures.

### 3. Root `AGENTS.md`

[`../AGENTS.md`](../AGENTS.md) is the repository operating contract for engineering sessions and agents: local-first development, `main` concurrency discipline, verification order, provider/GPU safety, and production release policy.

### 4. Root `SYSTEM_MAP.md`

[`../SYSTEM_MAP.md`](../SYSTEM_MAP.md) is the current logical map of Avantiqo. It explains how the canonical architecture maps across platform, context, UBTE, `ERP_REGISTRY`, domains, workspaces, capabilities, and documents.

`ERP_REGISTRY` and current implementation remain the executable/runtime truth for exact topology.

### 5. Living scoped documents

Domain, runtime, database, deployment, AI, security, workflow, and engineering documents may define detailed contracts for their scoped area.

A scoped document must not silently redefine the permanent platform architecture. When it needs to specialize a canonical rule, it should say so explicitly and link to its parent authority.

### 6. Historical/reference evidence

Audit reports, migration logs, review snapshots, cleanup plans, old maps, generated `.txt` outputs, benchmark results, certification artifacts, and dated investigation documents are evidence about a point in time.

They are **not current architecture authority** unless a current canonical/living document explicitly says otherwise.

## Required document statuses

New or substantially rewritten architectural/engineering Markdown documents should identify their role near the top when useful:

- **canonical** — defines a repository-wide contract or source-of-truth policy
- **living** — maintained to describe a current scoped system
- **reference** — useful technical/product explanation, not architecture authority
- **historical** — point-in-time evidence retained for traceability
- **generated** — machine-produced evidence whose generation contract is the source of truth

Do not label many documents canonical. Canonical status is intentionally rare.

## Canonical platform vocabulary

Documentation describing current Avantiqo architecture must use the current platform model:

**PLATFORM → USER → BUSINESS CONTEXT → UBTE → ERP_REGISTRY → DOMAIN → WORKSPACE → CAPABILITY → DOCUMENT / ACTION / PROCESS**

Canonical business context uses:

**organization → entity → party**

with `period_id` where relevant.

The canonical domain families are:

- Dashboard
- Finance
- Operations
- Supply Chain
- Commercial
- People
- Projects
- Documents
- Analytics
- AI
- Solutions
- Administration
- Compliance
- Creative

Industry terminology such as restaurant, hotel, retail, construction, accounting firm, kitchen, POS, or staff may describe a solution, route, experience, or configured workflow. It must not silently become a competing top-level platform taxonomy.

## Legacy terminology policy

The following are coherence warnings when used as **current architecture**:

- `Churchill SaaS` / `Churchill OS` as the platform identity
- `tenant`, `tenant_id`, tenant resolution, or tenant isolation as the preferred Avantiqo business-context model
- `SYSTEM_REGISTRY` / `DOMAIN_REGISTRY` as a competing current taxonomy when `ERP_REGISTRY` is authoritative
- `/kitchen`, `/pos`, `/marketing`, `/staff`, or similar routes presented as the canonical system architecture
- restaurant-specific primitives presented as universal platform primitives
- a Vercel/OpenAI/Claude/GPT example architecture presented as Avantiqo's product architecture

Legacy names may remain in migration code, compatibility routes, historical documents, audit outputs, or script names while convergence is underway. When retained, documentation must make their legacy/compatibility status clear.

Do not rewrite historical evidence merely to make history look clean. Fix the living/canonical description and classify history correctly.

## Living documentation rules

A living document should:

- describe current Avantiqo, not the system as it existed months ago
- state its scope and parent authority when architecture-adjacent
- prefer stable architectural contracts over volatile implementation trivia
- link to executable registries/configuration/tests for facts likely to change frequently
- avoid hardcoded model versions, provider lists, route lists, GPU availability, counts, or benchmark results unless the document is explicitly about that current state
- distinguish intended architecture from currently implemented/migrating behavior
- explain compatibility/legacy surfaces without promoting them to canonical design
- include verification/evidence expectations for important claims

## Historical and generated evidence

Historical artifacts are valuable because they explain why a decision was made and what was measured.

They should be interpreted as:

**evidence at timestamp/commit X**, not **permanent truth**.

Examples include:

- architecture reviews
- migration registers/logs
- domain ownership audits
- cleanup reports
- build output
- benchmark/certification summaries
- generated inventory/audit `.txt` files
- one-off investigation documents

When a historical artifact becomes misleading because its filename looks authoritative, prefer adding an explicit historical status/header or replacing its authority role with a canonical pointer rather than deleting useful evidence without reason.

## Documentation quality standard

World-class repository documentation should make the correct path obvious within minutes, not require archaeology through dozens of contradictory files.

Optimize for:

- one clear source of truth per concept
- strong entrypoints
- explicit scope/authority
- concise stable contracts
- links to executable truth
- evidence-backed claims
- migration/legacy clarity
- low duplication
- discoverability for both humans and agents

Documentation must reduce engineering entropy. If a document can cause a competent engineer or agent to build the wrong architecture, it is a defect even if it was once historically accurate.

## Research and invention standard

Documentation for major design decisions should record enough reasoning/evidence to show why the chosen approach is superior to the obvious alternatives.

Preferred loop:

**research → understand → challenge assumptions → invent → prototype → measure → compare → improve → certify**

Do not justify architecture with “this is standard practice” alone. Compare alternatives on the dimensions that matter to the workload: correctness, capability, autonomy, latency, reliability, cost, safety, usability, maintainability, and human effort.

## Documentation change checklist

When changing architecture or a major runtime:

1. Fetch newest `main` and inspect the actual current implementation.
2. Identify which canonical/living documents govern the change.
3. Update executable contracts first or together with the implementation.
4. Update the minimum authoritative documentation required to prevent drift.
5. Do not copy the same architecture rule into many files; link to canonical authority.
6. Mark old point-in-time material historical when it remains useful.
7. Search for terminology/contracts made obsolete by the change.
8. Verify that README/system map/architecture/engineering guidance no longer disagree.
9. Add or update deterministic audits where documentation-only convention is insufficient.
10. Do not claim documentation convergence complete until stale living contradictions have been searched for and resolved.

## Primary reading path

For a new engineer or agent:

1. [`../README.md`](../README.md)
2. [`../AGENTS.md`](../AGENTS.md)
3. [`../ARCHITECTURE.md`](../ARCHITECTURE.md)
4. [`../SYSTEM_MAP.md`](../SYSTEM_MAP.md)
5. [`ENGINEERING_RULES.md`](ENGINEERING_RULES.md)
6. The current scoped domain/runtime docs and executable source relevant to the task

Everything else should be read according to its scope/status, not assumed to be repository-wide truth because it has an authoritative-sounding filename.
