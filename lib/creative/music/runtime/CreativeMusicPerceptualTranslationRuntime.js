import { spawn } from "node:child_process";
import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

export const MUSIC_PERCEPTUAL_TRANSLATION_CONTRACT = "AVANTIQO_MUSIC_PERCEPTUAL_TRANSLATION_V1";
const ANALYSIS_RATE = 24000;

function text(value) { return String(value ?? "").trim(); }
function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
function db(value) { return value > 1e-12 ? 20 * Math.log10(value) : -120; }

function run(command, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("CREATIVE_MUSIC_TRANSLATION_PROCESS_TIMEOUT"));
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const result = { stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr).toString("utf8") };
      if (code === 0) resolve(result);
      else reject(new Error(result.stderr || `CREATIVE_MUSIC_TRANSLATION_PROCESS_EXIT_${code}`));
    });
  });
}

function float32(buffer) {
  const length = Math.floor(buffer.length / 4);
  const out = new Float32Array(length);
  for (let i = 0; i < length; i += 1) out[i] = buffer.readFloatLE(i * 4);
  return out;
}

function rms(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const value of samples) sum += value * value;
  return Math.sqrt(sum / samples.length);
}

function stereoMetrics(samples) {
  let sumL = 0; let sumR = 0; let sumLL = 0; let sumRR = 0; let sumLR = 0;
  let monoSq = 0; let stereoSq = 0; let peak = 0;
  const frames = Math.floor(samples.length / 2);
  if (!frames) return null;
  for (let i = 0; i < frames; i += 1) {
    const l = samples[i * 2]; const r = samples[i * 2 + 1];
    sumL += l; sumR += r; sumLL += l * l; sumRR += r * r; sumLR += l * r;
    const mono = (l + r) * 0.5;
    monoSq += mono * mono;
    stereoSq += (l * l + r * r) * 0.5;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
  }
  const meanL = sumL / frames; const meanR = sumR / frames;
  const cov = sumLR / frames - meanL * meanR;
  const varL = Math.max(0, sumLL / frames - meanL * meanL);
  const varR = Math.max(0, sumRR / frames - meanR * meanR);
  const correlation = cov / Math.max(1e-12, Math.sqrt(varL * varR));
  const monoRms = Math.sqrt(monoSq / frames);
  const stereoRms = Math.sqrt(stereoSq / frames);
  return {
    stereo_correlation: Number(clamp(correlation, -1, 1).toFixed(4)),
    mono_fold_down_loss_db: Number((db(monoRms) - db(stereoRms)).toFixed(2)),
    crest_factor_db: Number((db(peak) - db(stereoRms)).toFixed(2)),
    rms_dbfs: Number(db(stereoRms).toFixed(2)),
  };
}

async function pcm(ffmpeg, filePath, channels = 2, audioFilter = null) {
  const args = ["-hide_banner", "-loglevel", "error", "-i", filePath, "-vn"];
  if (audioFilter) args.push("-af", audioFilter);
  args.push("-ac", String(channels), "-ar", String(ANALYSIS_RATE), "-f", "f32le", "-acodec", "pcm_f32le", "-");
  const result = await run(ffmpeg, args);
  return float32(result.stdout);
}

async function bandRms(ffmpeg, filePath, lowHz, highHz) {
  const center = Math.sqrt(lowHz * highHz);
  const width = Math.max(40, highHz - lowHz);
  const result = await run(ffmpeg, [
    "-hide_banner", "-loglevel", "error", "-i", filePath, "-vn",
    "-ac", "1", "-ar", String(ANALYSIS_RATE),
    "-af", `bandpass=f=${center}:width_type=h:width=${width}`,
    "-f", "f32le", "-acodec", "pcm_f32le", "-",
  ]);
  return rms(float32(result.stdout));
}

async function deliveryDrift({ organization_id, ffmpeg, delivery, masterMetrics }) {
  const url = text(delivery?.url);
  const mime = text(delivery?.mime_type).toLowerCase();
  if (!url || (mime && !mime.startsWith("audio/")) || mime.includes("wav") || mime.includes("flac")) return null;
  const material = await materializeMedia({
    url, file_name: delivery?.name || "music-delivery", mime_type: mime || null, organization_id,
    policy: { max_bytes: 2_147_483_648, timeout_ms: 300000, max_redirects: 0 },
  });
  try {
    const metrics = stereoMetrics(await pcm(ffmpeg, material.file_path, 2));
    const levelDrift = Number((metrics.rms_dbfs - masterMetrics.rms_dbfs).toFixed(2));
    const crestDrift = Number((metrics.crest_factor_db - masterMetrics.crest_factor_db).toFixed(2));
    const correlationDrift = Number((metrics.stereo_correlation - masterMetrics.stereo_correlation).toFixed(4));
    const passed = Math.abs(levelDrift) <= 0.75 && Math.abs(crestDrift) <= 1.5 && Math.abs(correlationDrift) <= 0.12;
    return {
      name: delivery?.name || null, mime_type: mime || null,
      level_drift_db: levelDrift, crest_drift_db: crestDrift, stereo_correlation_drift: correlationDrift,
      passed, measured_from_decoded_delivery: true,
    };
  } finally {
    await material.cleanup().catch(() => {});
  }
}

function thresholds(destinationIds = []) {
  const ids = new Set(destinationIds);
  return {
    minimum_correlation: ids.has("club") || ids.has("live_backing") ? -0.05 : -0.15,
    maximum_mono_loss_db: ids.has("club") || ids.has("live_backing") ? 2.5 : 4,
    minimum_crest_db: ids.has("club") ? 5 : 6,
    maximum_crest_db: ids.has("film_video_music") || ids.has("archival") ? 24 : 20,
    low_end_min_db: ids.has("club") ? -10 : -16,
    low_end_max_db: ids.has("club") ? 5 : 2,
    harshness_max_db: ids.has("film_video_music") ? 3 : 5,
  };
}

export async function analyzeMusicPerceptualTranslation({
  organization_id,
  asset = {},
  destinations = [],
  media_tools = {},
} = {}) {
  if (!organization_id) throw new Error("CREATIVE_MUSIC_TRANSLATION_ORGANIZATION_REQUIRED");
  const sourceUrl = text(asset.file_url || asset.audio_url || asset.url);
  if (!sourceUrl) throw new Error("CREATIVE_MUSIC_TRANSLATION_MASTER_REQUIRED");
  const ffmpeg = text(media_tools.ffmpeg || process.env.CREATIVE_FFMPEG_PATH) || "ffmpeg";
  const material = await materializeMedia({
    url: sourceUrl,
    file_name: asset.file_name || "music-master.wav",
    mime_type: asset.metadata?.mime_type || "audio/wav",
    organization_id,
    policy: { max_bytes: 2_147_483_648, timeout_ms: 300000, max_redirects: 0 },
  });
  try {
    const stereo = stereoMetrics(await pcm(ffmpeg, material.file_path, 2));
    const low = await bandRms(ffmpeg, material.file_path, 30, 160);
    const body = await bandRms(ffmpeg, material.file_path, 160, 2500);
    const harsh = await bandRms(ffmpeg, material.file_path, 2500, 8000);
    const lowVsBody = Number((db(low) - db(body)).toFixed(2));
    const harshVsBody = Number((db(harsh) - db(body)).toFixed(2));
    const limits = thresholds(destinations);
    const phoneProxy = stereoMetrics(await pcm(ffmpeg, material.file_path, 2, "highpass=f=250,lowpass=f=5000"));
    const laptopProxy = stereoMetrics(await pcm(ffmpeg, material.file_path, 2, "highpass=f=120,lowpass=f=12000"));
    const phoneLevelDelta = Number((phoneProxy.rms_dbfs - stereo.rms_dbfs).toFixed(2));
    const laptopLevelDelta = Number((laptopProxy.rms_dbfs - stereo.rms_dbfs).toFixed(2));
    const codecTranslation = [];
    for (const delivery of Array.isArray(asset.metadata?.deliveries) ? asset.metadata.deliveries : []) {
      const drift = await deliveryDrift({ organization_id, ffmpeg, delivery, masterMetrics: stereo });
      if (drift) codecTranslation.push(drift);
    }
    const checks = {
      stereo_stability: stereo.stereo_correlation >= limits.minimum_correlation,
      mono_compatibility: stereo.mono_fold_down_loss_db >= -limits.maximum_mono_loss_db,
      transient_integrity: stereo.crest_factor_db >= limits.minimum_crest_db && stereo.crest_factor_db <= limits.maximum_crest_db,
      low_end_balance: lowVsBody >= limits.low_end_min_db && lowVsBody <= limits.low_end_max_db,
      harshness_risk: harshVsBody <= limits.harshness_max_db,
      codec_translation: codecTranslation.every((row) => row.passed === true),
    };
    const translationContexts = [
      { id: "STUDIO_MONITORS", method: "MASTER_SIGNAL", passed: checks.stereo_stability && checks.transient_integrity },
      { id: "HEADPHONES", method: "STEREO_SIGNAL_PROXY", passed: checks.stereo_stability && checks.harshness_risk },
      { id: "PHONE_SPEAKER", method: "BAND_LIMITED_DEVICE_PROXY", passed: phoneProxy.crest_factor_db >= 3 && phoneLevelDelta >= -24 },
      { id: "LAPTOP", method: "BAND_LIMITED_DEVICE_PROXY", passed: laptopProxy.crest_factor_db >= 3 && laptopLevelDelta >= -18 },
      { id: "MONO", method: "MONO_FOLD_DOWN", passed: checks.mono_compatibility },
      { id: "STREAMING_CODEC", method: "DECODED_DELIVERY_DRIFT", passed: checks.codec_translation },
    ];
    const contextFailures = translationContexts.filter((row) => row.passed !== true).map((row) => `CONTEXT_${row.id}`);
    const failures = [
      ...Object.entries(checks).filter(([, passed]) => !passed).map(([name]) => name.toUpperCase()),
      ...contextFailures,
    ];
    return Object.freeze({
      contract: MUSIC_PERCEPTUAL_TRANSLATION_CONTRACT,
      asset_id: asset.id || null,
      destinations: [...new Set(destinations.map((item) => text(item)).filter(Boolean))],
      measured: true,
      metrics: {
        ...stereo,
        low_end_vs_body_db: lowVsBody,
        harshness_vs_body_db: harshVsBody,
      },
      thresholds: limits,
      codec_translation: codecTranslation,
      device_proxies: {
        phone_speaker: { ...phoneProxy, level_delta_db: phoneLevelDelta },
        laptop: { ...laptopProxy, level_delta_db: laptopLevelDelta },
      },
      translation_contexts: translationContexts,
      translation_contexts_passed: translationContexts.filter((row) => row.passed === true).map((row) => row.id),
      checks,
      failures,
      passed: failures.length === 0,
      interpretation: failures.length ? "TRANSLATION_REVIEW_REQUIRED" : "TRANSLATION_PASS",
      measurement_scope: "MASTER_SIGNAL_ONLY",
      artistic_intent_inferred: false,
      mutation_authorized: false,
      publication_authorized: false,
    });
  } finally {
    await material.cleanup().catch(() => {});
  }
}

export function summarizeMusicPerceptualTranslation(results = []) {
  const rows = Array.isArray(results) ? results.filter(Boolean) : [];
  return Object.freeze({
    contract: "AVANTIQO_MUSIC_PERCEPTUAL_TRANSLATION_SUMMARY_V1",
    measured_variant_count: rows.length,
    all_variants_passed: rows.length > 0 && rows.every((row) => row.passed === true),
    translation_contexts_passed: [...new Set(rows.flatMap((row) => row.translation_contexts_passed || []))],
    translation_contexts: rows.flatMap((row) => (row.translation_contexts || []).map((context) => ({ asset_id: row.asset_id, destinations: row.destinations, ...context }))),
    failures: rows.flatMap((row) => row.failures.map((failure) => ({
      asset_id: row.asset_id,
      destinations: row.destinations,
      failure,
    }))),
    reasoning_brief: rows.map((row) => (
      `${row.destinations.join(" + ") || "master"}: stereo correlation ${row.metrics.stereo_correlation}, ` +
      `mono fold-down ${row.metrics.mono_fold_down_loss_db} dB, crest ${row.metrics.crest_factor_db} dB, ` +
      `low/body ${row.metrics.low_end_vs_body_db} dB, upper-mid/body ${row.metrics.harshness_vs_body_db} dB — ` +
      `${row.passed ? "translation pass" : "review required"}.`
    )),
    mutation_authorized: false,
    publication_authorized: false,
  });
}

export const CreativeMusicPerceptualTranslationRuntime = Object.freeze({
  contract: MUSIC_PERCEPTUAL_TRANSLATION_CONTRACT,
  analyze: analyzeMusicPerceptualTranslation,
  summarize: summarizeMusicPerceptualTranslation,
});
