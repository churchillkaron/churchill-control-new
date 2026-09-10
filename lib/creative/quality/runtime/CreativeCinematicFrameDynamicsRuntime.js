const CONTRACT = "CREATIVE_CINEMATIC_FRAME_DYNAMICS_V1";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function thresholdForDuration(durationSeconds) {
  if (durationSeconds <= 10) return { luminance_range: 8, mean_visual_change: 2.5, p75_visual_change: 4, maximum_low_change_run_seconds: durationSeconds };
  if (durationSeconds <= 30) return { luminance_range: 16, mean_visual_change: 4, p75_visual_change: 7, maximum_low_change_run_seconds: 16 };
  return {
    luminance_range: 28,
    mean_visual_change: 6,
    p75_visual_change: 10,
    maximum_low_change_run_seconds: Math.max(20, durationSeconds * 0.4),
  };
}

export function evaluateCinematicFrameDynamics(input = {}) {
  const metrics = object(input.metrics || input.frame_dynamics);
  const duration = finite(input.duration_seconds ?? metrics.duration_seconds);
  const declaredRestraint = input.intentional_restraint === true;
  const thresholds = thresholdForDuration(duration ?? 0);
  const luminanceRange = finite(metrics.luminance_range);
  const meanVisualChange = finite(metrics.mean_visual_change);
  const p75VisualChange = finite(metrics.p75_visual_change);
  const longestLowChangeRun = finite(metrics.longest_low_change_run_seconds);
  const sampleCount = finite(metrics.sample_count);
  const failures = [];

  if (duration === null || duration <= 0) failures.push("FRAME_DYNAMICS_DURATION_REQUIRED");
  if (sampleCount === null || sampleCount < 3) failures.push("FRAME_DYNAMICS_SAMPLE_EVIDENCE_REQUIRED");
  if (luminanceRange === null) failures.push("FRAME_DYNAMICS_LUMINANCE_RANGE_REQUIRED");
  if (meanVisualChange === null) failures.push("FRAME_DYNAMICS_VISUAL_CHANGE_REQUIRED");
  if ((duration ?? 0) > 10 && p75VisualChange === null) failures.push("FRAME_DYNAMICS_P75_CHANGE_REQUIRED");
  if ((duration ?? 0) > 10 && longestLowChangeRun === null) failures.push("FRAME_DYNAMICS_LOW_CHANGE_RUN_REQUIRED");
  if (!declaredRestraint && luminanceRange !== null && luminanceRange < thresholds.luminance_range) {
    failures.push("FRAME_DYNAMICS_VISUALLY_FLAT_LUMINANCE");
  }
  if (!declaredRestraint && meanVisualChange !== null && meanVisualChange < thresholds.mean_visual_change) {
    failures.push("FRAME_DYNAMICS_VISUALLY_FLAT_CHANGE");
  }
  if (!declaredRestraint && p75VisualChange !== null && p75VisualChange < thresholds.p75_visual_change) {
    failures.push("FRAME_DYNAMICS_WEAK_UPPER_CHANGE_QUARTILE");
  }
  if (longestLowChangeRun !== null && longestLowChangeRun > thresholds.maximum_low_change_run_seconds) {
    failures.push("FRAME_DYNAMICS_LOW_CHANGE_RUN_TOO_LONG");
  }
  if (declaredRestraint && duration > 30 && meanVisualChange !== null && meanVisualChange < 2.5) {
    failures.push("FRAME_DYNAMICS_RESTRAINT_BECAME_STASIS");
  }

  return Object.freeze({
    contract: CONTRACT,
    passed: failures.length === 0,
    failures,
    thresholds,
    metrics: {
      duration_seconds: duration,
      sample_count: sampleCount,
      luminance_range: luminanceRange,
      mean_visual_change: meanVisualChange,
      p75_visual_change: p75VisualChange,
      longest_low_change_run_seconds: longestLowChangeRun,
    },
    intentional_restraint: declaredRestraint,
    reference_provenance: {
      contract: "CREATIVE_CINEMATIC_PUBLIC_STORYBOARD_BENCHMARK_V1",
      exact_reference_count: 5,
      evidence_grade: "PARTIAL_VISUAL_ONLY",
      threshold_strategy: "CONSERVATIVE_BELOW_REFERENCE_ENVELOPE_NOT_TEMPLATE_MATCHING",
      reference_minimum_observed_luminance_range: 91.343,
      reference_minimum_observed_adjacent_visual_change_mean: 26.09,
    },
  });
}

export const CreativeCinematicFrameDynamicsRuntime = Object.freeze({
  contract: CONTRACT,
  evaluate: evaluateCinematicFrameDynamics,
});
