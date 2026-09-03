# Avantiqo Deployment and Release Workflow

**Status: living release guidance**

The repository operating contract in [`../AGENTS.md`](../AGENTS.md) is authoritative for release safety.

## Core rule

Production is a release destination, not the normal debugging environment.

Normal lifecycle:

**develop locally → deterministic verification → focused tests → build/E2E as applicable → commit to `main` → repair/certify → explicit production release → post-release verification**

Do not deploy production merely because a commit exists.

## Before release

A production-affecting release should have evidence appropriate to its blast radius, including where relevant:

- newest `main` inspected and intended commit identified
- successful relevant static/architecture checks
- focused deterministic tests
- normal full build for substantial application changes
- subsystem E2E/smoke/certification
- database migration review/verification
- organization/entity authorization checks
- execution/idempotency checks for external/paid/destructive actions
- cost/wallet/provider safety checks
- rollback/recovery understanding

Do not require irrelevant checks simply to satisfy a ritual. The proof must cover the actual risk.

## Production deployment policy

- Production deployment must be an intentional final step.
- Ordinary development commits must not silently force a production deployment.
- Follow the current repository/Vercel release mechanism rather than stale CLI snippets in historical documents.
- Never use production as the first place to discover whether a substantial code change builds.
- Do not mix unrelated architecture migration, destructive database change, and product release into one opaque deployment when safer staging is possible.

## Critical verification classes

Apply stronger post-release verification when the change affects:

- authentication/authorization/business context
- Finance/accounting/payments/refunds/settlement
- payroll/compensation
- inventory/resource movements and procurement
- external communications/publishing
- paid AI/provider/GPU execution
- destructive data changes/migrations
- canonical shared runtimes/registries
- high-traffic/high-latency user workflows

Risk is based on business effect, not historical route names such as POS or Kitchen.

## Database releases

Before database changes, identify the exact target environment and inspect schema/data/policies/callers.

Prefer migration strategies that are additive/backward-compatible or safely staged when they reduce risk. Verify real invariants after migration, not only that SQL executed successfully.

Never assume a reset command is safe for a remote or production project.

## External and paid runtime releases

For provider/GPU/runtime changes:

1. pass zero-cost/static preflight first
2. verify immutable runtime/config/image binding where applicable
3. use one controlled paid execution when that is the minimum proof required
4. retain exact execution identity
5. do not blindly retry ambiguous jobs
6. verify output/result and usage/cost
7. clean up/scale down according to the owning runtime contract

## Rollback and recovery

Every material release should have a credible recovery path appropriate to the change.

That may be:

- application rollback to a known-good deployment
- feature/routing disablement
- provider/runtime rollback
- forward database repair migration
- data restore/reconciliation plan

Database changes are not always safely reversible by running SQL backward; design recovery based on the real data semantics.

## Post-release verification

Verify the changed contract itself:

- application health
- affected workflow completion
- persistence/business side effects
- auth/RLS/permissions where changed
- external execution identity/status
- financial/operational invariants
- errors/logs/observability
- latency/performance where relevant
- cost/usage where relevant

A green deployment status is not sufficient evidence that the business workflow works.

## Release quality

Prefer small, understandable, independently verifiable releases when they reduce risk, but do not split one coherent atomic migration into unsafe fragments merely to make commits/deployments small.

The goal is **controlled blast radius + reproducible evidence**, not “small changes” as a rule for its own sake.
