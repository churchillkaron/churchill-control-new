function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function thresholds(duration) {
  if (duration <= 10) return { p90_p10_lufs_range: 3, active_lufs_range: 8 };
  if (duration <= 30) return { p90_p10_lufs_range: 5, active_lufs_range: 12 };
  return { p90_p10_lufs_range: 7, active_lufs_range: 16 };
}

export function evaluateCinematicAudioDynamics(input = {}) {
  const metrics = object(input.metrics || input.audio_dynamics);
  const duration = finite(input.duration_seconds ?? metrics.duration_seconds);
  const intentionalRestraint = input.intentional_restraint === true;
  const expected = thresholds(duration ?? 0);
  const sampleCount = finite(metrics.active_sample_count);
  const p90p10 = finite(metrics.p90_p10_lufs_range);
  const activeRange = finite(metrics.active_lufs_range);
  const failures = [];

  if (duration === null || duration <= 0) failures.push("AUDIO_DYNAMICS_DURATION_REQUIRED");
  if (sampleCount === null || sampleCount < 10) failures.push("AUDIO_DYNAMICS_SAMPLE_EVIDENCE_REQUIRED");
  if (p90p10 === null) failures.push("AUDIO_DYNAMICS_PERCENTILE_RANGE_REQUIRED");
  if (activeRange === null) failures.push("AUDIO_DYNAMICS_ACTIVE_RANGE_REQUIRED");
  if (!intentionalRestraint && p90p10 !== null && p90p10 < expected.p90_p10_lufs_range) {
    failures.push("AUDIO_DYNAMICS_PERCENTILE_RANGE_TOO_FLAT");
  }
  if (!intentionalRestraint && activeRange !== null && activeRange < expected.active_lufs_range) {
    failures.push("AUDIO_DYNAMICS_ACTIVE_RANGE_TOO_FLAT");
  }
  if (intentionalRestraint && (duration ?? 0) > 30 && activeRange !== null && activeRange < 5) {
    failures.push("AUDIO_DYNAMICS_RESTRAINT_BECAME_CONSTANT_BED");
  }

  return Object.freeze({
    contract: "CREATIVE_CINEMATIC_AUDIO_DYNAMICS_V1",
    passed: failures.length === 0,
    failures,
    thresholds: expected,
    metrics: {
      duration_seconds: duration,
      active_sample_count: sampleCount,
      p90_p10_lufs_range: p90p10,
      active_lufs_range: activeRange,
    },
    intentional_restraint: intentionalRestraint,
    reference_provenance: {
      source: "LAMBORGHINI_REVUELTO_FROM_NOW_ON_PUBLIC_AWARD_MASTER",
      evidence_kind: "FULL_REFERENCE_AUDIO_EBU_R128",
      measured_duration_seconds: 118.4,
      measured_p90_p10_lufs_range: 15.04,
      measured_active_lufs_range: 30.58,
      threshold_strategy: "CONSERVATIVE_BELOW_REFERENCE_NOT_TEMPLATE_MATCHING",
    },
  });
}
