# Creative Backend Reality Audit — 2026-07-25

## Purpose

This audit evaluates whether the Creative Studio backend is safe and truthful enough for a real organisation-scoped end-to-end production test. A passing build is not treated as proof of database, provider, wallet, worker, storage, rendering or publishing readiness.

## Baseline

- Base branch: `main`
- Base commit: `9a4eb7b04c24c70d674a4085dbb17c0ae4d4566b`
- PR #4 and PR #5 are merged.
- The audit branch contains only audit-driven hardening and evidence.

## Audit domains

1. Authentication, organisation access and permissions
2. Database tables, columns, constraints, RLS and migration history
3. Asset graph integrity and organisation/project scope
4. Production planning, task materialisation and worker execution
5. Provider selection, pricing and credential resolution
6. Wallet reservation, charge, release and billing atomicity
7. Storage privacy, signed delivery and provider-output ingestion
8. Timeline, render, technical QC, perceptual QC and repair
9. Rights, consent, licence, identity and immutable approvals
10. Release readiness, publish commands, connector execution and callbacks
11. Environment preflight and live-smoke prerequisites
12. Failure recovery, idempotency, retries and observability

## Confirmed findings

### CRITICAL — Wallet settlement is not atomic

`WalletRuntime.reserve`, `charge` and `release` perform independent operations:

1. Read wallet/transaction state.
2. Update wallet balances.
3. Insert a wallet transaction.

The transaction idempotency guard is also implemented as check-then-insert. Concurrent requests or retries can therefore race, overwrite balances, duplicate settlements or leave balances changed without a matching transaction row.

**Required before paid live smoke:**

- Add database-side atomic settlement functions or a serialised transaction boundary.
- Lock the organisation wallet row during settlement.
- Enforce unique database constraints for settlement identities.
- Make balance mutation and transaction insertion one atomic operation.
- Verify reserve → charge and reserve → release under concurrent retries.

### HIGH — Previous preflight could report false readiness

The original Creative release preflight checked Supabase URL/service role, render bucket and FFmpeg/FFprobe paths, but did not check:

- Supabase anon key required for cookie authentication
- provider credential source
- provider credential JSON validity
- autonomous worker secret
- provider callback signing secret

The audit branch repairs these checks. No secret values are returned.

### HIGH — Media execution depends on deployed binaries

`package.json` on the merged baseline does not include `ffmpeg-static` or `@fal-ai/client`. FFmpeg/FFprobe execution therefore depends on valid executable paths in the deployment environment. A successful Next.js build does not prove rendering is executable.

**Required before smoke:** preflight must confirm both configured paths exist and are executable in the deployed runtime.

### HIGH — Provider credential source is configuration-dependent

Provider execution now resolves credentials server-side and overrides request-supplied credential fields. This is structurally safer, but production must configure either:

- a registered Avantiqo-managed credential resolver, or
- valid `AVANTIQO_PROVIDER_CREDENTIALS_JSON` server configuration.

No live credential resolution has yet been proven for the test organisation and selected provider.

### HIGH — External publish reconciliation remains incomplete

Publish command creation and initial connector execution are present. Async provider callback/status reconciliation for `PUBLISH_EXECUTION` is not yet proven end to end. Publication must remain pending until provider evidence is received and settled exactly once.

### HIGH — Database/schema reality is not yet verified

The code references Creative graph, project, task, usage, pricing, wallet and billing tables, but this audit has not yet verified the live Supabase schema, constraints, RLS, migration history or required columns against the merged source.

### HIGH — Full worker-backed production is not yet proven

The merged backend foundation does not itself prove that production tasks are leased, executed, retried, completed and converted into releasable assets by the deployed worker.

## Repairs committed during audit

- Added secret-safe provider credential readiness introspection.
- Strengthened Creative release preflight with required checks for:
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - provider credential source
  - credential configuration validity
  - worker secret
  - provider callback signing secret
  - existing Supabase, render bucket, FFmpeg and FFprobe gates

## End-to-end test is blocked until

- [ ] Wallet settlement is database-atomic and concurrency-tested.
- [ ] Live Supabase schema and migration history match merged source.
- [ ] Required Creative tables, columns, constraints and RLS are verified.
- [ ] Organisation staff permissions include every required Creative permission.
- [ ] Organisation services and provider pricing are enabled for selected capabilities.
- [ ] Wallet is funded in the correct configured currency.
- [ ] Provider credentials resolve server-side for the selected organisation/provider.
- [ ] Worker secret and callback secret are configured.
- [ ] Render bucket is private and signed delivery is verified.
- [ ] FFmpeg and FFprobe are executable in deployment.
- [ ] Provider output ingestion creates immutable checksum/lineage evidence.
- [ ] Async provider callbacks/polling settle usage and wallet exactly once.
- [ ] Publish execution reconciles provider success/failure exactly once.
- [ ] One organisation-scoped dry run passes preflight without executing paid providers.
- [ ] Only then run the paid end-to-end smoke.

## Next audit sequence

1. Live schema/migration contract audit.
2. Wallet atomicity repair and database constraints.
3. Worker/task lease and retry audit.
4. Storage privacy and signed URL audit.
5. Provider output/callback settlement audit.
6. Render/QC/repair evidence audit.
7. Release/publish reconciliation audit.
8. Organisation configuration dry run.
9. Paid end-to-end smoke.
