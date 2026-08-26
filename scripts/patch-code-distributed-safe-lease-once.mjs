import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`PATCH_TARGET_MISSING:${label}`);
  return source.replace(before, after);
}

async function patch(path, transform) {
  const source = await readFile(path, "utf8");
  const updated = transform(source);
  if (updated !== source) await writeFile(path, updated, "utf8");
}

await patch("scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs", (input) => {
  let source = input;
  source = replaceRequired(
    source,
    '} from "./avantiqo-voice-runpod-distributed-lease.mjs";\n',
    '} from "./avantiqo-voice-runpod-distributed-lease.mjs";\nimport {\n  acquireCodeRunpodDistributedLease,\n  isCodeRunpodLane,\n  listActiveCodeRunpodDistributedLeases,\n  releaseCodeRunpodDistributedLease,\n} from "./avantiqo-code-runpod-distributed-lease.mjs";\n',
    "safe lease Code distributed imports",
  );
  source = replaceRequired(
    source,
    '  const [currentLeases, distributedVoiceLeases] = await Promise.all([\n    leases(),\n    listActiveVoiceRunpodDistributedLeases(),\n  ]);\n',
    '  const [currentLeases, distributedVoiceLeases, distributedCodeLeases] = await Promise.all([\n    leases(),\n    listActiveVoiceRunpodDistributedLeases(),\n    listActiveCodeRunpodDistributedLeases(),\n  ]);\n',
    "safe lease distributed lists",
  );
  source = replaceRequired(
    source,
    '    ...distributedVoiceLeases.map((lease) => text(lease.endpoint_id)),\n',
    '    ...distributedVoiceLeases.map((lease) => text(lease.endpoint_id)),\n    ...distributedCodeLeases.map((lease) => text(lease.endpoint_id)),\n',
    "safe lease distributed Code ids",
  );
  source = replaceRequired(
    source,
    '  return { refreshed, currentLeases, distributedVoiceLeases, target };\n',
    '  return { refreshed, currentLeases, distributedVoiceLeases, distributedCodeLeases, target };\n',
    "safe lease distributed Code state",
  );
  source = replaceRequired(
    source,
    '    console.log(`${CONTRACT}_WATCHDOG=${JSON.stringify({ elapsed_seconds: Math.floor((Date.now() - acquired) / 1000), lane: lease.lane, open_leases: state.currentLeases.length + state.distributedVoiceLeases.length, target_jobs: state.target.jobs, target_hourly_cost_usd: state.target.hourly_cost_usd, account_hourly_cost_usd: state.refreshed.hourly_cost_usd })}`);\n',
    '    const protectedEndpointIds = new Set([\n      ...state.currentLeases.map((entry) => text(entry.endpoint_id)),\n      ...state.distributedVoiceLeases.map((entry) => text(entry.endpoint_id)),\n      ...state.distributedCodeLeases.map((entry) => text(entry.endpoint_id)),\n    ].filter(Boolean));\n    console.log(`${CONTRACT}_WATCHDOG=${JSON.stringify({ elapsed_seconds: Math.floor((Date.now() - acquired) / 1000), lane: lease.lane, open_leases: protectedEndpointIds.size, target_jobs: state.target.jobs, target_hourly_cost_usd: state.target.hourly_cost_usd, account_hourly_cost_usd: state.refreshed.hourly_cost_usd })}`);\n',
    "safe lease watchdog distinct distributed count",
  );
  source = replaceRequired(
    source,
    'let distributedVoiceLease = null;\nlet endpointOpened = false;\n',
    'let distributedVoiceLease = null;\nlet distributedCodeLease = null;\nlet endpointOpened = false;\n',
    "safe lease distributed Code variable",
  );
  source = replaceRequired(
    source,
    '  if (isVoiceRunpodLane(args.lane)) {\n    distributedVoiceLease = await acquireVoiceRunpodDistributedLease({\n      lane: args.lane,\n      endpointId: targetId,\n      endpointName: laneName,\n      ttlMs,\n    });\n  }\n  lease = await acquireLease(\n',
    '  if (isVoiceRunpodLane(args.lane)) {\n    distributedVoiceLease = await acquireVoiceRunpodDistributedLease({\n      lane: args.lane,\n      endpointId: targetId,\n      endpointName: laneName,\n      ttlMs,\n    });\n  }\n  if (isCodeRunpodLane(args.lane)) {\n    distributedCodeLease = await acquireCodeRunpodDistributedLease({\n      lane: args.lane,\n      endpointId: targetId,\n      endpointName: laneName,\n      ttlMs,\n    });\n  }\n  lease = await acquireLease(\n',
    "safe lease acquire distributed Code",
  );
  source = replaceRequired(
    source,
    '    distributedVoiceLease?.expires_at || null,\n',
    '    distributedVoiceLease?.expires_at || distributedCodeLease?.expires_at || null,\n',
    "safe lease distributed expiry",
  );
  source = replaceRequired(
    source,
    '  if (distributedVoiceLease) {\n',
    '  if (distributedCodeLease) {\n    try {\n      await releaseCodeRunpodDistributedLease({\n        ownerRequestId: distributedCodeLease.owner_request_id,\n        state: childSucceeded && release?.success === true && !failure ? "RELEASED" : "FAILED",\n        reason: failure\n          ? redact(failure.message).slice(0, 300)\n          : childSucceeded && release?.success === true\n            ? "LOCAL_V2_CHILD_COMPLETE"\n            : "LOCAL_V2_CLEANUP_INCOMPLETE",\n      });\n    } catch (error) {\n      if (!failure) failure = error;\n    }\n  }\n\n  if (distributedVoiceLease) {\n',
    "safe lease release distributed Code",
  );
  source = replaceRequired(
    source,
    'voice_distributed_lease_acquired: Boolean(distributedVoiceLease), permanent_rest_state:',
    'voice_distributed_lease_acquired: Boolean(distributedVoiceLease), code_distributed_lease_required: isCodeRunpodLane(args.lane), code_distributed_lease_acquired: Boolean(distributedCodeLease), permanent_rest_state:',
    "safe lease result distributed Code evidence",
  );
  return source;
});

await patch("scripts/code-ai-certification-resilience-selftest.mjs", (input) => {
  let source = input;
  source = replaceRequired(
    source,
    'const [leaseShim, childGuard, cleanupShim, capacityRunner, packageJson, plannerExecution, autonomousRuntime, pendingSettlement] = await Promise.all([\n',
    'const [leaseShim, childGuard, cleanupShim, capacityRunner, packageJson, plannerExecution, autonomousRuntime, pendingSettlement, sharedLease, codeDistributedLease] = await Promise.all([\n',
    "selftest source list",
  );
  source = replaceRequired(
    source,
    '  readFile("scripts/settle-code-ai-planner-certification-pending-local.mjs", "utf8"),\n]);\n',
    '  readFile("scripts/settle-code-ai-planner-certification-pending-local.mjs", "utf8"),\n  readFile("scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs", "utf8"),\n  readFile("scripts/avantiqo-code-runpod-distributed-lease.mjs", "utf8"),\n]);\n',
    "selftest distributed sources",
  );
  source = replaceRequired(
    source,
    'assert.doesNotMatch(pendingSettlement, /purge-queue/);\n',
    'assert.doesNotMatch(pendingSettlement, /purge-queue/);\nassert.match(sharedLease, /listActiveCodeRunpodDistributedLeases/);\nassert.match(sharedLease, /acquireCodeRunpodDistributedLease/);\nassert.match(sharedLease, /releaseCodeRunpodDistributedLease/);\nassert.match(sharedLease, /code_distributed_lease_acquired/);\nassert.match(codeDistributedLease, /AVANTIQO_CODE_DISTRIBUTED_RUNPOD_LEASE_V1/);\nassert.match(codeDistributedLease, /updated_at=eq/);\nassert.match(codeDistributedLease, /AVANTIQO_CODE_DISTRIBUTED_LEASE_BUSY/);\nassert.match(codeDistributedLease, /owner_request_id/);\nassert.doesNotMatch(codeDistributedLease, /workersMax/);\n',
    "selftest distributed assertions",
  );
  source = replaceRequired(
    source,
    '    stale_pending_certification_reservation_cleanup_supported: true,\n',
    '    stale_pending_certification_reservation_cleanup_supported: true,\n    code_distributed_lease_visible_across_hosts: true,\n    code_distributed_lease_compare_and_swap_owned: true,\n    code_endpoint_orphan_reaper_respects_distributed_ownership: true,\n    code_distributed_lease_does_not_mutate_endpoint_directly: true,\n',
    "selftest distributed evidence",
  );
  return source;
});

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_DISTRIBUTED_SAFE_LEASE_CONVERGENCE_V1",
  provider_execution_submitted: false,
  runpod_lease_opened: false,
  endpoint_mutation_performed: false,
  production_deploy_performed: false,
}, null, 2));
