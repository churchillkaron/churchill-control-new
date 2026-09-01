import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeProviderAssetUrl } from "@/lib/creative/assets/storage/resolveCreativeProviderAssetUrl";

const STORAGE_PREFIX = "storage://";
const STORAGE_BUCKET = "creative-assets";
const JOB_MARKER = "|aqdur1|";
const SHORT_FORM_MAX_SECONDS = 30;
const MAX_AUDIO_BYTES = 96 * 1024 * 1024;
const TAIL_WINDOW_SECONDS = 0.75;
const SILENCE_RMS_THRESHOLD = 0.001; // -60 dBFS

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function finite(value) { const n = Number(value); return Number.isFinite(n) ? n : null; }
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }

function durationFromInput(input = {}) {
  const values = [
    input?.generation?.duration_seconds,
    input?.generation?.duration,
    input?.output_spec?.duration_seconds,
    input?.output_spec?.duration,
    input?.duration_seconds,
    input?.duration,
  ];
  for (const value of values) {
    const number = finite(value);
    if (number !== null && number >= 10 && number <= 600) return number;
  }
  return null;
}

function guardedGenerationDuration(requested) {
  if (requested > SHORT_FORM_MAX_SECONDS) return requested;
  const guardSeconds = requested <= 15 ? 6 : 4;
  return clamp(requested + guardSeconds, 10, 600);
}

function continuousMusicInstruction(source) {
  const original = text(source);
  const guard = "Maintain continuous musical content through the full requested clip; no early outro, fade-to-silence, dead air, or silent tail.";
  if (!original) return guard;
  if (/no early outro|silent tail/i.test(original)) return original;
  return `${original} ${guard}`;
}

export function prepareAudioDurationGuard(input = {}) {
  const capability = text(input.capability);
  const requested = capability === "ai.music.generate" ? durationFromInput(input) : null;
  if (requested === null || requested > SHORT_FORM_MAX_SECONDS) {
    return { input, guard: null };
  }
  const generation = guardedGenerationDuration(requested);
  const prepared = {
    ...input,
    prompt: continuousMusicInstruction(input.prompt),
    provider_prompt: input.provider_prompt ? continuousMusicInstruction(input.provider_prompt) : input.provider_prompt,
    generation: {
      ...object(input.generation),
      duration_seconds: generation,
      duration: generation,
    },
    output_spec: {
      ...object(input.output_spec),
      duration_seconds: generation,
      duration: generation,
    },
    provider_parameters: {
      ...object(input.provider_parameters),
      avantiqo_duration_guard_contract: "AVANTIQO_AUDIO_DURATION_GUARD_V1",
      requested_duration_seconds: requested,
      generation_duration_seconds: generation,
      automatic_retry_allowed: false,
    },
  };
  return {
    input: prepared,
    guard: {
      contract: "AVANTIQO_AUDIO_DURATION_GUARD_V1",
      requested_duration_seconds: requested,
      generation_duration_seconds: generation,
      automatic_retry_allowed: false,
    },
  };
}

export function encodeAudioDurationGuardJobId(jobId, guard) {
  const source = text(jobId);
  if (!source || !guard) return source;
  const requestedMs = Math.round(Number(guard.requested_duration_seconds) * 1000);
  const generationMs = Math.round(Number(guard.generation_duration_seconds) * 1000);
  return `${source}${JOB_MARKER}r=${requestedMs};g=${generationMs}`;
}

export function parseAudioDurationGuardJobId(jobId) {
  const source = text(jobId);
  const index = source.indexOf(JOB_MARKER);
  if (index < 0) return { base_job_id: source, guard: null };
  const base = source.slice(0, index);
  const suffix = source.slice(index + JOB_MARKER.length);
  const fields = Object.fromEntries(suffix.split(";").map((entry) => entry.split("=", 2)));
  const requestedMs = finite(fields.r);
  const generationMs = finite(fields.g);
  if (!base || requestedMs === null || generationMs === null || requestedMs < 10000 || generationMs < requestedMs) {
    throw new Error("AVANTIQO_AUDIO_DURATION_GUARD_JOB_ID_INVALID");
  }
  return {
    base_job_id: base,
    guard: {
      contract: "AVANTIQO_AUDIO_DURATION_GUARD_V1",
      requested_duration_seconds: requestedMs / 1000,
      generation_duration_seconds: generationMs / 1000,
      automatic_retry_allowed: false,
    },
  };
}

function storageParts(reference) {
  const source = text(reference);
  if (!source.startsWith(STORAGE_PREFIX)) throw new Error("AVANTIQO_AUDIO_DURATION_GUARD_STORAGE_REFERENCE_REQUIRED");
  const remainder = source.slice(STORAGE_PREFIX.length);
  const slash = remainder.indexOf("/");
  if (slash <= 0) throw new Error("AVANTIQO_AUDIO_DURATION_GUARD_STORAGE_REFERENCE_INVALID");
  return { bucket: remainder.slice(0, slash), path: remainder.slice(slash + 1) };
}

function parseWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44) throw new Error("AVANTIQO_AUDIO_DURATION_GUARD_WAV_REQUIRED");
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("AVANTIQO_AUDIO_DURATION_GUARD_WAV_REQUIRED");
  }
  let offset = 12;
  let fmt = null;
  let data = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > buffer.length) throw new Error("AVANTIQO_AUDIO_DURATION_GUARD_WAV_CHUNK_INVALID");
    if (id === "fmt " && size >= 16) {
      fmt = {
        format: buffer.readUInt16LE(start),
        channels: buffer.readUInt16LE(start + 2),
        sample_rate: buffer.readUInt32LE(start + 4),
        block_align: buffer.readUInt16LE(start + 12),
        bits_per_sample: buffer.readUInt16LE(start + 14),
      };
    }
    if (id === "data") data = { size_offset: offset + 4, start, size, end };
    offset = end + (size % 2);
  }
  if (!fmt || !data || !fmt.channels || !fmt.sample_rate || !fmt.block_align) {
    throw new Error("AVANTIQO_AUDIO_DURATION_GUARD_WAV_LAYOUT_INVALID");
  }
  if (![1, 3].includes(fmt.format) || ![8, 16, 24, 32, 64].includes(fmt.bits_per_sample)) {
    throw new Error(`AVANTIQO_AUDIO_DURATION_GUARD_WAV_FORMAT_UNSUPPORTED:${fmt.format}:${fmt.bits_per_sample}`);
  }
  return { ...fmt, data };
}

function sampleValue(buffer, offset, format, bits) {
  if (format === 3 && bits === 32) return buffer.readFloatLE(offset);
  if (format === 3 && bits === 64) return buffer.readDoubleLE(offset);
  if (format !== 1) throw new Error("AVANTIQO_AUDIO_DURATION_GUARD_WAV_FORMAT_UNSUPPORTED");
  if (bits === 8) return (buffer.readUInt8(offset) - 128) / 128;
  if (bits === 16) return buffer.readInt16LE(offset) / 32768;
  if (bits === 24) return buffer.readIntLE(offset, 3) / 8388608;
  if (bits === 32) return buffer.readInt32LE(offset) / 2147483648;
  throw new Error("AVANTIQO_AUDIO_DURATION_GUARD_WAV_PCM_BITS_UNSUPPORTED");
}

function rmsForFrames(buffer, wav, startFrame, endFrame) {
  const bytesPerSample = wav.bits_per_sample / 8;
  let sum = 0;
  let count = 0;
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    const frameOffset = wav.data.start + frame * wav.block_align;
    for (let channel = 0; channel < wav.channels; channel += 1) {
      const value = sampleValue(buffer, frameOffset + channel * bytesPerSample, wav.format, wav.bits_per_sample);
      if (Number.isFinite(value)) {
        sum += value * value;
        count += 1;
      }
    }
  }
  return count ? Math.sqrt(sum / count) : 0;
}

function applyFadeOut(buffer, wav, frames) {
  const bytesPerSample = wav.bits_per_sample / 8;
  const fadeFrames = Math.min(frames, Math.round(wav.sample_rate * 0.08));
  if (fadeFrames <= 1) return;
  const first = frames - fadeFrames;
  for (let frame = first; frame < frames; frame += 1) {
    const gain = Math.max(0, (frames - frame - 1) / (fadeFrames - 1));
    const frameOffset = wav.data.start + frame * wav.block_align;
    for (let channel = 0; channel < wav.channels; channel += 1) {
      const offset = frameOffset + channel * bytesPerSample;
      if (wav.format === 3 && wav.bits_per_sample === 32) buffer.writeFloatLE(buffer.readFloatLE(offset) * gain, offset);
      else if (wav.format === 3 && wav.bits_per_sample === 64) buffer.writeDoubleLE(buffer.readDoubleLE(offset) * gain, offset);
      else if (wav.format === 1 && wav.bits_per_sample === 8) {
        const value = (buffer.readUInt8(offset) - 128) * gain;
        buffer.writeUInt8(clamp(Math.round(value + 128), 0, 255), offset);
      } else if (wav.format === 1 && wav.bits_per_sample === 16) {
        buffer.writeInt16LE(clamp(Math.round(buffer.readInt16LE(offset) * gain), -32768, 32767), offset);
      } else if (wav.format === 1 && wav.bits_per_sample === 24) {
        buffer.writeIntLE(clamp(Math.round(buffer.readIntLE(offset, 3) * gain), -8388608, 8388607), offset, 3);
      } else if (wav.format === 1 && wav.bits_per_sample === 32) {
        buffer.writeInt32LE(clamp(Math.round(buffer.readInt32LE(offset) * gain), -2147483648, 2147483647), offset);
      }
    }
  }
}

export function cropAndValidateWavDuration(buffer, requestedDurationSeconds) {
  const wav = parseWav(buffer);
  const totalFrames = Math.floor(wav.data.size / wav.block_align);
  const requestedFrames = Math.round(Number(requestedDurationSeconds) * wav.sample_rate);
  if (!requestedFrames || totalFrames < requestedFrames) {
    throw new Error(`AVANTIQO_AUDIO_DURATION_GUARD_OUTPUT_TOO_SHORT:${totalFrames}:${requestedFrames}`);
  }

  const tailFrames = Math.max(1, Math.min(requestedFrames, Math.round(wav.sample_rate * TAIL_WINDOW_SECONDS)));
  const tailRms = rmsForFrames(buffer, wav, requestedFrames - tailFrames, requestedFrames);
  if (tailRms < SILENCE_RMS_THRESHOLD) {
    throw new Error(`AVANTIQO_AUDIO_DURATION_GUARD_SILENT_TAIL_REJECTED:rms=${tailRms.toFixed(6)}`);
  }

  const croppedDataBytes = requestedFrames * wav.block_align;
  const header = Buffer.from(buffer.subarray(0, wav.data.start));
  const audio = Buffer.from(buffer.subarray(wav.data.start, wav.data.start + croppedDataBytes));
  const combined = Buffer.concat([header, audio]);
  const croppedWav = parseWav(Buffer.concat([header, audio]));
  applyFadeOut(combined, croppedWav, requestedFrames);
  combined.writeUInt32LE(croppedDataBytes, wav.data.size_offset);
  combined.writeUInt32LE(combined.length - 8, 4);

  return {
    buffer: combined,
    sample_rate: wav.sample_rate,
    channels: wav.channels,
    requested_duration_seconds: Number(requestedDurationSeconds),
    source_duration_seconds: totalFrames / wav.sample_rate,
    tail_rms_before_fade: tailRms,
  };
}

function controlPlaneGovernance(output = {}) {
  const workerRuntimeCertified = output.production_certified === true;
  const workerActivationHint = output.activation_allowed === true;
  const cleaned = { ...output };
  delete cleaned.production_certified;
  delete cleaned.activation_allowed;
  return {
    ...cleaned,
    worker_runtime_capability_certified: workerRuntimeCertified,
    worker_runtime_activation_hint: workerActivationHint,
    production_certified: false,
    activation_allowed: false,
    production_governance_authority: "AVANTIQO_SERVICE_RUNTIME",
  };
}

export async function finalizeAudioDurationGuard({ result, guard, organizationId }) {
  if (!result || text(result.status).toLowerCase() !== "completed") return result;
  const output = controlPlaneGovernance(object(result.output));
  if (!guard) return { ...result, output };

  const reference = text(output.storage_reference || output.storageReference);
  const { bucket, path } = storageParts(reference);
  if (bucket !== STORAGE_BUCKET) throw new Error("AVANTIQO_AUDIO_DURATION_GUARD_BUCKET_INVALID");
  const supabase = getServiceSupabase();
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  const source = Buffer.from(await data.arrayBuffer());
  if (source.length > MAX_AUDIO_BYTES) throw new Error("AVANTIQO_AUDIO_DURATION_GUARD_OUTPUT_TOO_LARGE");

  const finished = cropAndValidateWavDuration(source, guard.requested_duration_seconds);
  const { error: uploadError } = await supabase.storage.from(bucket).upload(path, finished.buffer, {
    contentType: "audio/wav",
    upsert: true,
  });
  if (uploadError) throw uploadError;
  const assetUrl = await resolveCreativeProviderAssetUrl({ organization_id: organizationId, value: reference });

  return {
    ...result,
    output: {
      ...output,
      asset_url: assetUrl,
      duration_seconds: guard.requested_duration_seconds,
      requested_duration_seconds: guard.requested_duration_seconds,
      generation_duration_seconds: guard.generation_duration_seconds,
      duration_guard_contract: guard.contract,
      duration_guard_applied: true,
      duration_guard_source_seconds: Number(finished.source_duration_seconds.toFixed(3)),
      duration_guard_tail_rms_before_fade: Number(finished.tail_rms_before_fade.toFixed(6)),
      duration_guard_cpu_owned_by_avantiqo: true,
      duration_guard_extra_gpu_jobs: 0,
      human_review_required: true,
      production_certified: false,
      activation_allowed: false,
    },
  };
}
