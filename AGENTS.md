# Avantiqo Repository Operating Contract

This file is the canonical operating contract for coding agents, assistants, automations, and new development sessions working in this repository.

**Read this file before changing code.** If a user instruction in the current conversation explicitly overrides a rule here, follow the user. Otherwise these rules are mandatory.

---

## 1. Core development principle

Avantiqo is developed and certified **local-first**.

The normal lifecycle is:

**Develop -> commit to `main` -> sync local `main` -> build/test locally -> run local end-to-end verification -> repair locally -> repeat locally -> deploy production once when the finished release is ready.**

The forbidden normal lifecycle is:

**change -> production deploy -> test -> change -> production deploy -> test.**

Production is not a debugging environment and must not be used as the ordinary development loop.

---

## 2. `main` is the only source of truth

- Work directly on `main` unless the user explicitly asks for another branch or a PR.
- Do not create feature branches or pull requests for ordinary work.
- Do not leave required fixes only in another branch when `main` is the requested source of truth.
- Never force-push or force-move `main` to discard newer work.
- Never revert unrelated work from another chat/agent merely because it appeared while you were working.

### Concurrency rule

Multiple chats/agents may update the repository at the same time.

Therefore:

1. Fetch the newest `main` at the start of every task.
2. Fetch the newest `main` again immediately before every write/commit.
3. Refetch every file you are about to edit if `main` moved since you last read it.
4. Preserve newer unrelated changes and reapply your edit on top of the newest file.
5. If GitHub rejects a write because the blob SHA changed, treat that as concurrency protection: refetch, reconcile, then write again.
6. Never solve a concurrency conflict by overwriting the other agent's work blindly.

When working from the local clone, the equivalent safe startup sequence is normally:

```bash
git fetch origin main
git checkout main
git pull --ff-only origin main
git status
```

Do not use destructive reset/clean commands unless the user explicitly asks and the impact is understood.

---

## 3. Local environment is the normal execution environment

The repository's local clone plus `.env.local` is the normal development and certification environment for essentially the full Avantiqo platform, including:

- Intelligence / autonomous operator runtime
- Creative Studio
- Image
- Cinema / Video
- Voice
- Music / SFX
- Code generation/runtime
- Finance
- Operations
- Supply Chain
- Commercial
- People / workforce
- Projects
- Documents
- Analytics
- Administration / Compliance
- APIs
- Supabase access
- wallet / pricing / billing logic
- provider integrations
- RunPod calls
- migrations and data-access logic
- authentication and authorization logic
- local browser flows and application runtime behavior

A code change does **not** require a Vercel production deployment simply because it touches one of these systems.

---

## 4. Repository runtime baseline

At the time this contract was created, the root `package.json` declares Node **24.x** and the repository contains a `package-lock.json`.

Use the repository's current files as the authority if they later change.

Normal local setup when dependencies must be refreshed:

```bash
node --version
npm ci
```

Do not replace the lockfile casually and do not upgrade dependencies unless the task requires it.

Before running commands, inspect the current `package.json` scripts rather than inventing alternate commands.

Important root scripts currently include:

```bash
npm run dev
npm run build
npm test
npm run lint
```

`npm run build` is especially important because the repository's `prebuild` script executes a large release-audit chain before `next build`. A successful `next build` reached by bypassing `prebuild` is not equivalent to a successful repository build.

The repository also contains domain-specific audits, benchmarks, smokes, and execution scripts. Use the relevant current script from `package.json` for the subsystem being changed.

Examples include Creative, Finance, Operations, workforce, forecast, operator, and tenant-isolation audits. Always inspect the current script list because it can evolve.

---

## 5. Required local verification sequence

Not every tiny edit needs every expensive test, but verification should progress from cheapest/deterministic to broadest/most expensive.

### Layer A — source/static verification

Use first whenever possible:

- inspect the exact changed files
- inspect call sites and contracts
- run syntax/type/static checks available to that subsystem
- run architecture/release audit scripts relevant to the change
- use read-only audit scripts before write/spend operations

### Layer B — unit and repository tests

Run relevant tests, including root tests when appropriate:

```bash
npm test
```

Run lint when the changed surface warrants it:

```bash
npm run lint
```

### Layer C — full local build

Before considering a substantial release complete:

```bash
npm run build
```

This must be the normal full build path so the repository prebuild audits also execute.

### Layer D — subsystem end-to-end verification

Run the relevant local E2E/smoke/audit flow for the subsystem changed.

Examples:

- Creative changes -> relevant Creative audits/preflight/smoke/benchmark
- Finance changes -> relevant Finance audits/E2E/smoke
- Operations changes -> relevant Operations audits and capability/readiness checks
- Provider changes -> local provider preflight plus deliberately scoped execution when needed
- Auth/API changes -> local authenticated request/browser flow where possible

Do not declare a subsystem fixed merely because one isolated function works if the user's request is end-to-end.

### Layer E — controlled live-provider execution

Only when it materially proves behavior that static/local mocked verification cannot prove.

Examples include a real RunPod generation, external AI call, storage upload, or other paid provider execution.

These executions must be deliberate, scoped, and economical. Do not repeatedly burn provider spend as a substitute for source debugging.

---

## 6. `.env.local` and secrets

`.env.local` may contain real credentials and may point at real Supabase, RunPod, OpenAI, Google, Stripe, or other services.

Mandatory rules:

- Never commit `.env.local`.
- Never commit API keys, access tokens, service-role keys, webhook secrets, OAuth secrets, database credentials, or private certificates.
- Never paste secret values into source, tests, commits, issues, or user-visible logs.
- Do not replace environment-variable access with hard-coded fallbacks containing secrets.
- If a secret appears to be missing, verify configuration safely; do not invent a credential.

Local-first means the **application runs locally**. It does not automatically mean every connected service is a disposable sandbox.

---

## 7. Production-data safety

Because the local app may connect to shared or production services, always distinguish **local process** from **safe test data**.

For destructive, mutating, or spend-causing verification:

- use benchmark/test organizations and test-scoped records
- avoid real customer/business records
- do not delete or rewrite production business data as part of debugging
- prefer read-only inspection when a write is not needed
- make generated benchmark artifacts clearly attributable to the benchmark/test execution
- clean up test artifacts when cleanup is safe and required

If the target organization/project is unclear, inspect context/configuration before performing destructive writes.

---

## 8. Supabase and migrations

Local execution can still target a real Supabase project.

Before applying a migration or bulk data change:

1. Identify the actual Supabase project/environment being targeted.
2. Inspect the migration and its blast radius.
3. Prefer additive, reversible, idempotent, or safely repeatable migrations.
4. Check existing row counts/data assumptions before destructive backfills or deletes.
5. Keep test writes scoped to test/benchmark organizations whenever organization scoping applies.
6. Do not use development convenience as justification to mutate unrelated production data.
7. Preserve the platform's organization-scoped architecture; do not reintroduce legacy tenant assumptions.

A local command is not automatically safe merely because it was launched from localhost.

---

## 9. Provider and RunPod safety

Provider integrations should be developed locally and production-deployed only at final release.

For paid or GPU-backed tests:

- use the minimum execution needed to prove the behavior
- verify transport/contracts before spending GPU/API money
- use benchmark/test organization context
- avoid uncontrolled loops/retries
- account for wallet/reservation/usage/pricing behavior when testing production-like service runtime paths
- keep certification capabilities fail-closed until they actually pass the intended quality/economic review

Do not mark an advanced media capability production-certified solely because its source code exists or a provider accepts the request.

---

## 10. Production deployment policy

Do **not** deploy production for ordinary:

- development
- debugging
- Creative Studio work
- provider work
- source convergence
- certification preparation
- local smoke tests
- build/test iterations
- minor fixes
- intermediate commits

Production deployment is the **final release step** after local verification is clean, unless the user explicitly requests an earlier production deployment for a reason that inherently requires production/public behavior.

The repository/Vercel workflow uses the commit marker:

```text
[deploy-production-final]
```

Treat that marker as privileged release intent.

**Do not include `[deploy-production-final]` in normal development commits.**

Only use it when the user explicitly intends the finished change set to trigger the final production release.

---

## 11. Things that inherently may require Vercel or a public environment

Use production/public deployment only when local/tunnel/preview verification cannot prove the required behavior, for example:

- actual `avantiqo.ai` production-domain routing/behavior
- Vercel CDN behavior
- Vercel Edge behavior
- Vercel cache behavior
- Vercel firewall/WAF behavior
- real production-domain cookies/headers when domain behavior is the subject of the test
- production OAuth callbacks that cannot be represented by localhost/tunnel/preview
- incoming third-party webhooks that cannot reach localhost/tunnel/preview
- actual Vercel Cron scheduling
- final serverless cold-start verification
- final Vercel execution-time limits
- final concurrency/scaling behavior
- final production-only environment-variable or domain binding verification

Even for OAuth and webhooks, prefer localhost, a tunnel, or preview when practical.

---

## 12. Commit discipline

Normal development commits:

- go directly to `main`
- should be cohesive and accurately named
- must not contain the production-deploy marker
- must not contain secrets
- must not bundle unrelated destructive cleanup

When another agent moves `main`, preserve its work and continue on top of it.

Before reporting a commit as the latest state, fetch `main` once more because another session may have committed after you.

---

## 13. Do not confuse source completion with runtime certification

Use precise language.

Examples:

- "implemented in source" means the code/contract exists
- "local build passed" means the current local build passed
- "local E2E passed" means the actual local end-to-end flow passed
- "provider execution passed" means a real provider execution passed
- "certified" means the required certification criteria passed
- "production deployed" means the release is actually deployed to production

Never claim production certification or deployment merely because source code was committed.

---

## 14. Definition of done for ordinary development

A substantial task is not done merely because the code was edited.

Before calling ordinary development complete, aim for all applicable items:

1. newest `main` was fetched before the final edits
2. the intended source changes are committed to `main`
3. no unrelated concurrent work was overwritten
4. relevant static/audit checks pass locally
5. relevant tests pass locally
6. the full local build passes when appropriate
7. relevant local E2E/smoke flows pass
8. failures discovered by those flows were repaired and rerun
9. any real-provider execution was controlled and test-scoped
10. no production business data was accidentally altered
11. no secrets were committed
12. production was **not** deployed unless this was explicitly the final release step

---

## 15. Final release checklist

A production release is a separate phase from development.

Before the final production release:

1. Fetch and sync the newest `main`.
2. Confirm the release contains all intended concurrent changes.
3. Install from the lockfile if required (`npm ci`).
4. Run relevant local audits/tests.
5. Run `npm run build` through the normal prebuild chain.
6. Run the required local E2E/smoke flows.
7. Confirm migrations/data changes and target environments are safe.
8. Confirm provider/wallet/billing implications where relevant.
9. Confirm no secrets or local files are staged.
10. Only then create the intentional final production deployment using the repository's deployment mechanism/marker.
11. After deployment, perform only the production-specific verification that cannot be proven locally.

Default rule:

> **LOCAL FIRST. MAIN IS SOURCE OF TRUTH. PRODUCTION LAST.**

---

## 16. New-session startup checklist

Every new coding session should begin by establishing the same baseline instead of guessing from an older chat:

1. Read `AGENTS.md`.
2. Fetch newest `main`.
3. Inspect recent `main` commits relevant to the task.
4. Sync the local `main` clone when local execution is available.
5. Read the current files being changed; do not rely on stale snippets from another session.
6. Inspect current `package.json` scripts for the relevant verification commands.
7. Identify whether the task is source-only, local execution, paid-provider execution, or final production release.
8. Default to source/local work unless the user explicitly asks for final production deployment.
9. Identify benchmark/test organization scope before destructive/spend-causing tests.
10. Continue from the latest repository state rather than recreating already-completed work.

This checklist exists so separate chats follow one consistent engineering path.
