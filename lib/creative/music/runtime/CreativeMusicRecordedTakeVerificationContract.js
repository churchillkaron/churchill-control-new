const CONTRACT = "AVANTIQO_MUSIC_RECORDED_TAKE_SERVER_VERIFICATION_V1";

function text(value) { return String(value ?? "").trim(); }
function finite(value, fallback = null) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }

export function validateRecordedTakeProbe(probeResult = {}, declared = {}) {
  const actualDuration = finite(probeResult.duration_seconds), declaredDuration = finite(declared.duration_seconds);
  const actualRate = Math.round(finite(probeResult.sample_rate, 0)), declaredRate = Math.round(finite(declared.sample_rate, 0));
  const actualChannels = Math.round(finite(probeResult.channels, 0)), declaredChannels = Math.round(finite(declared.channels, 0));
  const actualBits = Math.round(finite(probeResult.bits_per_raw_sample, 0));
  if (text(probeResult.codec_name) !== "pcm_s24le" || actualBits !== 24) throw new Error("CREATIVE_MUSIC_RECORDED_TAKE_WAV_24BIT_REQUIRED");
  if (!text(probeResult.format_name).split(",").includes("wav")) throw new Error("CREATIVE_MUSIC_RECORDED_TAKE_WAV_CONTAINER_REQUIRED");
  if (!actualRate || !declaredRate || actualRate !== declaredRate) throw new Error("CREATIVE_MUSIC_RECORDED_TAKE_SAMPLE_RATE_MISMATCH");
  if (!actualChannels || !declaredChannels || actualChannels !== declaredChannels) throw new Error("CREATIVE_MUSIC_RECORDED_TAKE_CHANNEL_COUNT_MISMATCH");
  if (!(actualDuration > 0) || !(declaredDuration > 0) || Math.abs(actualDuration - declaredDuration) > Math.max(0.05, 2 / actualRate)) throw new Error("CREATIVE_MUSIC_RECORDED_TAKE_DURATION_MISMATCH");
  return { contract: CONTRACT, verified: true, codec_name: probeResult.codec_name, format_name: probeResult.format_name, sample_rate: actualRate, channels: actualChannels, bit_depth: actualBits, sample_format: probeResult.sample_format || null, duration_seconds: actualDuration };
}

export const CreativeMusicRecordedTakeVerificationContract = Object.freeze({ validate: validateRecordedTakeProbe });
