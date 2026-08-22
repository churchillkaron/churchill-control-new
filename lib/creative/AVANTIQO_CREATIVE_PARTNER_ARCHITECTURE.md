# AVANTIQO CREATIVE PARTNER ARCHITECTURE

Status: CANONICAL
Owner: Avantiqo Creative Domain
Source of truth: `main`

## Product goal

Avantiqo Studio is not a collection of generators. It is an autonomous business and creative partner that owns a mission from business intent to release-grade outcome.

A user should be able to discuss a goal with one Creative Partner, approve only genuinely human decisions, and expect the Studio to direct, produce, inspect, repair, assemble and release the work without manual provider management or repeated "continue" instructions.

The canonical interaction is:

USER
-> AVANTIQO CREATIVE PARTNER
-> DIRECTORS
-> SPECIALIST WORKERS / OWNED ENGINES
-> QUALITY + REPAIR
-> RELEASE
-> OUTCOME LEARNING

## Non-negotiable product rules

1. Studio is the only user-facing creative production surface. Image, video, audio, voice and code engines are internal production capabilities, not separate user workflows.
2. The Creative Partner owns the mission until release criteria pass or a genuine human-only decision is required.
3. Provider failures, retries, queue failures, rendering failures, weak generations and bounded repairs are internal Studio responsibilities.
4. Directors decide what must be achieved. Engines execute bounded production tasks. Engines never become alternate directors.
5. The Creative Master Plan remains the single production-intent authority.
6. Approved assets and approved sections are preserved. Repair is selective: KEEP, REPAIR, REGENERATE, COMPOSITE, REASSEMBLE or RELEASE.
7. A weak shot, section, component or audio region is repaired in place whenever possible; approved work is not blindly regenerated.
8. Quality review is mandatory and release remains fail-closed.
9. Conversation is persistent to the mission. User revisions change the active mission state rather than creating unrelated prompts.
10. Prompt text is never source of truth. Structured specifications are canonical; provider prompts exist only at the transport boundary.
11. All execution remains organization-scoped and governed through Avantiqo Service Runtime, wallet, usage, pricing, billing, credentials and release evidence.
12. Main is the sole source of truth for this architecture.

## Owned-first AI architecture

Avantiqo should be capable of operating the Studio without a required dependency on OpenAI, Google, Runway, Suno, FAL or another AI gateway.

Foundation models may be open-weight or otherwise legally self-hostable. Avantiqo owns the product intelligence, orchestration, inference control, organization context, memory, quality system, repair system, pricing and user experience.

GPU infrastructure is replaceable infrastructure, not the product intelligence layer.

Canonical policy:

OWNED_FIRST
-> benchmark owned engine
-> use owned engine when release threshold is met
-> allow an external specialist only when it materially improves the mission outcome or provides a capability not yet owned
-> continuously remove those exceptions as Avantiqo engines reach the threshold

External providers are optional specialist/fallback workers. They are never architectural dependencies and are never selected directly by the user-facing Studio.

## Canonical owned engine family

### Avantiqo Intelligence

Role: brain, partner, reasoning, directors, mission conversation, planning, tool choice, orchestration, critique and repair decisions.

Provider family: `avantiqo-intelligence`

Core capabilities:
- `ai.reasoning.execute`
- `ai.text.generate`

Rules:
- raw chain-of-thought/reasoning is never persisted or exposed
- structured decisions and tool calls are allowed
- organization context and governed usage are required

### Avantiqo Image

Role: still-image production and repair.

Provider family: `avantiqo-image`

Target capabilities:
- `ai.image.generate`
- `ai.image.edit`
- `ai.image.inpaint`
- `ai.image.outpaint`
- `ai.image.upscale`
- `ai.image.analyze`

Required behavior:
- source-faithful logos/products/identity when locked
- local repair instead of whole-image regeneration when appropriate
- deterministic/reproducible generation controls where supported

### Avantiqo Cinema

Role: moving-image generation, transformation, VFX, understanding and bounded repair.

Provider family: `avantiqo-video`

The three primary creation/translation modes are non-negotiable:
- TEXT -> VIDEO through `ai.video.generate`
- IMAGE -> VIDEO through `ai.video.image_to_video`
- VIDEO -> VIDEO through `ai.video.video_to_video`

Full target capability family:
- `ai.video.generate` - create a shot from structured direction / text transport instruction
- `ai.video.image_to_video` - animate one or more approved still/reference frames
- `ai.video.video_to_video` - transform or regenerate an existing moving shot while preserving selected temporal truth
- `ai.video.keyframe_to_video` - generate motion constrained by first/last or multiple approved keyframes
- `ai.video.edit` - bounded semantic/appearance repair of existing footage
- `ai.video.inpaint` - temporally coherent masked replacement/removal/insertion
- `ai.video.outpaint` - extend/reframe the visible canvas while preserving original picture truth
- `ai.video.extend` - continue a shot temporally before or after approved footage
- `ai.video.motion_transfer` - preserve or transfer approved movement/camera/performance motion to a regenerated result
- `ai.video.relight` - alter lighting while preserving approved scene/performance geometry where possible
- `ai.video.restore` - denoise, deartifact, sharpen or recover degraded footage without creative reinvention
- `ai.video.upscale` - resolution enhancement after creative approval
- `ai.video.interpolate` - create temporally coherent intermediate frames / controlled frame-rate or slow-motion conversion
- `ai.video.lipsync` - align approved speech/voice to approved performance footage
- `ai.video.analyze` - understand shots, temporal regions, continuity anchors, defects and repair candidates

Required behavior:
- shot-level generation and repair
- first/last-frame and multi-keyframe continuity controls
- identity/product/logo/wardrobe/environment continuity
- motion/performance preservation when repairing existing footage
- temporal inpainting and object insertion/removal/replacement
- bounded region repair instead of whole-shot regeneration whenever possible
- deterministic/reproducible controls where the selected worker supports them
- source-time preservation for repair tasks unless the Director explicitly changes timing
- ability to preserve approved audio when picture-only repair is requested
- selective regeneration rather than blind full-film regeneration

#### Cinema job control contract

The capability identifies the worker class. Detailed creative control belongs in the structured job specification rather than being split into dozens of provider services.

The Cinema contract should be able to express, when applicable:
- `identity_lock`
- `product_lock`
- `logo_lock`
- `wardrobe_lock`
- `environment_lock`
- `motion_lock`
- `performance_lock`
- `camera_specification`
- `lighting_specification`
- `shot_specification`
- `first_frame`
- `last_frame`
- `keyframes`
- `reference_images`
- `reference_video`
- `mask` / temporal masks
- pose/depth/edge/control guidance where supported
- `preserve_regions`
- `repair_regions`
- source timecode / temporal range
- target duration and timing lock
- seed / reproducibility controls
- aspect ratio / resolution / frame rate
- quality profile

These controls must be source-faithful. A lock means preserve, not merely "use as inspiration".

#### Existing-film regeneration contract

A supplied film is never treated as one giant generation request.

The Studio must:
1. ingest the master and preserve the original immutable source
2. analyze/decompose the film into scenes, shots, audio regions and overlays
3. identify continuity anchors: people, products, logos, environments, wardrobe, dialogue, timing and approved graphic systems
4. score each region and classify it as KEEP, REPAIR, REGENERATE, COMPOSITE, REASSEMBLE or RELEASE
5. execute only the bounded work required
6. reassemble against the approved timeline
7. run perceptual, identity, brand, story, audio and technical quality review
8. repeat bounded repair until release criteria pass or a genuine human decision is required

A supplied one-minute film therefore remains a one-minute project unless the Director intentionally changes the story/timing. Good footage is an asset to preserve, not raw material to destroy.

#### Deterministic finishing plane

Not every film operation should call a generative model. Avantiqo Cinema must also cooperate with deterministic finishing workers for:
- scene/shot boundary detection and timecode mapping
- frame/audio extraction
- trimming and timeline assembly
- compositing and alpha overlays
- verified logo/UI/title rendering outside generated pixels
- subtitle/caption rendering
- audio mux/demux
- color management and technical normalization
- encode/transcode/export profiles
- delivery validation

These are production workers behind Studio, not separate user-facing tools. Generative AI is used only where it is the right production technique.

### Avantiqo Audio

Role: soundtrack production, music, SFX, ambience, repair, mixing and mastering.

Provider family: `avantiqo-audio`

Target capabilities:
- `ai.audio.generate`
- `ai.music.generate`
- `ai.sfx.generate`
- `ai.audio.edit`
- `ai.audio.extend`
- `ai.audio.remix`
- `ai.audio.stems`
- `ai.audio.mix`
- `ai.audio.master`

Required behavior:
- timeline-aware scoring to exact picture timing
- preserve approved soundtrack regions
- repair bounded time ranges instead of regenerating full masters
- support dialogue/music/SFX hierarchy and final mastering

### Avantiqo Voice

Role: governed speech and voice identity production.

Provider family: `avantiqo-voice`

Target capabilities:
- `ai.voice.generate`
- `ai.text.to.speech`
- `ai.voice.dub`
- `ai.voice.repair`

Required behavior:
- explicit rights/consent governance for voice identity
- multilingual continuity where authorized
- lip-sync coordination through the temporal production plan

### Avantiqo Code

Role: websites, apps, components, APIs, integrations, debugging, testing and repair.

Provider family: `avantiqo-code`

Target capabilities:
- `ai.code.generate`
- `ai.code.edit`
- `ai.code.refactor`
- `ai.code.review`
- `ai.code.debug`
- `ai.code.test`
- `ai.code.execute`
- `ai.web.build`
- `ai.web.repair`
- `ai.app.build`
- `ai.integration.build`

Rules:
- Code is a worker, not the director.
- Experience Director, Art Director, Copy Director, Brand Director and Technical Architect decide the product before bounded code execution.
- Existing working integrations and approved components are preserved unless the plan explicitly replaces them.
- Build, tests, security checks, visual review and release gates are part of the same mission.
- Website Builder, App Builder and Webshop Builder remain Studio consumers, not independent AI architectures.

## Creative Partner responsibilities

The Creative Partner is the single conversational owner of the mission.

It must:
- understand business outcome before media choice
- maintain mission state and approved decisions across conversation
- invoke the right directors dynamically
- build and maintain the production dependency graph
- choose capabilities, not vendor brands
- protect approved assets and continuity anchors
- manage cost and wallet constraints
- monitor execution
- diagnose failures
- dispatch bounded repair automatically
- compare alternatives when useful
- ask the user only for decisions that cannot be safely inferred or executed internally
- present release-ready work, not raw provider output

## Agency operating model

The existing Creative Agency roles remain the professional decision layer. They may include Executive Creative Director, Strategy Director, Brand Director, Copy Director, Story Director, Film Director, Talent/Performance Director, Art Director, Director of Photography, Asset Intelligence Director, Production Director, Editor, Sound Director, Motion Design Director, VFX Director, Experience Director, Technical Architect, Quality Director, Rights/Safety Director, Release Director and Performance Director.

Roles are activated by actual mission need. The architecture must not create fixed industry templates.

## Repair-first production model

Every substantial output must support bounded repair.

Canonical state transition:

PLAN
-> PRODUCE
-> INSPECT
-> PASS or REPAIR
-> RE-INSPECT
-> ASSEMBLE
-> MASTER REVIEW
-> RELEASE

Quality failures should produce machine-actionable repair instructions tied to exact assets, shots, time ranges, components or code paths.

Examples:
- preserve actor; replace background
- preserve shot timing; repair identity drift
- preserve approved 0:00-0:30 soundtrack; regenerate 0:30-0:35 only
- preserve booking integration; redesign hero section
- preserve logo geometry; replace incorrect rendered logo layer

## Provider abstraction rule

The Studio and directors request capability outcomes, never vendor names.

Correct:
`ai.video.video_to_video` with identity lock and temporal repair specification.

Incorrect:
"use provider X because it is the current default".

Provider resolution remains behind Service Runtime and may choose owned or external workers under the owned-first policy.

## Business partner standard

A mission must not require the customer to become project manager.

The Studio should not repeatedly stop for ordinary operational failures. A five-day production caused by manual retries, provider troubleshooting and repeated user continuation commands is an architecture failure, even if the final media is good.

The target experience is a persistent partner that can say, in effect:
- mission understood
- no decision required from you
- production is progressing
- weak work was rejected internally
- repairs are underway
- master is ready for review

## Success definition

Avantiqo Studio is complete when a customer can give it a business goal or existing asset, discuss direction naturally, and receive world-class release-ready creative or digital work without understanding models, providers, prompts, queues, rendering pipelines or production internals.
