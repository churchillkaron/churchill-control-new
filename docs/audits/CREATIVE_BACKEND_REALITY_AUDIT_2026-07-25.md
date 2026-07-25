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

### CRITICAL — Wallet settlement was not atomic

The merged baseline performed wallet settlement as independent read, update and insert operations. Transaction idempotency was also check-then-insert. Concurrent requests or retries could race, overwrite balances, duplicate settlements or leave balances changed without a matching transaction row.

Additional defects found during the same audit:

- `WalletTransaction.js` called `crypto.randomUUID()` without importing `crypto`.
- `OrganizationWallet.js` called `crypto.randomUUID()` without importing `crypto`.
- Both wallet factories silently defaulted currency to USD instead of requiring configured organisation currency.

### Repair committed on audit branch

Migration `20260725134500_service_wallet_atomic_settlement.sql` now:

- rejects duplicate organisation wallets before adding a unique constraint;
- enforces one wallet per organisation;
- adds mandatory transaction idempotency keys;
- enforces unique `(organization_id, idempotency_key)` settlement identity;
- serialises each settlement identity with a transaction-scoped advisory lock;
- locks the organisation wallet row;
- mutates balance and inserts transaction evidence in one PostgreSQL function;
- prevents reserve below available balance;
- prevents charge/release above reserved balance;
- rejects currency mismatch rather than silently changing wallet currency;
- exposes the function only to `service_role`.

The JavaScript wallet repository/runtime now routes ensure, reserve, charge, release and top-up through this RPC. Document factories import `node:crypto` and require explicit currency.

**Still required before paid live smoke:**

- apply the migration to the linked Supabase project;
- verify current production data has no duplicate organisation wallets;
- verify referenced column types match live schema;
- run concurrent reserve/retry, charge/retry and release/retry validation;
- verify wallet balances and transaction evidence remain exactly-once.

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
- Added database-atomic wallet settlement with exactly-once idempotency constraints.
- Removed missing `crypto` imports and fabricated USD wallet defaults.

## End-to-end test is blocked until

- [ ] Atomic wallet migration is applied and concurrency-tested against live schema.
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

1. Validate audit-branch build and migration syntax.
2. Live schema/migration contract audit.
3. Worker/task lease and retry audit.
4. Storage privacy and signed URL audit.
5. Provider output/callback settlement audit.
6. Render/QC/repair evidence audit.
7. Release/publish reconciliation audit.
8. Organisation configuration dry run.
9. Paid end-to-end smoke.
