# Avantiqo Creative Studio World-Class Forensic Audit

Date: 2026-07-26  
Branch: `agent/creative-forensic-smoke-hardening`  
Scope: Creative intake, asset intelligence, direction, story, shot planning, provider execution, post-production, quality, release, publishing, wallet settlement and medium neutrality.

## Executive verdict

**LIVE WORLD-CLASS SMOKE APPROVAL: BLOCKED**

The current repository contains a credible video-production backbone: authenticated mission creation, durable mission/project/brief state, production graphs, provider execution, asynchronous polling, generated-asset lineage, semantic timeline composition, FFmpeg rendering, technical checks, release approvals, idempotent publishing and wallet/billing evidence.

It is not yet honest to claim that the Creative Studio can autonomously produce any requested creative output at a world-class standard or that generated work cannot be recognised as AI-generated.

The main remaining risk is not simply provider quality. It is the contract between intelligence and execution. The Studio can currently accept broad intent and produce files, but it does not yet guarantee that every selected customer asset is understood and accounted for, every shot is directed at frame-transition level, every medium has a real execution runtime, every aesthetic failure is detected, or every live dependency has been proven in the connected environment.

A production build, CI pass, preview deployment, generated file, technical FFmpeg pass or mocked provider response is not sufficient release evidence.

## Forensic readiness by layer

| Layer | Current state | Verdict |
|---|---|---|
| Authentication and organization scope | Organization-scoped authenticated commands exist | Strong source foundation |
| Mission/project/brief lifecycle | Durable identifiers and migration hardening exist | Strong source foundation; live migration still must be verified |
| Natural-language intake | One-command create route exists | Partial; intent quality and selected assets are not durably guaranteed on resume |
| Business and brand intelligence | Present but shallow and generic | Blocked for autonomous agency quality |
| Asset upload | Functional image-oriented path | Blocked for mixed-media, privacy and file-fidelity claims |
| Asset understanding | Basic visual analysis exists | Blocked for continuity, suitability, rights and direct-use versus reference decisions |
| Strategy and concept | Provider-backed master plan exists | Blocked by silent generic fallback and insufficient validation |
| Story architecture | Scenes and shots are materialised | Partial; generic one-shot fallback can still produce montage-like work |
| Shot and frame direction | Camera and lighting fields exist | Blocked; opening, progression, closing, continuity and provider-ready negative constraints are not mandatory |
| Asset assignment | Reuse engine and graph assets exist | Blocked; semantic compatibility and explicit disposition are not proven |
| Production graph | Real graph and tasks exist | Strong for current AI media capabilities |
| Provider execution | Service Runtime, wallet and asynchronous settlement exist | Must be proven with live credentials and real jobs |
| Video post-production | Semantic moments, EDL, FFmpeg render and release flow exist | Strong source foundation; live FFmpeg/storage proof required |
| Technical QC | Stream, render and signal checks exist | Useful but insufficient alone |
| Aesthetic/perceptual QC | Named runtime exists | Blocked; current checks primarily detect black, freeze, silence and loudness rather than story, acting, anatomy, identity, art direction or AI artefacts |
| Bounded repair | Render repair framework exists | Partial; shot-level semantic repair must be proven without full rerender |
| Rights/identity/release | Evidence propagation and gates exist | Must be proven with real assets, consent and publication |
| Publishing | Authenticated, resumable and idempotent connector path exists | Live external publication evidence required |
| Wallet/billing | Reservation, usage, charge and billing evidence are designed | Live no-duplicate settlement proof required |
| Website/app/document output | Mentioned by planning language | Blocked; no equivalent build, preview, test, accessibility and deployment runtime is connected end to end |
| Industry neutrality | Intended by architecture | Blocked by remaining hospitality-specific asset classification and generic format defaults |

## Confirmed strengths

1. The create command now preserves mission, project and brief identity and enters the canonical director pipeline.
2. The production queue blocks failed or skipped dependencies rather than treating them as completed work.
3. Provider jobs can remain asynchronous and be polled without recreating the original task.
4. Generated assets retain task, scene, shot, provider, usage, billing, rights, consent and identity evidence.
5. Generated video assets are converted into temporal clips and semantic moments before timeline composition.
6. The EDL renderer, export-profile resolver, technical QC, release gate, approval and readiness layers are connected.
7. Publishing is authenticated, resumable and idempotent, and completion requires external evidence.
8. The release smoke records mission, project, render, readiness, publication and settlement evidence.
9. Creative project and state migrations have been hardened against legacy duplicates and invalid archived values.

These strengths make the system worth converging rather than replacing.

## Critical release blockers

### P0 — Live environment proof is still absent

Source convergence cannot verify:

- active Avantiqo-managed provider credentials
- provider capability routing and real asynchronous jobs
- applied linked Supabase migrations
- creative storage bucket permissions and persistence
- FFmpeg and ffprobe availability in the execution environment
- real render materialisation and upload
- wallet reserve, charge, release and billing settlement
- authenticated external publication
- retry behaviour after provider, storage or connector failure

**Required evidence:** one complete live run plus deliberate failure and resume runs, with direct database and external-publication evidence.

### P0 — The system is not operationally medium-neutral

The master-plan language says film, image, audio, document, menu, presentation, website and mixed media. The executable production and post-production path is still primarily a temporal video path. Post-production explicitly waits for video assets. The service catalogue and task resolver do not provide complete website, application, document-layout, presentation, static-campaign or deployable-software build chains.

A request for a website or app must not be forced into scenes and `ai.video.generate`, and must not return success merely because a concept document exists.

**Required architecture:** resolve a `workflow_kind` and dispatch to a registered execution runtime:

- `TEMPORAL`: film, animation, audio-visual, trailers, social cuts
- `STILL`: image, poster, banner, menu visual, campaign key art
- `DOCUMENT`: menu, brochure, report, presentation, printable collateral
- `INTERACTIVE`: landing page, website, web experience
- `SOFTWARE`: application or product build
- `AUDIO`: voice, music, podcast, sonic identity
- `CAMPAIGN_SYSTEM`: coordinated multi-medium output graph

Unsupported workflow kinds must fail clearly. They must never silently fall back to video or image generation.

### P0 — Asset intake is not mixed-media safe

The existing upload path forces a `.png` path and `image/png`, uses overwrite semantics and returns a public URL. This breaks file fidelity for video, audio, PDF, SVG, design and source files and creates privacy and rights risks for customer assets.

**Required repair:** preserve original extension and MIME type, use collision-safe storage paths, reject unsupported/unsafe files through configuration, inspect media technically, use private storage or controlled signed access, retain checksum and source metadata, and create an asset graph node immediately.

### P0 — Asset understanding is too shallow

The current analysis records a description, tags, style, mood, lighting, objects and suggested uses. It does not make the production decisions needed for reliable output:

- exact visible-subject and object inventory
- identity, product, location, wardrobe and prop continuity anchors
- direct-use versus visual-reference versus regeneration disposition
- crop and safe-area guidance by aspect ratio
- quality defects and repairability
- visible text and logo confidence
- motion and audio characteristics for video
- rights, consent, claims, privacy and brand risks
- suitability and incompatibility for each requested shot
- confidence and evidence for every decision

Fallback analysis is currently generic and can be mistaken for real understanding.

**Required behaviour:** unverified analysis must be marked `UNVERIFIED`, confidence must be conservative, and production must either obtain valid analysis or explicitly route the asset as an untrusted reference.

### P0 — Selected assets can be silently ignored

The create route can receive `assets`, but the canonical pipeline resolves project-linked assets from storage. A resume command may not receive the original body assets. Unless selection is durably attached to the project/brief and the asset is organization-validated, the customer can select a person, product or venue and the production may proceed without it.

**Required contract:** every selected asset receives one explicit manifest disposition:

- `ASSIGNED`
- `REFERENCE`
- `REGENERATE`
- `EXCLUDE`

Each disposition requires evidence, confidence, restrictions and scene/shot assignments. A selected asset missing from the manifest is a hard planning failure.

### P0 — Asset reuse is not semantically safe

The reuse engine currently looks up reusable assets by broad type and tags and selects the first candidate. That is insufficient for person identity, product version, location, wardrobe, rights, aspect ratio, quality, lighting, camera, emotional beat or continuity.

**Required matching:** hard constraints first, then weighted semantic fit. Identity, consent, product and rights mismatches must be disqualifying. Reuse must preserve why the asset matched and who approved it for reuse.

### P0 — Direction can silently degrade into generic content

The master-plan runtime catches provider or parsing failure and creates a generic fallback with broad scene descriptions and one generated-video shot per scene. This allows a smoke test to produce a technically valid but creatively weak film.

**Required behaviour:** production-grade creative direction is fail-closed by default. A fallback may be allowed only in an explicit development mode and must mark the run `DEGRADED`, prevent release approval and remain visible in smoke evidence.

### P0 — Story validation is insufficient

The system does not currently enforce that the story has:

- a specific hook in the first visible beat
- a clear audience tension, desire or contradiction
- escalation or progressive revelation
- observable proof rather than claims
- surprise, humour, turn or emotional consequence when appropriate
- a resolution earned by prior action
- an integrated call to action
- anti-cliché and anti-montage logic
- cultural and brand specificity
- shot-by-shot new information

A list of attractive scenes is not a story.

**Required validator:** reject plans with repeated objectives, filler shots, generic montage sequencing, unearned calls to action, no escalation, no transition logic or scenes that do not alter story state.

### P0 — Every shot is not yet directed at frame-transition level

Existing fields cover purpose, duration, camera, lighting, actors, products, location and audio elements. They do not mandate all information a temporal generator needs.

Every shot contract must contain:

- subject and exact visible action
- starting state and opening frame
- action progression over time
- ending state and closing frame
- performance and micro-behaviour
- framing, angle, lens intent and camera distance
- movement path, speed, stabilization and motivation
- focus target and focus transition
- lighting source, direction, contrast, colour and exposure intent
- production design, environment, wardrobe, props and texture
- identity/product/location continuity anchors
- screen direction, eyelines, handedness and spatial geography
- dialogue, narration, source sound, SFX, music and silence
- title, subtitle, logo and overlay instructions
- VFX and invisible cleanup requirements
- transition-in and transition-out logic
- reference asset IDs and their roles
- negative constraints and known generator failure modes
- provider-ready prompt and output specification
- minimum quality and repair instructions

Generated typography must not be trusted inside image or video pixels. Verified text belongs in the post-production or layout system.

### P0 — Current perceptual QC is not a world-class creative review

The perceptual runtime currently uses FFmpeg to detect black frames, freezes, silence, loudness and true peak. These are valuable technical signal checks, but they do not determine whether work looks synthetic or creatively weak.

A world-class quality director must review sampled frames, clips, audio and the complete edit for:

- identity and product continuity
- anatomy, hands, faces and object integrity
- physics, contact, reflections, shadows and object permanence
- camera plausibility and motion cadence
- performance authenticity and lip synchronisation
- production design and environmental coherence
- generated-text artefacts
- exposure, colour, texture and compression consistency
- shot purpose and narrative progression
- pacing, transitions and emotional arc
- music, sound design, mix hierarchy and silence
- brand truth, claims and cultural fit
- accessibility, subtitles, contrast and safe areas
- channel and aspect-ratio composition
- detectable AI patterns and repetitive model signatures

The reviewer must return evidence, confidence, failed checks and bounded shot-level repair instructions.

### P0 — The smoke test is too narrow

The current release smoke primarily validates one video path. Publication is optional, direct database evidence is optional when service credentials are absent, fallback direction is not a hard failure, selected-asset accountability is not validated and visual-quality assertions do not prove aesthetic quality.

The smoke must fail rather than skip when a release claim requires evidence.

## High-priority hardcoding and generic-default findings

1. Production task cost defaults to `USD` instead of resolving organization or service-pricing currency.
2. Mission startup installs video-only export profiles and a landscape default even for non-video intent.
3. Shot documents inject `Medium`, `Static`, `35mm`, `Eye Level`, `Natural` and `Soft` defaults, which can overwrite missing creative judgement with generic direction.
4. Asset upload forces PNG regardless of actual file.
5. Asset analysis pins a provider/model instead of using capability resolution.
6. Asset classification contains hospitality-specific `venue`, `staff`, `cocktail`, `food` and `interior` branches.
7. Business analysis invents generic audiences such as existing and potential customers.
8. Business analysis recommends image, video and document regardless of the request.
9. Unknown production task types fall back to image generation.
10. Master-plan fallback creates generated-video shots regardless of requested medium.
11. The video renderer defaults to the first target channel rather than resolving a complete deliverable graph.

Configuration defaults can exist, but they must be editable organization/workflow data and must never masquerade as creative decisions.

## Dynamic agency worker model

A world-class Studio should not be one large prompt. It should select accountable roles from the resolved workflow and require structured outputs from each role. A dynamic registry has been introduced on this audit branch for these roles:

- Executive Creative Director
- Strategy Director
- Brand Director
- Story Director
- Film Director
- Art Director
- Director of Photography
- Asset Intelligence Director
- Production Director
- Editor
- Sound Director
- Motion Design Director
- VFX Director
- Experience Director
- Technical Architect
- Quality Director
- Rights and Safety Director
- Release Director
- Performance Director

Every active role must return:

- decision
- evidence
- confidence
- risks
- repair instructions
- `ACTIVE` or `NOT_REQUIRED`

Providers are execution workers. Avantiqo owns creative and release decisions.

## Required output graph

The primary plan must be an output graph rather than an industry template. Each output node needs:

- workflow kind
- deliverable type and variant role
- dimensions, duration or page/build constraints
- language, locale and accessibility requirements
- source and reference assets
- production dependencies
- provider capability requirements
- cost and approval policy
- quality gates
- rights and release requirements
- delivery or publication target
- measurement contract

A coordinated campaign may create a film master, social cuts, poster, menu insert, landing page, email, display assets and analytics plan from one shared strategy and asset/continuity system.

## Mandatory smoke matrix

A release is not approved until the following produce real persisted outputs without manual database intervention.

### Success cases

1. Text-only 30-second vertical campaign film with no uploaded assets.
2. Asset-first 60-second landscape brand film from mixed image and video uploads.
3. Person-reference film preserving identity, wardrobe and consent evidence.
4. Product film preserving exact product geometry, label and colour.
5. Location-reference film preserving architecture and spatial identity.
6. Artist or event promotion with licensed/reference music, titles, subtitles and rights evidence.
7. Multilingual variants with subtitle timing, typography, overflow and layout validation.
8. Multi-output campaign: film, poster, social variants and landing page from one brief.
9. Static key art and poster without entering the video post-production path.
10. Menu, brochure or presentation with verified text and print/export evidence.
11. Landing page with responsive preview, accessibility checks and deployable build evidence.
12. Application prototype with architecture, tests, security checks and build evidence.

### Failure and recovery cases

13. Unsupported file, corrupt media and unsafe file rejection.
14. Selected asset belongs to another organization.
15. Asset analysis unavailable or returns invalid JSON.
16. Creative-direction provider unavailable or returns a generic/invalid plan.
17. Insufficient wallet before an expensive task.
18. Provider submission succeeds but asynchronous polling initially remains pending.
19. Provider job fails and dependent tasks remain blocked.
20. Storage upload fails after provider completion and safely resumes without duplicate generation or charge.
21. Deliberately low-quality shot triggers shot-level repair without rerendering the entire production.
22. Identity/product continuity failure triggers targeted regeneration.
23. Release approval denied and later approved without duplicate render or publication.
24. Connector timeout after external publication is reconciled without publishing twice.
25. Duplicate create, execute, poll, approve and publish commands remain idempotent.
26. Process restart resumes from the last durable state.

## Required evidence for every smoke run

- authenticated user, organization and permissions
- mission, project and brief IDs
- selected asset IDs and immutable asset manifest
- technical and intelligence inspection for each source asset
- research, strategy, specialist decisions and concept
- story validation report
- storyboard, scenes, detailed shots and frame plans
- continuity bible
- production graph and dependency validation
- tasks, provider submissions and polling evidence
- usage, pricing, wallet reservation, charge/release and billing evidence
- generated/reused asset lineage and checksums
- semantic moments and EDL or equivalent medium-specific composition evidence
- export/build profile and executable command outcome
- technical QC
- visual/aesthetic/narrative/accessibility QC
- repair attempts, repaired scope and stop reason
- rights, identity, claims, consent and release report
- approval identity and timestamps
- external publication ID/URL or explicit delivery artefact
- no duplicate expensive task, charge, render or publication after retry

## Release gates

### Gate A — Source integrity

- production build passes
- migrations are deterministic and forward-safe
- no unsupported workflow silently falls back
- no selected asset can be ignored
- no generic direction fallback can reach release approval
- no jurisdiction, currency, industry or provider business value is embedded as a runtime truth

### Gate B — Connected environment

- linked migrations confirmed
- provider credentials healthy
- storage permissions and signed access verified
- FFmpeg/ffprobe verified
- wallet funded and service pricing active
- connector target authenticated

### Gate C — Creative direction

- master plan from live reasoning provider
- all required specialist roles accounted for
- story validator passes
- every shot contract is complete
- every selected asset has a manifest disposition
- continuity bible exists

### Gate D — Production and quality

- all dependencies complete
- no missing provider evidence
- output technically valid
- visual and narrative quality review passes
- no unresolved identity, product, anatomy, physics, typography, rights or accessibility failures
- bounded repairs remain within configured attempts

### Gate E — Release and settlement

- human approval where policy requires it
- release readiness passes
- external delivery/publication evidence exists
- wallet and billing settle exactly once
- duplicate execution reuses the same durable result

## What can be claimed today

The repository has a substantial, converging video-production architecture and a credible source-level release chain. It is suitable for a controlled connected smoke **only after the P0 fail-closed direction and asset-accountability checks are applied and the required live environment is configured**.

It is not yet suitable for the claims:

- fully autonomous world-class agency
- any creative medium end to end
- websites and applications built and deployed from the same runtime
- guaranteed indistinguishable-from-human output
- production-ready based only on CI or a single generated film

No system can honestly guarantee that no viewer will ever identify AI involvement. The defensible standard is measurable production quality: authentic performance, specific art direction, continuity, verified typography, physical credibility, strong story, expert review, bounded repair and transparent evidence. The goal should be that AI artefacts are not accepted, not that an unverifiable guarantee is printed.

## Required next convergence wave

1. Make creative direction fail-closed and validate the complete direction contract.
2. Persist selected assets and require an explicit asset manifest.
3. Replace image-only upload with private mixed-media intake and technical inspection.
4. Expand asset intelligence to continuity, suitability, rights and regeneration decisions.
5. Pass complete shot/frame/provider instructions into every production task.
6. Replace first-match asset reuse with constrained semantic matching.
7. Add real visual/aesthetic quality review and targeted repair.
8. Add workflow registry and real runtimes for still, document, interactive, software and audio outputs.
9. Harden smoke assertions and execute the full success/failure matrix.
10. Do not approve production until a real external release and exactly-once financial settlement are evidenced.
