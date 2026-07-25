# Avantiqo Creative Studio Reality Audit

Date: 2026-07-24  
Branch audited: `agent/creative-shot-production-convergence`  
Pull request: #1  
Scope: mission intake, business truth, project creation, director, storyboard, production graph, task materialization, providers, wallet/billing, worker continuation, quality control, release, UI, smoke tests, migrations, build reproducibility.

## Executive conclusion

The branch contained substantial world-class film-production work, but it was not an end-to-end universal Creative Studio. The user-visible mission layer claimed open-ended production while the execution layer remained film-only. The existing smoke scripts could pass without producing a movie, image, webpage, menu, document, presentation, or final release asset. A green Vercel build proved compilation only; it did not prove migrations, provider pricing, wallet reservation, worker authentication, durable task execution, async polling, finalization, or release.

The highest-impact blockers were repaired in this convergence:

1. Non-film missions are no longer rejected for lacking a film deliverable.
2. Organization- and nightlife-specific deliverable inference was removed from the canonical contract.
3. Projects now execute through a medium-aware production graph instead of forcing every project through film shots.
4. Image, audio, website, menu, document, presentation, and multimedia projects now materialize executable tasks.
5. Film projects retain the atomic master-still → QA → image-to-video path.
6. Production lifecycle and finalization are product-aware; non-film projects no longer wait forever for picture finishing and an audio mix.
7. Release policy is selectable per production: automatic after AI quality or final human approval.
8. The Production action derives its output from the selected project instead of defaulting everything to `master_video`.
9. A real end-to-end smoke was added. It composes a mission, starts production, invokes the authenticated worker, polls durable state, and requires completed tasks plus a releasable final deliverable.
10. A GitHub reality workflow now regenerates and commits the canonical npm lockfile, runs clean installation, syntax assertions, architecture assertions, and a production build.

## Why the previous smoke test could not prove production

### 1. The “live mission smoke” stopped after planning

`scripts/creative-live-mission-smoke.sh` called `/api/creative/missions/compose` and validated the returned mission blueprint. It never invoked the director execution endpoint, never materialized production tasks, never called the autonomous worker, never exercised provider selection, wallet reservation, storage ingestion, final rendering, or release.

A passing result therefore meant only: “the AI returned a structurally acceptable mission.” It did not mean production worked.

### 2. The full-scene proof intentionally stopped before video

`scripts/creative-full-scene-master-still-smoke.sh` and `/api/creative/production/autonomous-greenfield-proof` were proof endpoints. Their success contract explicitly kept `video_generation_started: false`. Optional spend generated one master still, not a complete film.

This was useful for validating story-bound image generation, but it was mislabeled when treated as an end-to-end production smoke.

### 3. The production worker had a separate authentication boundary

`/api/creative/worker/autonomous` requires `CRON_SECRET` or `AVANTIQO_INTERNAL_WORKER_SECRET`. A valid user session is not enough. If the Vercel cron secret is missing or mismatched, tasks remain queued even when mission composition and the first synchronous production cycle succeed.

The old smoke never called this endpoint, so it could not detect that failure.

### 4. Required database RPCs may not have been applied

The durable worker uses RPCs introduced by `20260722033000_creative_autonomous_execution.sql`, including task claim, lease, heartbeat, and release functions. Source presence is not database application. If migrations are pending, compilation passes while the worker fails at runtime.

The live smoke now reaches the worker and exposes this immediately.

### 5. The lockfile was stale

`package.json` added `@fal-ai/client` and `ffmpeg-static`, while `package-lock.json` was not updated in the pull request. A clean `npm ci` was therefore not reproducible. Vercel can still show green when its installation path or cache does not reproduce a clean CI install.

The new GitHub workflow regenerates and commits the canonical lockfile before running `npm ci` and the build.

### 6. Provider registration did not guarantee provider availability

Provider execution requires all of the following to agree:

- capability registration;
- runtime loader availability;
- provider pricing rows;
- managed credential availability;
- organization service access;
- wallet balance and reservation;
- a provider response in the expected synchronous or asynchronous shape.

`ProviderResolver` correctly fails when no priced candidate exists. The previous planning smoke never reached this boundary, so provider configuration failures appeared only after production started.

### 7. Build success was not an execution proof

The only reported commit status was Vercel compilation. There was no clean-install CI, migration application proof, worker execution proof, wallet proof, provider proof, or final-asset assertion.

## Architecture failures found

### Critical — non-film missions were explicitly rejected

`app/api/creative/missions/compose/route.js` required at least one `FILM` deliverable and threw `CREATIVE_AI_DIRECTOR_FILM_DELIVERABLE_REQUIRED`. A request for only an image, website, menu, document, audio package, or presentation could never become a valid mission.

Repair: removed the film requirement. Production readiness now requires a valid AI-composed deliverable contract, not a specific medium.

### Critical — the production graph was film-only

`ProductionGraphPlanner` always created a master still and video-shot node for every shot. It had no execution path for website, menu, document, presentation, standalone image, audio, or mixed-media outputs.

Repair: the planner now has two paths:

- film: atomic scene → master still → visual QA → video shot → motion QA;
- universal deliverable: medium-aware text, image, visual QA, or audio nodes driven by the project contract and canonical capabilities.

### Critical — every project entered the film director

The UI posted every selected project to `CreativeDirectorRuntime`, which requires scenes and shots. The mission layer created separate non-film projects, but execution converted them back into a film workflow.

Repair: `/api/creative/director/execute` loads the canonical project. Film projects use the film director. All other project types use `CreativeUniversalProductionRuntime`.

### Critical — non-film lifecycle could never finish

The lifecycle required picture finishing, sound finishing, and final film QA after all production tasks completed. A website or document would therefore remain in `EDITING_AND_AUDIO` forever.

Repair: lifecycle V2 detects the project medium. Non-film outputs become release-ready after their production and medium-specific quality tasks complete. Film retains picture, sound, and full-film QA requirements.

### Critical — finalization was always a film finalization

`CreativeOrchestrationWorker` unconditionally built a post-production package, final render, picture finish, audio production, and final-film QA.

Repair: finalization is product-aware. Non-film work collects durable generated assets and structured outputs as final deliverables and evaluates their quality tasks. Film keeps the full finishing chain.

### High — automatic completion was impossible

`human_release_required` was hardcoded true. Even an approved autonomous production could never become complete without a manual release action.

Repair: each production now has a release policy:

- `AUTOMATIC`: release after AI production and quality contracts pass;
- `MANUAL`: production continues automatically but stops at the final human release gate.

### High — UI forced `master_video`

The Production button defaulted `requestedOutputs` to `["master_video"]`, sent an `industry` field, defaulted duration to 30 seconds, and always displayed a film-oriented success message.

Repair: output, duration, channels, capabilities, and UI label are derived from the selected canonical project. The industry field is not used. Release mode is explicit.

### High — canonical deliverable contract contained industry and organization leakage

The contract recognized nightlife-specific phrases such as DJ, club entry, and bar flair. A generic film could be renamed “Churchill Cinematic Hero Film.” This violated multi-company and industry-neutral architecture.

Repair: medium inference is generic and medium-based. Canonical fallback titles are neutral. No organization name or nightlife phrase participates in the core contract.

### High — text and structured work was mislabeled as image generation

`ProductionRuntime.resolveTaskType` defaulted unknown capabilities to `GENERATE_IMAGE`. Text, website, document, and presentation tasks were semantically incorrect even if the service capability was `ai.text.generate`.

Repair: text, structured output, translation, image, video, image-to-video, lipsync, voice, music, SFX, upscale, quality review, and generic capability task types are resolved explicitly.

### High — existing smoke names overstated their coverage

Mission composition and master-still proof were valuable component tests, but they were treated as release proof.

Repair: `scripts/creative-end-to-end-smoke.sh` is the release smoke. It requires:

- mission creation;
- requested project medium present;
- production tasks materialized;
- authenticated worker execution;
- zero failed tasks;
- durable lifecycle `RELEASE_READY`;
- all tasks completed;
- at least one releasable generated or structured deliverable.

### Medium — queue fairness can still be improved

`ProductionTaskRepository.listRunnableProjects` limits task rows before deduplicating projects. A project with many runnable tasks can consume the row limit and delay other projects.

This does not prevent one smoke project from running, but it is a fleet-scale fairness risk. A future database RPC should return distinct runnable projects ordered by priority and age before applying the project limit.

### Medium — async polling is provider-specific

`ProductionTaskRuntime.poll` directly handles Runway async jobs. Any future async provider that returns a job ID needs a canonical provider polling interface. Otherwise a task can remain `RUNNING` forever.

This should become `ProviderAsyncRuntime.poll(provider, jobId)` with provider adapters, reservation completion, lost-output reconciliation, and idempotent ingestion.

### Medium — universal structured outputs need richer artifact renderers

The repaired runtime produces durable structured website, menu, document, presentation, and multimedia packages. Their final delivery can be expanded into dedicated renderers:

- website source tree, preview deployment, accessibility/performance validation;
- menu print/PDF/digital signage variants;
- DOCX/PDF document rendering;
- PPTX presentation rendering;
- banner/ad variant rasterization;
- multilingual derivatives and publishing adapters.

The execution contract is now capable of reaching those renderers without reverting to film, but each renderer remains a product capability to deepen.

## No-industry contract

The canonical system must not encode restaurant, nightlife, hotel, retail, or any other industry into core Creative execution. Industry knowledge can enter only through organization-scoped business truth, selected references, an explicit mission brief, or an installed solution package. Core runtime decisions are made from:

- deliverable medium;
- formats and channels;
- execution capabilities;
- business truth snapshot;
- reference evidence;
- success criteria;
- quality policy;
- release policy.

No organization name, venue type, or example campaign is allowed to alter canonical runtime behavior.

## Automatic and manual operating model

The repaired baseline supports two release behaviors without changing the production graph:

1. Automatic after AI quality — the durable worker continues production and releases when every required task and quality gate passes.
2. Human approval — the durable worker completes production and quality review, then waits at the release gate.

Deeper manual production controls should build on the same graph: pause project, approve/reject node, edit prompt/specification, regenerate subtree, replace reference, select provider policy, and resume. The current subtree regeneration and budget approval controls already provide part of that foundation.

## Required live validation

Run the canonical gate locally:

```bash
bash scripts/creative-reality-gate.sh
```

Run an actual image smoke:

```bash
CREATIVE_TEST_APP_URL="https://your-preview-or-production-url" \
CREATIVE_TEST_ORGANIZATION_ID="your-organization-id" \
CREATIVE_TEST_COOKIE="your-authenticated-cookie" \
CREATIVE_TEST_WORKER_SECRET="your-worker-secret" \
CREATIVE_TEST_MEDIUM="IMAGE" \
CREATIVE_TEST_REQUEST="Create one original premium key visual grounded in this organization and its approved references." \
bash scripts/creative-end-to-end-smoke.sh
```

Repeat for `FILM`, `WEBSITE`, `MENU`, `AUDIO`, `DOCUMENT`, `PRESENTATION`, and `MULTIMEDIA`.

A smoke is valid only when it reaches `RELEASE_READY`, every durable task is complete, there are no failed tasks, and at least one final deliverable is present. Mission JSON, a storyboard, a queued status, or a single master still is not an end-to-end pass.

## Release decision

Before this convergence: **NO-GO**. The branch was a sophisticated film proof and component collection, not a universal end-to-end studio.

After source convergence: **CONDITIONAL GO FOR LIVE VALIDATION**. The architectural blockers are repaired in source. Merge remains blocked until the GitHub reality workflow confirms canonical lockfile, clean install, syntax assertions, and build, and the authenticated end-to-end smoke passes against the deployed environment with current migrations, provider pricing, credentials, wallet balance, storage, and worker secret.
