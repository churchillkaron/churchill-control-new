import assert from "node:assert/strict";
import test from "node:test";

import {
  CreativeProductionAuthorityRuntime,
} from "../lib/creative/authority/runtime/CreativeProductionAuthorityRuntime.js";
import {
  CreativeCrossShotFingerprintRuntime,
} from "../lib/creative/quality/runtime/CreativeCrossShotFingerprintRuntime.js";

function approvedVideoNode(overrides = {}) {
  return {
    id: "asset-a",
    status: "APPROVED",
    url: "https://example.test/a.png",
    review: { approved: true },
    metadata: {
      image_asset_perceptual_qc_sealed: true,
      release_approved: true,
      image_asset_role_validation_passed: true,
      approved_for_video_source: true,
      image_asset_authority: {
        approved_for_video_source: true,
      },
      ...overrides,
    },
  };
}

test("canonical production authority passes clean video source", () => {
  const result = CreativeProductionAuthorityRuntime.evaluate({
    asset_node: approvedVideoNode(),
    downstream_role: "VIDEO",
  });
  assert.equal(result.passed, true);
  assert.equal(result.eligible_for_video_source, true);
  assert.deepEqual(result.hard_failures, []);
});

test("canonical production authority fails closed on stale or vetoed evidence", () => {
  const stale = CreativeProductionAuthorityRuntime.evaluate({
    asset_node: approvedVideoNode({ authority_stale: true }),
    downstream_role: "VIDEO",
  });
  assert.equal(stale.passed, false);
  assert.ok(stale.hard_failures.includes("AUTHORITY_STALE"));

  const vetoed = CreativeProductionAuthorityRuntime.evaluate({
    asset_node: approvedVideoNode({
      department_vetoes: { camera: true },
    }),
    downstream_role: "VIDEO",
  });
  assert.equal(vetoed.passed, false);
  assert.ok(vetoed.hard_failures.includes("DEPARTMENT_VETO_ACTIVE"));
});

test("cross-shot fingerprint detects repeated authored setup", () => {
  const node = approvedVideoNode({
    composition_signature: "wide low angle",
    pose_signature: "running profile",
    environment_signature: "wet forest",
    lighting_signature: "hard searchlight",
  });
  const repeated = {
    ...approvedVideoNode(),
    id: "asset-b",
    metadata: {
      ...approvedVideoNode().metadata,
      composition_signature: "wide low angle",
      pose_signature: "running profile",
      environment_signature: "wet forest",
      lighting_signature: "hard searchlight",
    },
  };
  const result = CreativeCrossShotFingerprintRuntime.evaluate({
    asset_node: node,
    comparison_nodes: [repeated],
  });
  assert.equal(result.passed, false);
  assert.equal(result.duplicate_or_near_duplicate, true);
  assert.ok(result.novelty_score <= 0.2);
});
