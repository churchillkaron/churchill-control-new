import crypto from "node:crypto";

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function text(value) {
  return String(value ?? "").trim();
}

function firstNumber(...values) {
  for (const value of values) {
    const number = finite(value);
    if (number !== null) return number;
  }
  return null;
}

function firstText(...values) {
  for (const value of values) {
    const candidate = text(value);
    if (candidate) return candidate;
  }
  return null;
}

function loudnessConfig(profile = {}) {
  const audio = object(profile.audio_quality || profile.audioQuality);
  return {
    audio,
    loudness: {
      ...object(profile.loudness_policy || profile.loudnessPolicy),
      ...object(profile.loudness),
      ...object(audio.loudness),
    },
  };
}

export function resolveCreativeDeliveryAudioPolicy(profile = {}) {
  const { audio, loudness } = loudnessConfig(profile);
  const targetIntegratedLufs = firstNumber(
    loudness.target_integrated_lufs,
    loudness.targetIntegratedLufs,
    profile.target_integrated_lufs,
    profile.targetIntegratedLufs,
  );
  const toleranceLu = firstNumber(
    loudness.loudness_tolerance_lu,
    loudness.loudnessToleranceLu,
    loudness.loudness_tolerance_lufs,
    loudness.loudnessToleranceLufs,
    profile.loudness_tolerance_lu,
    profile.loudnessToleranceLu,
  );
  const maxTruePeakDbtp = firstNumber(
    loudness.max_true_peak_dbtp,
    loudness.maxTruePeakDbtp,
    profile.max_true_peak_dbtp,
    profile.maxTruePeakDbtp,
  );
  const minimumLraLu = firstNumber(
    loudness.minimum_loudness_range_lu,
    loudness.minimumLoudnessRangeLu,
    loudness.min_lra_lu,
    loudness.minLraLu,
  );
  const maximumLraLu = firstNumber(
    loudness.maximum_loudness_range_lu,
    loudness.maximumLoudnessRangeLu,
    loudness.max_lra_lu,
    loudness.maxLraLu,
  );
  const declared = Boolean(
    audio.required === true ||
    audio.delivery_required === true ||
    audio.deliveryRequired === true ||
    loudness.required === true ||
    targetIntegratedLufs !== null ||
    toleranceLu !== null ||
    maxTruePeakDbtp !== null ||
    minimumLraLu !== null ||
    maximumLraLu !== null
  );
  const required = Boolean(
    audio.required === true ||
    audio.delivery_required === true ||
    audio.deliveryRequired === true ||
    loudness.required === true ||
    targetIntegratedLufs !== null ||
    maxTruePeakDbtp !== null
  );
  const missing = [];
  if (required && targetIntegratedLufs === null) missing.push("target_integrated_lufs");
  if (required && toleranceLu === null) missing.push("loudness_tolerance_lu");
  if (required && maxTruePeakDbtp === null) missing.push("max_true_peak_dbtp");
  if (
    minimumLraLu !== null &&
    maximumLraLu !== null &&
    minimumLraLu > maximumLraLu
  ) {
    missing.push("loudness_range_bounds_invalid");
  }

  const policy = {
    contract: "CREATIVE_DELIVERY_AUDIO_POLICY_V1",
    declared,
    required,
    complete: !required || missing.length === 0,
    standard: firstText(
      loudness.standard,
      loudness.metering_standard,
      loudness.meteringStandard,
      audio.standard,
      profile.audio_standard,
      profile.audioStandard,
    ),
    measurement_mode: "PROGRAM_INTEGRATED_BS1770",
    target_integrated_lufs: targetIntegratedLufs,
    loudness_tolerance_lu: toleranceLu,
    max_true_peak_dbtp: maxTruePeakDbtp,
    minimum_loudness_range_lu: minimumLraLu,
    maximum_loudness_range_lu: maximumLraLu,
    missing_requirements: missing,
    profile_id: firstText(profile.id, profile.name),
  };

  return {
    ...policy,
    identity: crypto.createHash("sha256")
      .update(JSON.stringify(policy))
      .digest("hex"),
  };
}

export const CreativeDeliveryAudioPolicy = Object.freeze({
  contract: "CREATIVE_DELIVERY_AUDIO_POLICY_V1",
  resolve: resolveCreativeDeliveryAudioPolicy,
});
