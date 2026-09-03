# Avantiqo Development Workflow

**Status: living development guidance**

[`../AGENTS.md`](../AGENTS.md) is the authoritative repository operating contract.

## Core workflow

For substantial work:

1. Fetch newest `main`.
2. Read the relevant canonical/living docs and current source.
3. Inspect existing runtime/schema/tests before creating new architecture.
4. Reproduce/understand the actual problem.
5. Make the smallest coherent root-cause change that produces the intended architecture.
6. Run the cheapest reliable verification first.
7. Run focused tests and the normal build/E2E/certification required by the change.
8. Refetch newest `main` before writing/committing when concurrent work may exist.
9. Preserve unrelated parallel changes.
10. Commit a stable checkpoint to `main`.
11. Deploy production only as a separate intentional release step when explicitly appropriate.

## Local-first rule

Development and debugging should happen locally or in safe development/test environments whenever practical.

Production is not the default feedback loop.

Do not infer environment meaning from a filename alone. `.env.local`, `.env.development.local`, Vercel environments, Supabase project references, and runtime secrets can change over time. Before any state-changing command, verify the actual target from current configuration/tool context.

Never document `.env.local` as inherently production or staging.

## Database workflow

Do **not** make `supabase db reset` a universal development step.

Use reset only when:

- the target is positively identified as a disposable local database
- resetting the data is intended
- the reset is useful to the specific migration/schema test

For database changes:

1. identify the exact Supabase/database target
2. inspect current schema, migration history, policies, functions/triggers, and affected data/callers
3. design the migration and compatibility path
4. test safely against an appropriate local/test target where available
5. verify business invariants and representative workflows
6. commit migration/source together when they form one contract
7. apply production migration only as an intentional governed release step
8. verify resulting schema/data/policies and real workflows

Do not edit production state first and then attempt to reconstruct a migration afterward unless an emergency procedure explicitly requires it.

## Commands

Do not copy stale commands from this document as authority.

Use current repository tooling and installed CLI versions. Before running commands, inspect:

- `package.json`
- current scripts
- Supabase/Vercel configuration
- repository `AGENTS.md`
- the specific subsystem's living docs

Examples such as `supabase start`, `supabase migration new`, or `supabase db reset` may be useful only when they match the current local setup and verified target.

## Secrets and environment safety

- Never commit secrets, access tokens, service-role credentials, provider keys, or local secret files.
- Never print secret values into logs, issues, documentation, or chat output.
- Use the current approved secret/environment mechanism for the target runtime.
- Distinguish configuration identifiers from secrets.
- Verify target project/environment before writes, migrations, provider/GPU actions, or deployments.

## Provider/GPU development

For paid external/accelerator work:

**static/config proof → zero-cost runtime/preflight proof → one controlled paid execution only when needed → verify exact job/result/cost → cleanup**

Keep exact execution identity and never create duplicate paid jobs simply because status is uncertain.

## Architecture work

Before adding a new domain, runtime, registry, service, storage system, provider path, worker, queue, or database model, check whether current Avantiqo already has the underlying primitive/capability.

Architecture evolution is deliberate:

**research → understand → challenge assumptions → prototype → measure → compare → prove → migrate**

Do not keep both old and new architectures indefinitely because migration is inconvenient.

## Verification ladder

Use the layers relevant to the change:

1. exact source/config review
2. syntax/static/architecture checks
3. focused deterministic tests
4. broader tests/lint
5. full build
6. subsystem E2E/smoke/certification
7. controlled real-provider/paid proof only when earlier layers cannot establish the claim

Source completion is not certification.

## Recovery

Do not rely on a single undocumented local backup path as the recovery strategy.

Recovery must match the actual system and change: Git history, migrations, database backup/restore or forward repair, deployment rollback, provider/runtime rollback, and/or reconciliation evidence as applicable.
