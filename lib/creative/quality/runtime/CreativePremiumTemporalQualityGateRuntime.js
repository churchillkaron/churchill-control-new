function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value) {
  return String(value ?? "").trim();
}

function booleanValue(value) {
  return value === true ? true : value === false ? false : null;
}

function enabled(project = {}) {
  const contract = text(project.metadata?.studio_project_contract).toUpperCase();
  return (
    project.metadata?.premium_temporal_quality === true ||
    contract.startsWith("CREATIVE_STUDIO_PREMIUM_TEMPORAL")
  );
}

function thresholdCheck({ id, actual, threshold, comparator, repair }) {
  if (threshold === null) return null;
  const passed = actual !== null && comparator(actual, threshold);
  return {
    id,
    passed,
    evidence: { actual, threshold },
    repair_instructions: passed ? [] : [repair],
  };
}

function countCheck({ id, actual, maximum, repair }) {
  if (maximum === null) return null;
  const passed = actual !== null && actual <= maximum;
  return {
    id,
    passed,
    evidence: { actual, maximum },
    repair_instructions: passed ? [] : [repair],
  };
}

function booleanCheck({ id, actual, required, repair }) {
  if (!required) return null;
  const passed = actual === true;
  return {
    id,
    passed,
    evidence: { actual },
    repair_instructions: passed ? [] : [repair],
  };
}

function premiumEvidence(postProduction = {}) {
  const render = object(postProduction.render);
  const metadata = object(render.metadata);
  const technicalQc = object(
    postProduction.technical_qc || metadata.technical_qc,
  );
  const premium = object(
    metadata.premium_temporal_evidence ||
    postProduction.premium_temporal_evidence ||
    postProduction.premium_temporal_quality,
  );
  const composition = object(premium.composition || metadata.composition_quality);
  const vfx = object(premium.vfx || metadata.vfx_quality);
  const performance = object(premium.performance || metadata.performance_quality);
  const perceptual = object(
    postProduction.perceptual_quality ||
    postProduction.quality ||
    metadata.perceptual_quality ||
    metadata.quality,
  );

  return {
    render,
    metadata,
    technicalQc,
    premium,
    values: {
      real_footage_ratio: finite(
        premium.real_footage_ratio ??
        composition.real_footage_ratio ??
        metadata.real_footage_ratio ??
        metadata.cinematic_footage_ratio,
      ),
      full_screen_ui_ratio: finite(
        premium.full_screen_ui_ratio ??
        composition.full_screen_ui_ratio ??
        metadata.full_screen_ui_ratio,
      ),
      spatial_glass_score: finite(
        premium.spatial_glass_score ??
        vfx.spatial_glass_score ??
        vfx.glass_quality_score ??
        metadata.spatial_glass_score,
      ),
      spatial_glass_tracking_proven: booleanValue(
        premium.spatial_glass_tracking_proven ??
        vfx.spatial_glass_tracking_proven ??
        vfx.motion_tracking_proven ??
        metadata.spatial_glass_tracking_proven,
      ),
      spatial_glass_occlusion_proven: booleanValue(
        premium.spatial_glass_occlusion_proven ??
        vfx.spatial_glass_occlusion_proven ??
        vfx.occlusion_proven ??
        metadata.spatial_glass_occlusion_proven,
      ),
      lip_sync_score: finite(
        premium.lip_sync_score ??
        performance.lip_sync_score ??
        metadata.lip_sync_score,
      ),
      full_face_performance_proven: booleanValue(
        premium.full_face_performance_proven ??
        performance.full_face_performance_proven ??
        metadata.full_face_performance_proven,
      ),
      founder_identity_score: finite(
        premium.founder_identity_score ??
        performance.founder_identity_score ??
        performance.identity_score ??
        metadata.founder_identity_score,
      ),
      perceptual_score: finite(
        premium.perceptual_score ??
        perceptual.overall_score ??
        perceptual.score ??
        metadata.perceptual_score,
      ),
      corrupt_frame_count: finite(
        premium.corrupt_frame_count ?? technicalQc.corrupt_frame_count,
      ),
      blank_frame_count: finite(
        premium.blank_frame_count ?? technicalQc.blank_frame_count,
      ),
      glyph_placeholder_count: finite(
        premium.glyph_placeholder_count ?? technicalQc.glyph_placeholder_count,
      ),
      duration_seconds: finite(
        render.technical?.duration_seconds ??
        metadata.duration_seconds ??
        postProduction.duration_seconds,
      ),
    },
  };
}

function configuredGate(project = {}) {
  return object(project.metadata?.quality_gate);
}

function proofGate(project = {}) {
  return object(project.metadata?.proof_gate);
}

function visualSystem(project = {}) {
  return object(project.metadata?.visual_system);
}

function performanceSystem(project = {}) {
  return object(project.metadata?.performance_system);
}

export const CreativePremiumTemporalQualityGateRuntime = Object.freeze({
  contract: "CREATIVE_PREMIUM_TEMPORAL_QUALITY_GATE_V2",

  enabled,

  evaluate({ project = {}, post_production = {}, prior_result = {} } = {}) {
    if (!enabled(project)) {
      return {
        contract: this.contract,
        applicable: false,
        passed: true,
        status: prior_result.status || post_production.status || null,
        checks: [],
        failed_checks: [],
        repair_instructions: [],
      };
    }

    const gate = configuredGate(project);
    const proof = proofGate(project);
    const visual = visualSystem(project);
    const performancePolicy = performanceSystem(project);
    const glass = object(visual.spatial_glass);
    const lipSync = object(performancePolicy.lip_sync);
    const resolved = premiumEvidence(post_production);
    const values = resolved.values;

    const realFootageMinimum = finite(
      gate.real_footage_min_ratio ?? visual.real_footage_min_ratio,
    );
    const fullScreenUiMaximum = finite(
      gate.full_screen_ui_max_ratio ?? visual.full_screen_ui_max_ratio,
    );
    const glassMinimum = finite(
      gate.spatial_glass_score_min ?? glass.quality_floor,
    );
    const lipSyncMinimum = finite(
      gate.lip_sync_score_min ?? lipSync.quality_floor,
    );

    const checks = [
      thresholdCheck({
        id: "premium_real_footage_ratio",
        actual: values.real_footage_ratio,
        threshold: realFootageMinimum,
        comparator: (actual, threshold) => actual >= threshold,
        repair:
          "Re-edit with cinematic human/operational footage as the dominant visual language; product UI must support the story rather than replace it.",
      }),
      thresholdCheck({
        id: "premium_full_screen_ui_ratio",
        actual: values.full_screen_ui_ratio,
        threshold: fullScreenUiMaximum,
        comparator: (actual, threshold) => actual <= threshold,
        repair:
          "Reduce full-screen software captures and integrate authentic UI as short in-world device or editorial proof inserts.",
      }),
      thresholdCheck({
        id: "premium_spatial_glass_quality",
        actual: values.spatial_glass_score,
        threshold: glassMinimum,
        comparator: (actual, threshold) => actual >= threshold,
        repair:
          "Rebuild spatial glass with optical depth, subtle refraction, restrained edge light, physical parallax and high-resolution information design.",
      }),
      booleanCheck({
        id: "premium_spatial_glass_tracking",
        actual: values.spatial_glass_tracking_proven,
        required: glass.required === true,
        repair:
          "Provide measured subject/camera tracking evidence so the glass remains physically anchored instead of behaving like a flat screen-space overlay.",
      }),
      booleanCheck({
        id: "premium_spatial_glass_occlusion",
        actual: values.spatial_glass_occlusion_proven,
        required: glass.required === true,
        repair:
          "Provide subject-aware occlusion evidence so the founder can naturally pass in front of and behind spatial glass layers.",
      }),
      thresholdCheck({
        id: "premium_lip_sync_quality",
        actual: values.lip_sync_score,
        threshold: lipSyncMinimum,
        comparator: (actual, threshold) => actual >= threshold,
        repair:
          "Regenerate from a speaking-ready performance source and re-run lip sync; weak mouth-only animation is release-blocking.",
      }),
      booleanCheck({
        id: "premium_full_face_speaking_performance",
        actual: values.full_face_performance_proven,
        required:
          performancePolicy.speaking_ready_motion_required === true ||
          lipSync.full_face_performance_required === true,
        repair:
          "Founder speech must show coordinated jaw, cheeks, eyes, head, neck, shoulders and breathing rather than isolated mouth movement.",
      }),
      thresholdCheck({
        id: "premium_founder_identity_quality",
        actual: values.founder_identity_score,
        threshold: finite(gate.founder_identity_score_min),
        comparator: (actual, threshold) => actual >= threshold,
        repair:
          "Regenerate from the approved identity reference and reject any founder identity drift before finishing.",
      }),
      thresholdCheck({
        id: "premium_perceptual_quality",
        actual: values.perceptual_score,
        threshold: finite(gate.perceptual_score_min),
        comparator: (actual, threshold) => actual >= threshold,
        repair:
          "Rework cinematography, compositing, typography, grading, pacing and sound until the premium perceptual quality floor is met.",
      }),
      countCheck({
        id: "premium_corrupt_frames",
        actual: values.corrupt_frame_count,
        maximum: finite(gate.corrupt_frame_count_max),
        repair: "Repair or regenerate every corrupted frame before release.",
      }),
      countCheck({
        id: "premium_blank_frames",
        actual: values.blank_frame_count,
        maximum: finite(gate.blank_frame_count_max),
        repair: "Remove or repair every unintended blank or gray frame before release.",
      }),
      countCheck({
        id: "premium_glyph_placeholders",
        actual: values.glyph_placeholder_count,
        maximum: finite(gate.glyph_placeholder_count_max),
        repair:
          "Re-render all typography with verified font and glyph coverage; placeholder boxes are release-blocking.",
      }),
    ].filter(Boolean);

    const proofDuration = finite(proof.duration_seconds);
    const isFullMaster = Boolean(
      proof.required === true &&
      proofDuration !== null &&
      values.duration_seconds !== null &&
      values.duration_seconds > proofDuration + 1,
    );
    if (proof.approval_required_before_full_master === true && isFullMaster) {
      const proofEvidence = object(
        resolved.premium.proof_gate || resolved.metadata.proof_gate,
      );
      checks.push({
        id: "premium_proof_approved_before_full_master",
        passed: proofEvidence.approved === true,
        evidence: {
          proof_duration_seconds: proofDuration,
          render_duration_seconds: values.duration_seconds,
          approved: proofEvidence.approved === true,
          approval_id: text(proofEvidence.approval_id) || null,
        },
        repair_instructions: proofEvidence.approved === true
          ? []
          : [
            "Do not release the full master until the required proof sequence has explicit approval evidence.",
          ],
      });
    }

    const failed = checks.filter((check) => !check.passed);
    const priorPassed = prior_result.passed !== false &&
      prior_result.status !== "REVIEW_REQUIRED";
    const passed = priorPassed && failed.length === 0;

    return {
      contract: this.contract,
      applicable: true,
      passed,
      status: passed ? "READY_FOR_APPROVAL" : "REVIEW_REQUIRED",
      checks,
      failed_checks: failed.map((check) => check.id),
      repair_instructions: [
        ...new Set(failed.flatMap((check) => list(check.repair_instructions))),
      ],
      evidence_contract: "CREATIVE_PREMIUM_TEMPORAL_EVIDENCE_V2",
      evidence_present: Object.keys(resolved.premium).length > 0,
      prior_result_status: prior_result.status || null,
      prior_result_passed: prior_result.passed ?? null,
    };
  },
});
