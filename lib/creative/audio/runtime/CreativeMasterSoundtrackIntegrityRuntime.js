import { spawn } from "node:child_process";

import {
  materializeMedia,
} from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function positive(value, fallback = null) {
  const number = finite(value);
  return number !== null && number > 0 ? number : fallback;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function mean(values = []) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function rms(values = []) {
  if (!values.length) return 0;
  return Math.sqrt(mean(values.map((value) => value * value)));
}

function dbfs(value) {
  return value > 0 ? 20 * Math.log10(value) : -120;
}

function pcmExtraction(command, args, timeoutMs, maximumBytes) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    let settled = false;
    let timer = null;

    const finish = (error = null, result = null) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };

    if (timeoutMs) {
      timer = setTimeout(() => {
        child.kill("SIGKILL");
        finish(new Error("MASTER_SOUNDTRACK_INTEGRITY_TIMEOUT"));
      }, timeoutMs);
    }

    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (maximumBytes && bytes > maximumBytes) {
        child.kill("SIGKILL");
        finish(new Error("MASTER_SOUNDTRACK_INTEGRITY_PCM_LIMIT_EXCEEDED"));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8") ||
          `MASTER_SOUNDTRACK_INTEGRITY_EXTRACTION_EXIT_${code}`,
        ));
        return;
      }
      finish(null, Buffer.concat(stdout));
    });
  });
}

function samples(buffer) {
  const length = Math.floor(buffer.length / 2);
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    output[index] = buffer.readInt16LE(index * 2) / 32768;
  }
  return output;
}

function envelope(values, sampleRate, windowSeconds = 0.1) {
  const windowSize = Math.max(1, Math.round(sampleRate * windowSeconds));
  const output = [];
  for (let offset = 0; offset < values.length; offset += windowSize) {
    const end = Math.min(values.length, offset + windowSize);
    let square = 0;
    for (let index = offset; index < end; index += 1) {
      square += values[index] * values[index];
    }
    output.push(Math.sqrt(square / Math.max(1, end - offset)));
  }
  return output;
}

function normalize(values = []) {
  const maximum = Math.max(...values, 0);
  if (maximum <= 0) return values.map(() => 0);
  return values.map((value) => value / maximum);
}

function correlation(left = [], right = []) {
  const length = Math.min(left.length, right.length);
  if (length < 2) return 0;
  const a = left.slice(0, length);
  const b = right.slice(0, length);
  const meanA = mean(a);
  const meanB = mean(b);
  let numerator = 0;
  let powerA = 0;
  let powerB = 0;
  for (let index = 0; index < length; index += 1) {
    const deltaA = a[index] - meanA;
    const deltaB = b[index] - meanB;
    numerator += deltaA * deltaB;
    powerA += deltaA * deltaA;
    powerB += deltaB * deltaB;
  }
  const denominator = Math.sqrt(powerA * powerB);
  return denominator > 0 ? numerator / denominator : 0;
}

function meanAbsoluteError(left = [], right = []) {
  const length = Math.min(left.length, right.length);
  if (!length) return 1;
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    total += Math.abs(left[index] - right[index]);
  }
  return total / length;
}

function gapEvidence(sourceEnvelope, renderEnvelope, windowSeconds) {
  const length = Math.min(sourceEnvelope.length, renderEnvelope.length);
  const sourceMaximum = Math.max(...sourceEnvelope, 0);
  const renderMaximum = Math.max(...renderEnvelope, 0);
  const sourceThreshold = sourceMaximum * 0.08;
  const renderThreshold = renderMaximum * 0.025;
  let current = 0;
  let maximum = 0;
  let total = 0;
  const gaps = [];

  for (let index = 0; index < length; index += 1) {
    const missing = sourceEnvelope[index] >= sourceThreshold &&
      renderEnvelope[index] < renderThreshold;
    if (missing) {
      current += 1;
      total += 1;
      maximum = Math.max(maximum, current);
    } else if (current) {
      gaps.push({
        start_seconds: Number(((index - current) * windowSeconds).toFixed(3)),
        end_seconds: Number((index * windowSeconds).toFixed(3)),
        duration_seconds: Number((current * windowSeconds).toFixed(3)),
      });
      current = 0;
    }
  }
  if (current) {
    gaps.push({
      start_seconds: Number(((length - current) * windowSeconds).toFixed(3)),
      end_seconds: Number((length * windowSeconds).toFixed(3)),
      duration_seconds: Number((current * windowSeconds).toFixed(3)),
    });
  }

  return {
    missing_window_count: total,
    total_missing_seconds: Number((total * windowSeconds).toFixed(3)),
    maximum_contiguous_gap_seconds: Number((maximum * windowSeconds).toFixed(3)),
    gaps: gaps.filter((gap) => gap.duration_seconds >= windowSeconds * 2),
  };
}

async function decode({
  ffmpegPath,
  sourcePath,
  sampleRate,
  durationSeconds,
  timeoutMs,
  maximumBytes,
}) {
  const args = [
    "-v", "error",
    "-i", sourcePath,
    "-vn",
    "-ac", "1",
    "-ar", String(sampleRate),
  ];
  if (durationSeconds) args.push("-t", String(durationSeconds));
  args.push(
    "-f", "s16le",
    "-acodec", "pcm_s16le",
    "pipe:1",
  );
  const pcm = await pcmExtraction(ffmpegPath, args, timeoutMs, maximumBytes);
  return samples(pcm);
}

export const CreativeMasterSoundtrackIntegrityRuntime = {
  async validate({
    organization_id,
    source_asset_node,
    render_asset_node,
    expected_duration_seconds,
    policy = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!source_asset_node?.url) {
      throw new Error("MASTER_SOUNDTRACK_SOURCE_ASSET_NODE_REQUIRED");
    }
    if (!render_asset_node?.url) {
      throw new Error("MASTER_SOUNDTRACK_RENDER_ASSET_NODE_REQUIRED");
    }

    const ffmpegPath =
      policy.ffmpeg_path ||
      policy.ffmpegPath ||
      process.env.CREATIVE_MEDIA_FFMPEG_PATH ||
      null;
    if (!ffmpegPath) {
      throw new Error("FFMPEG_NOT_CONFIGURED_FOR_MASTER_SOUNDTRACK_INTEGRITY");
    }

    const sampleRate = Math.max(4000, Math.round(positive(
      policy.soundtrack_integrity_sample_rate ||
      policy.soundtrackIntegritySampleRate,
      8000,
    )));
    const windowSeconds = positive(
      policy.soundtrack_integrity_window_seconds ||
      policy.soundtrackIntegrityWindowSeconds,
      0.1,
    );
    const tolerance = positive(
      policy.soundtrack_duration_tolerance_seconds ||
      policy.soundtrackDurationToleranceSeconds,
      0.25,
    );
    const minimumCorrelation = finite(
      policy.minimum_soundtrack_envelope_correlation ||
      policy.minimumSoundtrackEnvelopeCorrelation,
    ) ?? 0.98;
    const maximumEnvelopeError = finite(
      policy.maximum_soundtrack_envelope_error ||
      policy.maximumSoundtrackEnvelopeError,
    ) ?? 0.08;
    const maximumLevelDifference = positive(
      policy.maximum_soundtrack_level_difference_db ||
      policy.maximumSoundtrackLevelDifferenceDb,
      1.5,
    );
    const maximumGap = positive(
      policy.maximum_soundtrack_gap_seconds ||
      policy.maximumSoundtrackGapSeconds,
      0.25,
    );
    const timeoutMs = positive(
      policy.soundtrack_integrity_timeout_ms ||
      policy.soundtrackIntegrityTimeoutMs,
      180000,
    );
    const maximumBytes = positive(
      policy.soundtrack_integrity_max_pcm_bytes ||
      policy.soundtrackIntegrityMaxPcmBytes,
      128 * 1024 * 1024,
    );
    const expectedDuration = positive(
      expected_duration_seconds,
      positive(source_asset_node.technical?.duration_seconds),
    );
    if (!expectedDuration) {
      throw new Error("MASTER_SOUNDTRACK_EXPECTED_DURATION_REQUIRED");
    }

    const [source, render] = await Promise.all([
      materializeMedia({
        url: source_asset_node.url,
        file_name: source_asset_node.name || "master-soundtrack",
        mime_type: source_asset_node.technical?.mime_type || null,
        organization_id,
        policy,
      }),
      materializeMedia({
        url: render_asset_node.url,
        file_name: render_asset_node.name || "render",
        mime_type: render_asset_node.technical?.mime_type || null,
        organization_id,
        policy,
      }),
    ]);

    try {
      const [sourceSamples, renderSamples] = await Promise.all([
        decode({
          ffmpegPath,
          sourcePath: source.file_path,
          sampleRate,
          durationSeconds: expectedDuration,
          timeoutMs,
          maximumBytes,
        }),
        decode({
          ffmpegPath,
          sourcePath: render.file_path,
          sampleRate,
          durationSeconds: expectedDuration + tolerance,
          timeoutMs,
          maximumBytes,
        }),
      ]);

      const sourceDuration = sourceSamples.length / sampleRate;
      const renderDuration = renderSamples.length / sampleRate;
      const durationDifference = Math.abs(renderDuration - expectedDuration);
      const sourceEnvelope = envelope(sourceSamples, sampleRate, windowSeconds);
      const renderEnvelope = envelope(renderSamples, sampleRate, windowSeconds);
      const normalizedSource = normalize(sourceEnvelope);
      const normalizedRender = normalize(renderEnvelope);
      const envelopeCorrelation = correlation(normalizedSource, normalizedRender);
      const envelopeError = meanAbsoluteError(normalizedSource, normalizedRender);
      const sourceRmsDbfs = dbfs(rms(Array.from(sourceSamples)));
      const renderRmsDbfs = dbfs(rms(Array.from(renderSamples)));
      const levelDifference = Math.abs(renderRmsDbfs - sourceRmsDbfs);
      const gaps = gapEvidence(sourceEnvelope, renderEnvelope, windowSeconds);

      const checks = [
        {
          id: "master_soundtrack_source_signal_present",
          passed: sourceRmsDbfs > -80,
          expected: "> -80 dBFS",
          actual: Number(sourceRmsDbfs.toFixed(3)),
        },
        {
          id: "master_soundtrack_render_signal_present",
          passed: renderRmsDbfs > -80,
          expected: "> -80 dBFS",
          actual: Number(renderRmsDbfs.toFixed(3)),
        },
        {
          id: "master_soundtrack_duration_preserved",
          passed: durationDifference <= tolerance,
          expected: {
            duration_seconds: expectedDuration,
            tolerance_seconds: tolerance,
          },
          actual: Number(renderDuration.toFixed(6)),
        },
        {
          id: "master_soundtrack_envelope_correlation",
          passed: envelopeCorrelation >= minimumCorrelation,
          expected: `>= ${minimumCorrelation}`,
          actual: Number(envelopeCorrelation.toFixed(6)),
        },
        {
          id: "master_soundtrack_envelope_error",
          passed: envelopeError <= maximumEnvelopeError,
          expected: `<= ${maximumEnvelopeError}`,
          actual: Number(envelopeError.toFixed(6)),
        },
        {
          id: "master_soundtrack_level_preserved",
          passed: levelDifference <= maximumLevelDifference,
          expected: `<= ${maximumLevelDifference} dB`,
          actual: Number(levelDifference.toFixed(3)),
        },
        {
          id: "master_soundtrack_no_missing_signal_gaps",
          passed: gaps.maximum_contiguous_gap_seconds <= maximumGap,
          expected: `<= ${maximumGap}s`,
          actual: gaps.maximum_contiguous_gap_seconds,
          evidence: gaps,
        },
      ];

      return {
        contract: "MASTER_SOUNDTRACK_INTEGRITY_V1",
        passed: checks.every((check) => check.passed),
        source_asset_node_id: source_asset_node.id,
        render_asset_node_id: render_asset_node.id,
        expected_duration_seconds: expectedDuration,
        source_duration_seconds: Number(sourceDuration.toFixed(6)),
        render_duration_seconds: Number(renderDuration.toFixed(6)),
        source_rms_dbfs: Number(sourceRmsDbfs.toFixed(3)),
        render_rms_dbfs: Number(renderRmsDbfs.toFixed(3)),
        envelope_correlation: Number(clamp(envelopeCorrelation, -1, 1).toFixed(6)),
        envelope_mean_absolute_error: Number(envelopeError.toFixed(6)),
        level_difference_db: Number(levelDifference.toFixed(3)),
        gaps,
        checks,
        failed_checks: checks.filter((check) => !check.passed).map((check) => check.id),
        method: "LOCAL_PCM_RMS_ENVELOPE_CORRELATION_AND_GAP_DETECTION",
        evaluated_at: new Date().toISOString(),
      };
    } finally {
      await Promise.all([
        source.cleanup(),
        render.cleanup(),
      ]);
    }
  },
};
