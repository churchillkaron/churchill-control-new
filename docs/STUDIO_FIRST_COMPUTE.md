# Studio-First Compute Boundary

## Immutable rule

Avantiqo uses Avantiqo-owned compute first.

**If an operation can be executed correctly inside Avantiqo without creating a separate supplier-variable compute charge, it MUST remain inside Avantiqo.**

This includes work that can run in the existing Avantiqo application/runtime, Studio, Service Runtime, workers, database/storage layer, or other already-owned CPU execution surfaces.

Paid compute is a last-mile accelerator, not a general-purpose backend.

The location of the code is never a justification. An operation does not become acceptable on Modal, RunPod, a managed AI provider, or another paid worker merely because that worker already exists or is easier to call.

Canonical contracts:

- `AVANTIQO_STUDIO_FIRST_COMPUTE_BOUNDARY_V1`
- `AVANTIQO_COMPUTE_COST_ARCHITECTURE_V1`

## Cost priority

Every new execution path MUST use this order:

1. `DO_NOT_COMPUTE` — reuse an existing result, cache, artifact, state, or deterministic derivation when possible.
2. `AVANTIQO_OWNED_ZERO_MARGINAL` — execute inside Avantiqo when no separate paid-compute/provider bill is required.
3. `AVANTIQO_OWNED_PAID_ACCELERATOR` — use an Avantiqo-owned model on Modal only for the smallest irreducible accelerator/GPU stage.
4. `EXTERNAL_PAID_SPECIALIST` — use a third-party paid provider only when Avantiqo cannot currently provide the required capability/quality and the fallback is explicitly governed.

A lower-priority paid tier MUST NOT be selected merely for convenience, simpler engineering, shorter code, existing credentials, an already-deployed service, or because a GPU is available.

## Default placement

The default placement for every operation is `AVANTIQO`.

A paid-compute placement is permitted only when the operation is irreducible to Avantiqo-owned zero-marginal execution because at least one of these is true:

1. `GPU_ACCELERATOR_REQUIRED` — the operation materially requires CUDA/GPU/accelerator execution for the model or algorithm being used.
2. `MODEL_VRAM_REQUIRED` — the owned model cannot practically execute on the normal Avantiqo CPU/runtime because of memory or accelerator requirements.
3. `EXTERNAL_MODEL_INFERENCE_REQUIRED` — the requested capability itself requires a managed external model that Avantiqo does not own or cannot execute itself.
4. `EXTERNAL_SYSTEM_SIDE_EFFECT_REQUIRED` — an external system must be contacted to perform the requested external side effect, such as publishing to a third-party platform.
5. `MEASURED_TOTAL_COST_LOWER` — a paid accelerator has been measured to reduce total supplier cost versus the available Avantiqo execution path for the same quality/SLA. This requires evidence, not assumption.

Convenience, simpler implementation, existing worker lifetime, existing container dependencies, or avoiding Avantiqo engineering work are never valid reasons.

## Avantiqo-owned operations

The following stay inside Avantiqo whenever they can be performed without a separate paid accelerator/model execution:

- business logic and domain services
- orchestration and workflow state
- queue/job state
- polling and retry policy
- routing and provider selection
- permissions, entitlements and approvals
- wallet, reservation, usage and pricing logic
- validation and policy checks
- prompt/specification construction
- deterministic planning and rule evaluation
- file naming and path construction
- private storage reads/writes and signed URL creation
- hashing and checksums
- JSON/text serialization other than minimum accelerator transport
- metadata inspection and transformation
- API integrations that do not themselves require a paid specialist service
- scheduling and monitoring
- media probing
- media decode and demux
- frame extraction and sampling
- ordinary resize, crop, pad, rotate and compositing
- audio extraction, deterministic mixing and muxing
- video/audio encode, transcode, remux and packaging
- FFmpeg work
- archive creation and extraction
- deterministic CPU post-processing
- deterministic CPU pre-processing
- final artifact persistence
- customer review URL generation
- cleanup and lifecycle orchestration
- ordinary document processing that does not require a paid model
- deterministic calculations, formatting and transformations

If Avantiqo can perform the operation correctly itself, moving that operation to Modal is an architecture failure even if the Modal CPU cost is small.

## Modal role

Modal is Avantiqo's elastic accelerator execution layer, not Avantiqo's application backend.

Modal is permitted for:

- owned GPU model inference;
- accelerator-specific preprocessing/postprocessing that cannot reasonably execute without the accelerator;
- one-time immutable model/image construction required to make an approved owned GPU runtime executable;
- narrowly scoped runtime support that is technically required by the GPU function itself.

Modal is NOT the preferred place for:

- business logic;
- orchestration;
- queues/job ownership;
- wallet/pricing;
- storage ownership;
- final artifact persistence;
- general CPU services;
- ordinary web/API gateways;
- FFmpeg or deterministic media mastering;
- polling and retries that Avantiqo can own;
- validation or policy logic Avantiqo can own.

Existing lightweight Modal CPU gateways are transitional migration debt. They may remain only while needed to bridge current deployed GPU workers. They MUST stay transport-only, import no GPU/model runtime, perform no inference, own no business logic, and must not be treated as precedent for new gateways. New architecture should move those responsibilities back into Avantiqo when the direct governed GPU invocation path is available.

## Modal GPU cost rules

Every Modal GPU function MUST follow these defaults unless a measured exception is explicitly approved:

- scale to zero when idle;
- `min_containers = 0`;
- `max_containers = 1` during normal certification/early production unless measured concurrency demand justifies more;
- no warm GPU kept alive merely to improve convenience;
- no speculative prewarming;
- no duplicate Modal and RunPod execution for the same job;
- no parallel candidate fan-out unless the capability explicitly requires it and a cost budget is approved;
- return control to Avantiqo immediately after the irreducible GPU/model operation;
- use the cheapest GPU that satisfies model memory, runtime compatibility, quality and latency requirements.

### GPU selection

GPU selection is economic, not prestige-based.

Use the cheapest adequate accelerator first. H100/B200-class hardware is allowed only when at least one is true:

- the model cannot fit or run correctly on a cheaper supported GPU;
- measured throughput makes the higher-tier GPU cheaper per completed job;
- the required latency/SLA cannot be met on a cheaper supported GPU;
- a governed benchmark demonstrates a material quality/runtime requirement.

"It is faster" by itself is not enough. The relevant metric is **total cost per successful required-quality result**.

## Model storage and build rules

Model availability must also minimize recurring cost.

Preferred order:

1. reuse an already-built immutable image/model layer;
2. reuse the one canonical existing model storage for the engine;
3. bake an immutable image layer once when practical;
4. create/use persistent paid storage only when the model/runtime genuinely requires mutable or separately mounted storage.

Rules:

- one canonical persistent model storage per engine at most unless an explicit architecture exception exists;
- never create duplicate storage because a deployment script cannot find the existing one;
- model bake/cache seeding requires explicit approval when it causes supplier cost;
- model build/seeding MUST NOT invoke inference;
- before a paid bake/seed, verify whether the exact revision is already available and reusable;
- model revisions must be pinned for certified owned runtimes whenever feasible.

## Paid execution budget gate

Before any deliberate paid test, benchmark, model bake, seed, or inference, the execution plan must establish:

- why Avantiqo-owned zero-marginal execution cannot prove the requirement;
- exact provider/infrastructure being used;
- exact capability/model lane;
- cheapest adequate GPU/runtime considered;
- maximum number of paid jobs/functions;
- maximum concurrency;
- maximum duration/timeout;
- whether a model build/download is required;
- whether an existing artifact/cache/image can be reused;
- expected teardown/scale-to-zero behavior;
- confirmation that no duplicate paid runtime is active.

For certification, the normal paid-job budget is **one real job** after all zero-cost/static gates pass.

## Retry rule

Paid retries are not debugging loops.

- A structural failure such as missing credentials, invalid contract, bad source, missing model access, placement incompatibility, or deterministic build error MUST be fixed before another paid attempt.
- Do not resubmit an identical paid job against an unchanged structural failure.
- Prefer read-only/static probes before another real generation.
- Capacity/placement failure is infrastructure evidence, not a reason to mutate model/runtime code without evidence.

## Paid-worker contract

A paid worker MUST:

1. receive Avantiqo-prepared inputs;
2. execute only the irreducible paid/GPU/model operation;
3. perform only the minimum serialization/egress necessary to return that operation's output;
4. return control to Avantiqo immediately when the paid operation ends;
5. never remain alive to perform ordinary CPU post-processing that Avantiqo can execute;
6. never own final customer artifact persistence when Avantiqo can persist it;
7. never call a second paid provider for work Avantiqo or an Avantiqo-owned accelerator can perform;
8. expose enough execution metadata to attribute supplier cost to the governed usage/job;
9. fail closed rather than silently falling back to a second paid provider.

## External providers

External paid providers are specialist/fallback infrastructure, not the default execution path for capabilities Avantiqo owns.

A paid external provider may be used when:

- Avantiqo has no owned implementation yet;
- the owned implementation is unavailable and governed fallback is explicitly allowed;
- a specialist capability materially exceeds the owned capability and the product intentionally buys that result;
- a third-party side effect inherently requires that provider/platform.

Provider fallback must never silently bypass wallet, pricing, entitlement, quality, or ownership policy.

## Media example

Correct:

`Avantiqo decode/prep -> Modal GPU model inference -> Avantiqo encode/mux/store/sign/cleanup`

For learned super-resolution:

`Avantiqo frame extraction -> Modal owned GPU super-resolution -> Avantiqo final encode/mux/store/sign/cleanup`

Incorrect:

`Modal GPU model inference -> FFmpeg on Modal -> upload/finalize on Modal -> wait/poll on Modal`

Also incorrect:

`Avantiqo could perform deterministic CPU work -> send it to Modal because the Modal service already exists`

## Cost accounting principle

Avantiqo may charge customers for the complete capability. Supplier-variable cost must be restricted to the smallest irreducible paid-compute interval possible.

Optimize for:

`required quality + reliability + latency at the lowest total supplier cost per successful result`.

Do not optimize for the largest GPU, the fastest isolated benchmark, or the fewest lines of orchestration code.

The objective is to preserve Avantiqo's margin, ownership, operational control and ability to replace infrastructure providers.

## Enforcement

This is an architecture invariant, not a recommendation.

- `AGENTS.md` must point coding agents to this policy.
- `docs/ENGINEERING_RULES.md` must preserve this boundary.
- `config/avantiqo-compute-cost-policy.json` is the machine-readable policy.
- repository tests/audits must reject new unapproved paid-compute architecture drift;
- new paid-worker code is audited for Avantiqo-capable operations;
- paid execution plans must identify the irreducible paid-compute reason;
- adding Avantiqo-capable work to a paid worker is an architecture failure;
- removing or weakening the boundary audit is itself a governed architecture change;
- existing violations are migration debt, not precedents for new code.

Contract identifiers:

- `AVANTIQO_STUDIO_FIRST_COMPUTE_BOUNDARY_V1`
- `AVANTIQO_COMPUTE_COST_ARCHITECTURE_V1`
