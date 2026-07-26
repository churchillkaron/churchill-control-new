# Avantiqo Creative Studio Forensic Audit

Date: 2026-07-25
Branch: `agent/creative-studio-forensic-convergence`
Baseline: `main` at `3bc56989d2aea5b37c97ce53f2bb6f18dd517a84`

## Executive verdict

The current Creative Studio is not yet honestly end-to-end. It contains strong specialist subsystems for asset intelligence, provider-backed production, semantic timelines, FFmpeg rendering, technical and perceptual quality control, release approval, connector publishing, wallet charging, and evidence capture. Those systems are split across parallel orchestration paths and were not connected by one reliable mission lifecycle.

The primary failure mode was not insufficient UI. It was contradictory runtime and persistence contracts. Ordinary page loading could execute timeline composition and throw before assets existed; the worker API called a method the worker did not expose; the director created an empty storyboard and immediately required persisted scenes and shots; state locks queried an undefined identity; failed tasks unblocked dependants; and several document factories wrote different field names than their repositories queried.

## Confirmed critical defects

1. `CreativeOrchestrationWorker` returned `skipped` for every task while its API called `runProject`.
2. `CreativeStateEngine` built `creative_mission_id` but queried `project_id` for set, complete, acquire-lock and release-lock.
3. `CreativeStudioRuntime` called `ResearchRuntime.resolve`, which did not exist.
4. `CreativeTimelineRuntime.resolve` created a timeline during read-only page resolution and threw `SEMANTIC_MOMENTS_REQUIRED` on new projects.
5. `CreativePipelineOrchestrator` created an empty storyboard, then required persisted scenes and shots without creating them.
6. Scene, shot and concept runtimes referenced undefined repository symbols.
7. The shot document used `project_id`, omitted `scene_id`, and replaced detailed direction with generic defaults while the repository queried `creative_project_id` and `scene_id`.
8. Research documents used `project_id`/`brief_id` and omitted `organization_id`, while the repository required organization and creative-project scope.
9. Failed or skipped tasks counted as completed dependencies, allowing incomplete productions to continue toward render or publication.
10. The old rendering provider router always threw `Provider router not implemented`, while the working FFmpeg EDL renderer lived in a separate post-production subsystem.
11. The main director pipeline stopped at production review and did not invoke semantic composition, final render, release gates, repair loops or authenticated connector publishing.
12. Mission start initialized state only; it did not guarantee a project and brief existed.
13. Generated task assets were not automatically converted into semantic moments, so the timeline composer could not assemble them.
14. The project repository and state repository both targeted `creative_project_state`, conflating project documents with execution state. This requires a live-schema migration decision before it is safe to repair.
15. The UI did not implement a true free-text create command. It exposed mission prompt/start/assets and a pipeline button that ignored non-2xx response bodies.

## Repairs applied in this branch

- Repaired mission-state identity, transitions and execution lock lifecycle.
- Completed scene, shot and concept runtime/repository contracts.
- Preserved dynamic shot direction and canonical project/scene identifiers.
- Restored organization-scoped research document persistence and read resolution.
- Made timeline resolution read-only; composition remains an explicit command.
- Blocked downstream tasks when any dependency fails or is skipped.
- Connected the orchestration worker to the canonical director runtime.

## Required convergence before production approval

### One command lifecycle

A single authenticated command must accept a natural-language brief and perform, idempotently:

`intent -> mission -> project -> brief -> business/brand research -> strategy -> concepts -> approval policy -> storyboard -> scenes -> shots -> asset assignment/generation -> production graph -> tasks -> provider execution -> semantic moments -> timeline -> sound/voice/music/subtitles/overlays -> draft render -> technical QC -> perceptual/brand QC -> bounded scene repair -> final render -> rights/identity/release gate -> approval -> publish command -> connector execution -> monitoring -> learning`.

The command must resume from the last durable stage after a retry. It must never recreate successful expensive work, publish without evidence, or continue after a failed dependency.

### Dynamic agency team

The system needs role capabilities selected from the brief rather than one monolithic prompt:

- Executive Creative Director: owns the creative thesis and final quality bar.
- Strategy Director: audience, market, competitors, positioning and channel role.
- Brand Director: identity, tone, product truth, continuity and legal brand rules.
- Film Director: performance, blocking, scene purpose, visual storytelling and emotional arc.
- Art Director: production design, wardrobe, colour, typography, composition and campaign system.
- Director of Photography: lenses, movement, exposure, lighting, framing and shot continuity.
- Story/Script Director: narrative structure, dialogue, humour, pacing and calls to action.
- Casting/Identity Director: people, likeness, consent, continuity and demographic authenticity.
- Asset Intelligence Director: inspect, classify, score, match, reuse, derive and regenerate missing assets.
- Production Director: graph, dependencies, cost, provider capability and scheduling.
- Editor: selects moments, pacing, transitions, variants and platform cuts.
- Sound Director: source sound, voice, music, SFX, mix and loudness.
- Motion/Design Director: titles, graphics, logos, supers, menus, documents and web motion.
- VFX/Compositing Director: cleanup, integration, continuity and realism.
- Quality Director: technical, perceptual, brand, narrative, accessibility and channel QC.
- Rights/Safety Director: licensing, identity, claims, policy and release evidence.
- Release Director: export profiles, approvals, authenticated publishing and delivery evidence.
- Performance Director: measurement, learning and controlled iteration.

Each role must return structured decisions, evidence, confidence, risks and repair instructions. Providers remain workers; Avantiqo owns decisions.

### Medium-neutral output architecture

The brief must resolve an output graph, not an industry template. The same command plane must support video, image, audio, campaign systems, menus, posters, presentations, documents, landing pages, full websites and future formats. Industry knowledge is configuration and research context, never hardcoded workflow branching.

## Mandatory smoke matrix

A release is not accepted until all cases create real persisted output with no manual database intervention:

1. Text-only 30-second vertical campaign video, no uploaded assets.
2. Asset-first 60-second landscape brand film from mixed image/video uploads.
3. Restaurant event campaign: film, poster, menu insert and social variants.
4. Construction company case-study film with factual claims and project images.
5. Artist/event promotion with music, titles, subtitles and rights evidence.
6. Retail product launch with product continuity across generated scenes.
7. Professional-services campaign without people or industry clichés.
8. Multilingual campaign variants with subtitle and layout validation.
9. Website/landing-page output from the same free-text brief.
10. Provider failure, insufficient wallet, asynchronous completion, retry and resume.
11. Deliberate low-quality shot triggering bounded repair without rerendering the whole production.
12. Publish approval denial and later approval without duplicate external publication.

## Evidence required per smoke run

- authenticated organization and user
- mission, project and brief IDs
- immutable stage transition log
- research/strategy/concept/storyboard/scene/shot records
- source asset inspections and assignment evidence
- production graph and dependency validation
- task/provider/usage/pricing/wallet/billing evidence
- generated and reused asset lineage
- semantic moments and EDL
- export profile and FFmpeg command outcome
- technical and perceptual QC scores
- repair attempts and stop reason
- rights/identity/release report and approval
- external publication ID/URL or explicit delivery artifact
- no duplicate charges, tasks, renders or publications after retry

## Production approval status

**Blocked.** The branch repairs deterministic foundation failures, but production approval still requires:

- a verified canonical project table/schema migration
- one orchestration lifecycle that persists concepts/scenes/shots automatically
- generated-media-to-moment conversion
- explicit edit/render/QC/repair/release/publish stages
- a free-text command surface
- authenticated live smoke evidence across at least the mandatory failure and success cases

A compile, deployment, static audit, empty database response or mocked provider response is not end-to-end evidence.
