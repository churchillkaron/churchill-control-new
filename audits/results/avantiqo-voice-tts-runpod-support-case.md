# Avantiqo Voice TTS — RunPod Serverless scheduler support case

Status: OPEN — endpoint-specific worker creation failure

Observed: 2026-08-25 (Asia/Bangkok)

## Request to RunPod support

Please investigate why this Serverless endpoint accepts queued jobs and accepts `workersMin=1`, but creates no worker record at all.

This is not a request to retry or replace the job. We need the existing accepted job and endpoint investigated without purging the queue.

## Exact endpoint and job

- Endpoint ID: `a5a2evletdphds`
- Endpoint name: `avantiqo-voice-tts-v1`
- Current endpoint version observed: `8`
- Existing accepted job ID: `f5bc4e1a-f49c-4523-8f1c-5d12efdc2ad1-e1`
- Job accepted successfully by `/run` with HTTP 200
- Job has remained `IN_QUEUE`
- Queue health repeatedly reports one queued job, zero in progress
- Endpoint health repeatedly reports zero idle / initializing / ready / running / throttled / unhealthy workers
- Serverless control-worker API repeatedly returns an empty worker list for this endpoint

## Current endpoint configuration

- Queue-based Serverless endpoint
- `workersMin: 0`
- `workersMax: 1`
- `gpuCount: 1`
- `scalerType: QUEUE_DELAY`
- `scalerValue: 4`
- `minCudaVersion: 12.8`
- Global placement (`dataCenterIds: []`)
- No network volume attached
- FlashBoot enabled
- Idle timeout: 10 seconds
- Execution timeout: 900000 ms
- Current normalized GPU pool:
  - `NVIDIA RTX PRO 6000 Blackwell Server Edition`
  - `NVIDIA RTX PRO 6000 Blackwell Workstation Edition`
  - `NVIDIA RTX PRO 6000 Blackwell Max-Q Workstation Edition`
  - `NVIDIA GeForce RTX 5090`

## Image binding

The endpoint is still bound to the exact certified immutable image:

`ghcr.io/churchillkaron/avantiqo-voice-tts-worker@sha256:c9ce291cc27bb7de119cf1120a92dd6466962b6d79fd5728a1266a743bad1a06`

Template ID: `2t89egfp0c`

The image was independently built and startup-probed successfully before this job was submitted:

- CUDA runtime: 12.8
- PyTorch: 2.7.0
- Blackwell `sm_120` compile support verified
- Chatterbox multilingual v3 imports verified

## Worker creation test that isolates the failure

We temporarily changed only `workersMin` from `0` to `1` while:

- the same accepted job was still `IN_QUEUE`
- the endpoint had no workers
- account Serverless concurrency still had room

RunPod accepted the endpoint PATCH, but for the observation period:

- no control-worker record appeared
- no health worker appeared
- the job stayed `IN_QUEUE`

We then safely restored `workersMin` to `0`.

This means the issue occurs even without relying on queue-delay autoscaling.

## Rolling release already exercised

RunPod's current endpoint API documents that updating an endpoint triggers a rolling release.

This endpoint has already gone through controlled endpoint PATCH operations while the same accepted job remained queued, including:

- Blackwell GPU-pool normalization
- temporary `workersMin: 1`
- restoration to `workersMin: 0`

Those accepted updates changed the endpoint version/configuration but still produced:

- zero control-worker records
- zero health workers
- the same job remaining `IN_QUEUE`

Therefore this case has already exercised RunPod's supported rolling-release path. There is no evidence that another ordinary endpoint update/restart would repair the scheduler state.

## Account / control-plane evidence

At the time of diagnosis:

- account was not under balance
- account `maxServerlessConcurrency` was 10
- other Serverless endpoints on the same account were actively creating/running workers
- there was remaining Serverless worker concurrency when `workersMin=1` was requested

Examples of other active endpoints on the same account included:

- `avantiqo-intelligence-v1` on `NVIDIA RTX PRO 6000 Blackwell Server Edition`
- `avantiqo-image-v1` on `NVIDIA RTX PRO 6000 Blackwell Server Edition`
- `avantiqo-voice-stt-v1` on a Blackwell Server Edition MIG worker
- `services/avantiqo-voice-tts-v1` on a Blackwell Server Edition MIG worker

So worker creation works elsewhere on the same account while the exact endpoint above creates no worker.

## Healthy Blackwell endpoint comparison

`avantiqo-intelligence-v1` was observed with a live Blackwell worker while the TTS endpoint had none.

Both endpoints were configured as Serverless queue endpoints with:

- `gpuCount: 1`
- `workersMin: 0`
- `workersMax: 1`
- `scalerType: QUEUE_DELAY`
- `scalerValue: 4`
- global placement
- no network volume
- FlashBoot enabled

This demonstrates that the account can schedule full Blackwell workers under an otherwise comparable Serverless configuration.

## Private registry evidence

The TTS template uses saved RunPod registry auth named `avantiqo-ghcr`.

Read-only RunPod registry-auth inspection confirmed:

- the saved registry-auth record still exists
- the exact TTS template still references it
- the same saved registry-auth record is also attached to another Avantiqo endpoint that currently has an active worker

Therefore the registry-auth object itself is not stale or deleted.

## Placement / capacity checks already completed

We already ruled out the following without submitting another job:

- stale data-center pinning — endpoint is globally placed
- missing network volume — endpoint does not require one
- account balance blocker
- account Serverless concurrency exhaustion
- missing Blackwell capacity in the account generally
- missing certified image binding
- stale/deleted registry-auth object
- queue-delay alone — `workersMin=1` also failed to create a worker
- missing ordinary endpoint restart path — accepted endpoint PATCHes already triggered rolling releases without creating a worker

## Important safety constraint

Only one controlled TTS generation was authorized and accepted.

Do **not** purge, cancel, replace, or submit a duplicate job while investigating unless explicitly coordinated.

The existing job ID must remain the certification job:

`f5bc4e1a-f49c-4523-8f1c-5d12efdc2ad1-e1`

## What we need from RunPod

Please inspect the Serverless scheduler/control-plane state for endpoint `a5a2evletdphds` and explain why:

1. `QUEUE_DELAY=4` does not create a worker for the queued job, and
2. an explicit `workersMin=1` PATCH is accepted but also creates no worker record, and
3. accepted endpoint updates/rolling releases do not reconcile the endpoint into a schedulable worker state.

If the endpoint has an internal stale scheduler/deployment binding, please repair that binding **without purging the existing queued job** if possible.

If preserving the queued job is impossible, please tell us exactly why before changing or deleting it.
