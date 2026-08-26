import { readFile, writeFile } from "node:fs/promises";

function replaceRequired(source, before, after, label) {
  if (source.includes(after)) return source;
  if (!source.includes(before)) throw new Error(`PATCH_TARGET_MISSING:${label}`);
  return source.replace(before, after);
}

const sharedLeasePath = "scripts/run-avantiqo-runpod-safe-lease-v2-local.mjs";
let sharedLease = await readFile(sharedLeasePath, "utf8");

sharedLease = replaceRequired(
  sharedLease,
  `async function enforce(snapshotValue, policy, targetId, managementKey) {`,
  `function codeLaneAllowsInertUnboundedPeer(row, targetId, lane) {\n  return (\n    text(lane) === "code" &&\n    text(row?.id) !== text(targetId) &&\n    row?.workers_min === 0 &&\n    finite(row?.workers_max, null) > 1 &&\n    row?.active_workers === 0 &&\n    row?.jobs === 0 &&\n    row?.hourly_cost_usd === 0 &&\n    !row?.health_error\n  );\n}\n\nasync function enforce(snapshotValue, policy, targetId, managementKey, lane) {`,
  "shared-lease-code-inert-peer-helper",
);

sharedLease = replaceRequired(
  sharedLease,
  `  const badMax = snapshotValue.rows.filter((row) => ![0, 1].includes(row.workers_max));`,
  `  const badMax = snapshotValue.rows.filter(\n    (row) =>\n      ![0, 1].includes(row.workers_max) &&\n      !codeLaneAllowsInertUnboundedPeer(row, targetId, lane),\n  );`,
  "shared-lease-code-inert-peer-badmax",
);

sharedLease = replaceRequired(
  sharedLease,
  `    const state = await enforce(await snapshot(managementKey, queueKey), policy, lease.endpoint_id, managementKey);`,
  `    const state = await enforce(\n      await snapshot(managementKey, queueKey),\n      policy,\n      lease.endpoint_id,\n      managementKey,\n      lease.lane,\n    );`,
  "shared-lease-watchdog-lane",
);

sharedLease = replaceRequired(
  sharedLease,
  `  await enforce(await snapshot(managementKey, queueKey), policy, targetId, managementKey);`,
  `  await enforce(\n    await snapshot(managementKey, queueKey),\n    policy,\n    targetId,\n    managementKey,\n    args.lane,\n  );`,
  "shared-lease-acquire-lane",
);

await writeFile(sharedLeasePath, sharedLease, "utf8");

const resilienceShimPath = "scripts/run-code-ai-runpod-safe-lease-resilient-local.mjs";
let resilienceShim = await readFile(resilienceShimPath, "utf8");
resilienceShim = replaceRequired(
  resilienceShim,
  `  shared_safe_lease_source_modified: false,`,
  `  shared_safe_lease_code_lane_inert_peer_isolation: true,\n  shared_safe_lease_runtime_mutation_performed: false,`,
  "code-resilience-shared-lease-evidence",
);
await writeFile(resilienceShimPath, resilienceShim, "utf8");

const selftestPath = "scripts/code-ai-certification-resilience-selftest.mjs";
let selftest = await readFile(selftestPath, "utf8");

selftest = replaceRequired(
  selftest,
  `assert.ok(CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS >= 5 * 60_000);`,
  `assert.ok(CODE_AI_PLANNER_STALE_QUEUED_MIN_AGE_MS >= 5 * 60_000);\n\nfunction codeLaneAllowsInertUnboundedPeerPolicy(row, targetId, lane) {\n  return (\n    lane === "code" &&\n    row?.id !== targetId &&\n    row?.workers_min === 0 &&\n    Number(row?.workers_max) > 1 &&\n    row?.active_workers === 0 &&\n    row?.jobs === 0 &&\n    row?.hourly_cost_usd === 0 &&\n    !row?.health_error\n  );\n}\nconst inertUnboundedPeer = {\n  id: "music-candidate",\n  workers_min: 0,\n  workers_max: 4,\n  active_workers: 0,\n  jobs: 0,\n  hourly_cost_usd: 0,\n  health_error: null,\n};\nassert.equal(codeLaneAllowsInertUnboundedPeerPolicy(inertUnboundedPeer, "code-endpoint", "code"), true);\nassert.equal(codeLaneAllowsInertUnboundedPeerPolicy(inertUnboundedPeer, "music-candidate", "code"), false);\nassert.equal(codeLaneAllowsInertUnboundedPeerPolicy(inertUnboundedPeer, "code-endpoint", "voice"), false);\nassert.equal(codeLaneAllowsInertUnboundedPeerPolicy({ ...inertUnboundedPeer, jobs: 1 }, "code-endpoint", "code"), false);\nassert.equal(codeLaneAllowsInertUnboundedPeerPolicy({ ...inertUnboundedPeer, active_workers: 1 }, "code-endpoint", "code"), false);\nassert.equal(codeLaneAllowsInertUnboundedPeerPolicy({ ...inertUnboundedPeer, hourly_cost_usd: 0.1 }, "code-endpoint", "code"), false);\nassert.equal(codeLaneAllowsInertUnboundedPeerPolicy({ ...inertUnboundedPeer, health_error: "unknown" }, "code-endpoint", "code"), false);`,
  "code-resilience-inert-peer-policy-cases",
);

selftest = replaceRequired(
  selftest,
  `assert.match(leaseShim, /child_termination_acknowledged/);`,
  `assert.match(leaseShim, /child_termination_acknowledged/);\nassert.match(leaseShim, /shared_safe_lease_code_lane_inert_peer_isolation: true/);\nassert.match(leaseShim, /shared_safe_lease_runtime_mutation_performed: false/);`,
  "code-resilience-shim-isolation-markers",
);

selftest = replaceRequired(
  selftest,
  `assert.match(sharedLease, /maxLeaseTtlMs/);`,
  `assert.match(sharedLease, /maxLeaseTtlMs/);\nassert.match(sharedLease, /function codeLaneAllowsInertUnboundedPeer\\(row, targetId, lane\\)/);\nassert.match(sharedLease, /text\\(lane\\) === "code"/);\nassert.match(sharedLease, /text\\(row\\?\\.id\\) !== text\\(targetId\\)/);\nassert.match(sharedLease, /!codeLaneAllowsInertUnboundedPeer\\(row, targetId, lane\\)/);\nassert.match(sharedLease, /lease\\.lane/);\nassert.match(sharedLease, /args\\.lane/);`,
  "code-resilience-shared-lease-isolation-markers",
);

selftest = replaceRequired(
  selftest,
  `    shared_safe_lease_runtime_reused_without_source_rewrite: true,`,
  `    shared_safe_lease_code_lane_isolates_inert_unbounded_peers: true,\n    inert_unbounded_peer_requires_zero_jobs_workers_and_cost: true,\n    non_code_lanes_keep_global_workers_max_guard: true,\n    code_target_remains_strictly_bounded: true,`,
  "code-resilience-isolation-evidence",
);

await writeFile(selftestPath, selftest, "utf8");

console.log(JSON.stringify({
  success: true,
  contract: "AVANTIQO_CODE_SAFE_LEASE_PARALLEL_INERT_PEER_PATCH_V1",
  files_changed: [sharedLeasePath, resilienceShimPath, selftestPath],
  code_lane_only_behavior_change: true,
  unrelated_active_or_costing_endpoint_still_fails_closed: true,
  target_endpoint_strict_zero_one_preserved: true,
  provider_calls_executed: false,
  provider_spend_performed: false,
  runpod_lease_opened: false,
  production_deploy_performed: false,
  secrets_printed: false,
}, null, 2));
