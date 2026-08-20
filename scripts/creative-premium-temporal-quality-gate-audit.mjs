import assert from "node:assert/strict";

import {
  CreativePremiumTemporalQualityGateRuntime,
} from "../lib/creative/quality/runtime/CreativePremiumTemporalQualityGateRuntime.js";

const premiumProject = {
  target_duration: 237.5,
  metadata: {
    studio_project_contract: "CREATIVE_STUDIO_PREMIUM_TEMPORAL_V1",
    proof_gate: {
      required: true,
      duration_seconds: 40,
      approval_required_before_full_master: true,
    },
    visual_system: {
      real_footage_min_ratio: 0.70,
      full_screen_ui_max_ratio: 0.08,
      spatial_glass: {
        required: true,
        quality_floor: 0.93,
      },
    },
    performance_system: {
      founder_identity_lock_required: true,
      speaking_ready_motion_required: true,
      lip_sync: {
        quality_floor: 0.92,
        full_face_performance_required: true,
      },
    },
    quality_gate: {
      corrupt_frame_count_max: 0,
      blank_frame_count_max: 0,
      glyph_placeholder_count_max: 0,
      real_footage_min_ratio: 0.70,
      full_screen_ui_max_ratio: 0.08,
      spatial_glass_score_min: 0.93,
      lip_sync_score_min: 0.92,
      founder_identity_score_min: 0.98,
      perceptual_score_min: 0.93,
    },
  },
};

const goodEvidence = {
  status: "READY_FOR_APPROVAL",
  render: {
    technical: { duration_seconds: 40 },
    metadata: {
      premium_temporal_evidence: {
        real_footage_ratio: 0.82,
        full_screen_ui_ratio: 0.04,
        spatial_glass_score: 0.96,
        spatial_glass_tracking_proven: true,
        spatial_glass_occlusion_proven: true,
        lip_sync_score: 0.95,
        full_face_performance_proven: true,
        founder_identity_score: 0.995,
        perceptual_score: 0.96,
        corrupt_frame_count: 0,
        blank_frame_count: 0,
        glyph_placeholder_count: 0,
      },
    },
  },
};

const nonPremium = CreativePremiumTemporalQualityGateRuntime.evaluate({
  project: { metadata: {} },
  post_production: {},
  prior_result: { status: "READY_FOR_APPROVAL", passed: true },
});
assert.equal(nonPremium.applicable, false);
assert.equal(nonPremium.passed, true);

const missingEvidence = CreativePremiumTemporalQualityGateRuntime.evaluate({
  project: premiumProject,
  post_production: {
    status: "READY_FOR_APPROVAL",
    render: { technical: { duration_seconds: 40 }, metadata: {} },
  },
  prior_result: { status: "READY_FOR_APPROVAL", passed: true },
});
assert.equal(missingEvidence.applicable, true);
assert.equal(missingEvidence.passed, false);
assert.equal(missingEvidence.status, "REVIEW_REQUIRED");
assert.ok(missingEvidence.failed_checks.includes("premium_real_footage_ratio"));
assert.ok(missingEvidence.failed_checks.includes("premium_spatial_glass_quality"));
assert.ok(missingEvidence.failed_checks.includes("premium_lip_sync_quality"));

const screenshotHeavy = structuredClone(goodEvidence);
screenshotHeavy.render.metadata.premium_temporal_evidence.real_footage_ratio = 0.30;
screenshotHeavy.render.metadata.premium_temporal_evidence.full_screen_ui_ratio = 0.62;
const screenshotVerdict = CreativePremiumTemporalQualityGateRuntime.evaluate({
  project: premiumProject,
  post_production: screenshotHeavy,
  prior_result: { status: "READY_FOR_APPROVAL", passed: true },
});
assert.equal(screenshotVerdict.passed, false);
assert.ok(screenshotVerdict.failed_checks.includes("premium_real_footage_ratio"));
assert.ok(screenshotVerdict.failed_checks.includes("premium_full_screen_ui_ratio"));

const deadFounder = structuredClone(goodEvidence);
deadFounder.render.metadata.premium_temporal_evidence.lip_sync_score = 0.71;
deadFounder.render.metadata.premium_temporal_evidence.full_face_performance_proven = false;
const founderVerdict = CreativePremiumTemporalQualityGateRuntime.evaluate({
  project: premiumProject,
  post_production: deadFounder,
  prior_result: { status: "READY_FOR_APPROVAL", passed: true },
});
assert.equal(founderVerdict.passed, false);
assert.ok(founderVerdict.failed_checks.includes("premium_lip_sync_quality"));
assert.ok(founderVerdict.failed_checks.includes("premium_full_face_speaking_performance"));

const brokenFrames = structuredClone(goodEvidence);
brokenFrames.render.metadata.premium_temporal_evidence.blank_frame_count = 1;
brokenFrames.render.metadata.premium_temporal_evidence.glyph_placeholder_count = 4;
const frameVerdict = CreativePremiumTemporalQualityGateRuntime.evaluate({
  project: premiumProject,
  post_production: brokenFrames,
  prior_result: { status: "READY_FOR_APPROVAL", passed: true },
});
assert.equal(frameVerdict.passed, false);
assert.ok(frameVerdict.failed_checks.includes("premium_blank_frames"));
assert.ok(frameVerdict.failed_checks.includes("premium_glyph_placeholders"));

const proofVerdict = CreativePremiumTemporalQualityGateRuntime.evaluate({
  project: premiumProject,
  post_production: goodEvidence,
  prior_result: { status: "READY_FOR_APPROVAL", passed: true },
});
assert.equal(proofVerdict.passed, true);

const fullMaster = structuredClone(goodEvidence);
fullMaster.render.technical.duration_seconds = 237.5;
const blockedMaster = CreativePremiumTemporalQualityGateRuntime.evaluate({
  project: premiumProject,
  post_production: fullMaster,
  prior_result: { status: "READY_FOR_APPROVAL", passed: true },
});
assert.equal(blockedMaster.passed, false);
assert.ok(blockedMaster.failed_checks.includes("premium_proof_approved_before_full_master"));

fullMaster.render.metadata.premium_temporal_evidence.proof_gate = {
  approved: true,
  approval_id: "proof-approved",
};
const approvedMaster = CreativePremiumTemporalQualityGateRuntime.evaluate({
  project: premiumProject,
  post_production: fullMaster,
  prior_result: { status: "READY_FOR_APPROVAL", passed: true },
});
assert.equal(approvedMaster.passed, true);

console.log("CREATIVE_PREMIUM_TEMPORAL_QUALITY_GATE_AUDIT_PASS");
