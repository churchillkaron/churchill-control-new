import assert from "node:assert/strict";
import test from "node:test";

import {
  CreativeCinemaEngineCertificationRuntime,
} from "../lib/creative/certification/runtime/CreativeCinemaEngineCertificationRuntime.js";

function evidenceFor(spec, overrides = {}) {
  return {
    engine_id: spec.id,
    implementation_contracts: [...spec.contracts],
    technical_proof_passed: true,
    technical_proof_id: `tech:${spec.id}`,
    visual_proof_passed: spec.visual,
    visual_proof_id: spec.visual ? `visual:${spec.id}` : null,
    proof_asset_node_id: spec.visual ? `asset:${spec.id}` : null,
    proof_checksum: `sha256:${spec.id}`,
    verified_at: "2026-09-18T17:30:00+07:00",
    ...overrides,
  };
}

test("Cinema certification fails closed without durable engine evidence", () => {
  const result = CreativeCinemaEngineCertificationRuntime.certify();
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.production_certified, false);
  assert.equal(result.infrastructure_ready_for_paid_media_proof, false);
  assert.equal(result.blocked_engine_ids.length, CreativeCinemaEngineCertificationRuntime.engine_specs.length);
});
test("prepaid professional stack can unlock controlled paid proof without certifying generation", () => {
  const specs = CreativeCinemaEngineCertificationRuntime.engine_specs;
  const evidence = specs
    .filter((spec) => spec.prepaid)
    .map((spec) => evidenceFor(spec));
  const result = CreativeCinemaEngineCertificationRuntime.certify({ evidence });

  assert.equal(result.infrastructure_ready_for_paid_media_proof, true);
  assert.equal(result.paid_media_proof_unlocked, true);
  assert.equal(result.production_certified, false);
  assert.equal(result.status, "READY_FOR_CONTROLLED_PAID_MEDIA_PROOF");
  assert.deepEqual(result.blocked_engine_ids, ["VIDEO_GENERATION_1080"]);
});

test("visual engines require visual proof in addition to technical proof", () => {
  const motion = CreativeCinemaEngineCertificationRuntime.engine_specs
    .find((spec) => spec.id === "CINEMATIC_MOTION");
  const result = CreativeCinemaEngineCertificationRuntime.certify({
    evidence: [evidenceFor(motion, {
      visual_proof_passed: false,
      visual_proof_id: null,
      proof_asset_node_id: null,
    })],
  });
  const engine = result.engines.find((item) => item.id === "CINEMATIC_MOTION");

  assert.equal(engine.technical_passed, true);
  assert.equal(engine.visual_passed, false);
  assert.equal(engine.passed, false);
  assert.ok(engine.blockers.includes("VISUAL_PROOF_REQUIRED"));
});
test("full durable evidence produces deterministic production certification", () => {
  const specs = CreativeCinemaEngineCertificationRuntime.engine_specs;
  const evidence = specs.map((spec) => evidenceFor(spec));
  const first = CreativeCinemaEngineCertificationRuntime.certify({ evidence });
  const second = CreativeCinemaEngineCertificationRuntime.certify({ evidence });

  assert.equal(first.status, "PRODUCTION_CERTIFIED");
  assert.equal(first.production_certified, true);
  assert.equal(first.infrastructure_ready_for_paid_media_proof, true);
  assert.deepEqual(first.blocked_engine_ids, []);
  assert.equal(first.certification_hash, second.certification_hash);
});

test("provider spend never substitutes for missing implementation or proof", () => {
  const result = CreativeCinemaEngineCertificationRuntime.certify({
    evidence: [{
      engine_id: "CINEMATIC_MOTION",
      provider_calls_performed: true,
      technical_proof_passed: false,
      visual_proof_passed: false,
    }],
  });
  const engine = result.engines.find((item) => item.id === "CINEMATIC_MOTION");

  assert.equal(engine.passed, false);
  assert.equal(result.policy.provider_spend_does_not_increase_authority, true);
  assert.ok(engine.blockers.includes("IMPLEMENTATION_CONTRACT_EVIDENCE_REQUIRED"));
  assert.ok(engine.blockers.includes("TECHNICAL_PROOF_REQUIRED"));
  assert.ok(engine.blockers.includes("VISUAL_PROOF_REQUIRED"));
});
