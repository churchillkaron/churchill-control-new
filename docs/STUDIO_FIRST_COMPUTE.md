# Studio-First Compute Boundary

## Immutable rule

Avantiqo uses Studio compute first.

**If an operation can be executed correctly inside Avantiqo Studio without paid external compute or a paid GPU, it MUST remain inside Studio.**

Paid compute is a last-mile accelerator, not a general-purpose runtime.

The location of the code is never a justification. An operation does not become acceptable on RunPod, a managed AI provider, or another paid worker merely because the worker is already running.

## Default placement

The default placement for every operation is `STUDIO`.

A paid-compute placement is permitted only when the operation is irreducible to Studio because at least one of these is true:

1. `GPU_ACCELERATOR_REQUIRED` — the operation materially requires CUDA/GPU/accelerator execution for the model or algorithm being used.
2. `EXTERNAL_MODEL_INFERENCE_REQUIRED` — the requested capability itself requires a managed external model that Avantiqo does not own or cannot execute in Studio.
3. `EXTERNAL_SYSTEM_SIDE_EFFECT_REQUIRED` — an external system must be contacted to perform the requested external side effect, such as publishing to a third-party platform.

Convenience, simpler implementation, existing worker lifetime, existing container dependencies, or avoiding Studio engineering work are never valid reasons.

## Studio-owned operations

The following are Studio-owned whenever they can be performed without paid accelerator/model execution:

- orchestration and workflow state
- polling and retries
- validation and policy checks
- file naming and path construction
- private storage reads/writes and signed URL creation
- hashing and checksums
- JSON/text serialization other than the minimum transport serialization required to return paid-compute output
- metadata inspection and transformation
- media probing
- media decode and demux
- frame extraction and sampling
- ordinary resize, crop, pad, rotate and compositing
- audio extraction, mixing and muxing
- video/audio encode, transcode, remux and packaging
- FFmpeg work
- archive creation and extraction
- deterministic CPU post-processing
- deterministic CPU pre-processing
- final artifact persistence
- customer review URL generation
- cleanup and lifecycle orchestration

## Paid-worker contract

A paid worker MUST:

1. receive Studio-prepared inputs;
2. execute only the irreducible paid/GPU/model operation;
3. perform only the minimum serialization/egress necessary to return that operation's output;
4. return control to Studio immediately when the paid operation ends;
5. never remain alive to perform ordinary CPU post-processing that Studio can execute;
6. never own final customer artifact persistence when Studio can persist it;
7. never call a second paid provider for work Studio or an Avantiqo-owned accelerator can perform.

## Media example

Correct:

`Studio decode/prep -> GPU model inference -> Studio encode/mux/store/sign/cleanup`

For learned super-resolution:

`Studio frame extraction -> owned GPU super-resolution -> Studio final encode/mux/store/sign/cleanup`

Incorrect:

`GPU model inference -> FFmpeg inside paid Pod -> upload inside paid Pod -> wait for finalization inside paid Pod`

## Cost principle

Avantiqo may charge customers for the complete Studio capability. Supplier-variable cost must be restricted to the smallest irreducible paid-compute interval possible.

The objective is not merely lower infrastructure cost. It is to preserve Avantiqo's margin and ownership of the workflow.

## Enforcement

This is an architecture invariant, not a recommendation.

- New paid-worker code is audited for Studio-capable operations.
- Paid execution plans must identify the irreducible paid-compute reason.
- Adding Studio-capable work to a paid worker is an architecture failure.
- Removing or weakening the boundary audit is itself a governed architecture change.
- Existing violations must be migrated toward this boundary; they are not precedents for new code.

Contract identifier: `AVANTIQO_STUDIO_FIRST_COMPUTE_BOUNDARY_V1`.
