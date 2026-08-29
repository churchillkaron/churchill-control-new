import assert from "node:assert/strict";
import test from "node:test";

import {
  AVANTIQO_RUNPOD_SAFE_LEASE_PEER_GOVERNANCE,
  classifyAvantiqoRunpodUnleasedPeer,
  readAvantiqoDistributedLeaseRegistryBestEffort,
} from "../scripts/lib/avantiqo-runpod-safe-lease-peer-governance.mjs";

const POLICY = Object.freeze({
  parallel_work_allowed: true,
  max_jobs_per_lease: 1,
});

function row(overrides = {}) {
  return {
    id: "peer-1",
    name: "avantiqo-code-v1",
    workers_min: 0,
    workers_max: 1,
    active_workers: 1,
    jobs: 1,
    hourly_cost_usd: 1.25,
    health_error: null,
    ...overrides,
  };
}

test("bounded active unleased peer is classified for preservation, never orphan reap", () => {
  const result = classifyAvantiqoRunpodUnleasedPeer({
    row: row(),
    policy: POLICY,
    targetId: "deep-1",
  });
  assert.equal(
    result.action,
    AVANTIQO_RUNPOD_SAFE_LEASE_PEER_GOVERNANCE.PRESERVE_ACTIVE_PEER,
  );
  assert.equal(result.reason, "BOUNDED_ACTIVE_PARALLEL_PEER");
});

test("idle unleased 0/1 peer remains eligible for base Safe Lease orphan reap", () => {
  const result = classifyAvantiqoRunpodUnleasedPeer({
    row: row({ active_workers: 0, jobs: 0, hourly_cost_usd: 0 }),
    policy: POLICY,
    targetId: "deep-1",
  });
  assert.equal(
    result.action,
    AVANTIQO_RUNPOD_SAFE_LEASE_PEER_GOVERNANCE.REAP_IDLE_ORPHAN,
  );
  assert.equal(result.reason, "IDLE_UNLEASED_ORPHAN");
});

test("unreadable peer health fails closed", () => {
  const result = classifyAvantiqoRunpodUnleasedPeer({
    row: row({ health_error: "credential mismatch", jobs: null }),
    policy: POLICY,
    targetId: "deep-1",
  });
  assert.equal(
    result.action,
    AVANTIQO_RUNPOD_SAFE_LEASE_PEER_GOVERNANCE.BLOCK_UNSAFE_PEER,
  );
  assert.equal(result.reason, "PEER_HEALTH_UNREADABLE");
});

test("unbounded peer scaling fails closed", () => {
  const result = classifyAvantiqoRunpodUnleasedPeer({
    row: row({ workers_max: 2 }),
    policy: POLICY,
    targetId: "deep-1",
  });
  assert.equal(
    result.action,
    AVANTIQO_RUNPOD_SAFE_LEASE_PEER_GOVERNANCE.BLOCK_UNSAFE_PEER,
  );
  assert.equal(result.reason, "PEER_SCALING_UNBOUNDED");
});

test("peer above per-lease job bound fails closed", () => {
  const result = classifyAvantiqoRunpodUnleasedPeer({
    row: row({ jobs: 2 }),
    policy: POLICY,
    targetId: "deep-1",
  });
  assert.equal(
    result.action,
    AVANTIQO_RUNPOD_SAFE_LEASE_PEER_GOVERNANCE.BLOCK_UNSAFE_PEER,
  );
  assert.equal(result.reason, "PEER_JOB_LIMIT_EXCEEDED");
});

test("parallel-work disabled turns active peer into a blocker", () => {
  const result = classifyAvantiqoRunpodUnleasedPeer({
    row: row(),
    policy: { ...POLICY, parallel_work_allowed: false },
    targetId: "deep-1",
  });
  assert.equal(
    result.action,
    AVANTIQO_RUNPOD_SAFE_LEASE_PEER_GOVERNANCE.BLOCK_UNSAFE_PEER,
  );
  assert.equal(result.reason, "PARALLEL_WORK_DISABLED");
});

test("distributed registry read degradation is explicit and grants no ownership", async () => {
  const degraded = [];
  const result = await readAvantiqoDistributedLeaseRegistryBestEffort({
    name: "CODE",
    reader: async () => {
      throw new Error("temporary registry outage");
    },
    onDegraded: (value) => degraded.push(value),
  });
  assert.equal(result.degraded, true);
  assert.deepEqual(result.leases, []);
  assert.match(result.error, /temporary registry outage/);
  assert.equal(degraded.length, 1);
});

test("healthy distributed registry read preserves recognized leases", async () => {
  const result = await readAvantiqoDistributedLeaseRegistryBestEffort({
    name: "CODE",
    reader: async () => [{ endpoint_id: "code-1" }],
  });
  assert.equal(result.degraded, false);
  assert.equal(result.leases.length, 1);
  assert.equal(result.leases[0].endpoint_id, "code-1");
});
