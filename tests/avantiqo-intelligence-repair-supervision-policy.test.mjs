import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  evaluateOperatorRepairSupervision,
  operatorPostActionVerificationFailed,
  operatorRepairReasonIsHumanGate,
} from "../lib/operator/runtime/OperatorRepairSupervisionPolicy.js";

const runtime = fs.readFileSync(
  "lib/operator/runtime/OperatorRepairSupervisionRuntime.js",
  "utf8",
);
const liveReadEvidenceRuntime = fs.readFileSync(
  "lib/operator/runtime/OperatorRepairLiveReadEvidenceRuntime.js",
  "utf8",
);

test("repair supervision activates when an independent post-action verification fails", () => {
  const result = {
    execution: {
      status: "completed",
      capability: { key: "example.write", mode: "write" },
      post_action_verification: {
        status: "failed",
        reason: "READBACK_MISMATCH",
      },
    },
  };

  assert.equal(operatorPostActionVerificationFailed(result), true);
  assert.deepEqual(evaluateOperatorRepairSupervision(result), {
    applicable: true,
    reason: "POST_ACTION_VERIFICATION_FAILURE",
    failure_reason: "READBACK_MISMATCH",
    execution_failed: false,
    verification_failed: true,
  });
});

test("repair supervision remains disabled for successful verified execution", () => {
  const result = {
    execution: {
      status: "completed",
      post_action_verification: { status: "completed" },
    },
  };

  assert.deepEqual(evaluateOperatorRepairSupervision(result), {
    applicable: false,
    reason: "NO_REPAIRABLE_FAILURE",
    failure_reason: null,
    execution_failed: false,
    verification_failed: false,
  });
});

test("human governance blockers are never converted into autonomous repair", () => {
  assert.equal(operatorRepairReasonIsHumanGate("APPROVAL_REQUIRED"), true);
  assert.equal(operatorRepairReasonIsHumanGate("INSUFFICIENT_WALLET_BALANCE"), true);

  const result = {
    execution: {
      status: "blocked",
      reason: "APPROVAL_REQUIRED",
    },
  };

  assert.deepEqual(evaluateOperatorRepairSupervision(result), {
    applicable: false,
    reason: "HUMAN_GOVERNANCE_GATE",
    failure_reason: "APPROVAL_REQUIRED",
    execution_failed: true,
    verification_failed: false,
  });
});

test("repair supervisor never exposes its own raw exception in the successful API payload", () => {
  assert.match(runtime, /raw_error_returned_to_user:\s*false/);
  assert.match(runtime, /raw_error_exposed:\s*false/);
  assert.match(runtime, /retry_policy:\s*"safe_reinspect_then_retry"/);
  assert.match(runtime, /internal_error:\s*text\(error\?\.message \|\| error/);
  assert.doesNotMatch(runtime, /return \{[\s\S]{0,500}error:\s*text\(error\?\.message \|\| error/);
});

test("verification failure supervision explicitly forbids blind write replay", () => {
  assert.match(
    runtime,
    /completed write whose post-action verification failed is not a successful completed business outcome/i,
  );
  assert.match(runtime, /Never replay the write merely because verification failed/i);
  assert.match(runtime, /accidental write replay/i);
});


test("automatic Code repair requires server-observed current live-read evidence", () => {
  assert.match(runtime, /assessOperatorRepairLiveReadEvidence/);
  assert.match(liveReadEvidenceRuntime, /call\?\.name[\s\S]{0,120}operator_live_read/);
  assert.match(liveReadEvidenceRuntime, /call\?\.outcome[\s\S]{0,120}succeeded/);
  assert.match(runtime, /currentDefectEvidenceConfirmed[\s\S]{0,500}parsedRepair\.repairable === true/);
  assert.match(runtime, /live_read_evidence_observed: liveReadEvidence\.observed/);
  assert.match(runtime, /successful_live_read_count: liveReadEvidence\.successful_call_count/);
  assert.match(runtime, /perform at least one successful operator_live_read/i);
});


test("automatic Code repair requires a relevant live read bound to the failed capability surface", () => {
  assert.match(runtime, /relevant_live_read_evidence_observed/);
  assert.match(runtime, /verification_capability_key/);
  assert.match(liveReadEvidenceRuntime, /capabilitySurface\(readKey\) === failedSurface/);
  assert.match(liveReadEvidenceRuntime, /readKey === verificationCapabilityKey/);
});
