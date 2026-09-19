import { spawn } from "node:child_process";

import { materializeMedia } from "@/lib/creative/media/runtime/CreativeMediaInspectionRuntime";

import { validateRecordedTakeProbe } from "./CreativeMusicRecordedTakeVerificationContract.js";

async function probe(ffprobe, filePath) {
  const output = await run(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration,format_name:stream=codec_name,codec_type,sample_rate,channels,bits_per_raw_sample,sample_fmt",
    "-of", "json", filePath,
  ]);
  const parsed = JSON.parse(output || "{}");
  const stream = (parsed.streams || []).find((entry) => entry.codec_type === "audio");
  if (!stream) throw new Error("CREATIVE_MUSIC_RECORDED_TAKE_AUDIO_STREAM_REQUIRED");
  return {
    duration_seconds: finite(parsed.format?.duration),
    format_name: text(parsed.format?.format_name) || null,
    codec_name: text(stream.codec_name) || null,
    sample_rate: finite(stream.sample_rate),
    channels: finite(stream.channels),
    bits_per_raw_sample: finite(stream.bits_per_raw_sample),
    sample_format: text(stream.sample_fmt) || null,
  };
}


export async function verifyRecordedTakeUpload({ organization_id, storage_reference, file_name, declared = {}, ffprobe_path = null } = {}) {
  const media = await materializeMedia({ organization_id, url: storage_reference, file_name, mime_type: "audio/wav" });
  try {
    const probed = await probe(text(ffprobe_path || process.env.CREATIVE_FFPROBE_PATH) || "ffprobe", media.file_path);
    return { ...validateRecordedTakeProbe(probed, declared), checksum_sha256: media.checksum || null, file_size_bytes: media.file_size_bytes || null };
  } finally {
    await media.cleanup().catch(() => {});
  }
}

export const CreativeMusicRecordedTakeVerificationRuntime = Object.freeze({ verify: verifyRecordedTakeUpload });
