import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const BUCKET = "creative-assets";
const SOURCE_PATH = "33336a72-acb5-474e-856b-8be0269360e2/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v4-founder-4min.mp3";
const OUTPUT_PATH = "33336a72-acb5-474e-856b-8be0269360e2/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3";
const SOURCE_DURATION_SECONDS = 250.32;
const TARGET_DURATION_SECONDS = 229.5;
const TEMPO = SOURCE_DURATION_SECONDS / TARGET_DURATION_SECONDS;

function run(command, args, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("FOUNDER_AUDIO_LOCK_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-12000) || `FFMPEG_EXIT_${code}`));
        return;
      }
      resolve(true);
    });
  });
}

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function exists(storagePath) {
  const directory = storagePath.split("/").slice(0, -1).join("/");
  const file = storagePath.split("/").at(-1);
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(directory, { search: file, limit: 10 });
  if (error) return false;
  return (data || []).some((item) => item.name === file);
}

export const AvantiqoInvestorFounderAudioLockRuntime = {
  SOURCE_PATH,
  OUTPUT_PATH,
  SOURCE_DURATION_SECONDS,
  TARGET_DURATION_SECONDS,
  TEMPO,

  async status() {
    return {
      success: true,
      source_path: SOURCE_PATH,
      output_path: OUTPUT_PATH,
      source_duration_seconds: SOURCE_DURATION_SECONDS,
      target_duration_seconds: TARGET_DURATION_SECONDS,
      tempo: Number(TEMPO.toFixed(9)),
      ffmpeg_configured: Boolean(resolveCreativeFfmpegPath()),
      ready: await exists(OUTPUT_PATH),
    };
  },

  async render() {
    const ffmpeg = resolveCreativeFfmpegPath();
    if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(SOURCE_PATH);
    if (error) throw error;
    if (!data) throw new Error("FOUNDER_V4_AUDIO_NOT_FOUND");

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-founder-audio-lock-"));
    try {
      const source = path.join(directory, "source.mp3");
      const output = path.join(directory, "locked.mp3");
      await fs.writeFile(source, Buffer.from(await data.arrayBuffer()));

      await run(ffmpeg, [
        "-y",
        "-threads", "1",
        "-i", source,
        "-filter:a", `atempo=${TEMPO.toFixed(9)}`,
        "-t", TARGET_DURATION_SECONDS.toFixed(3),
        "-vn",
        "-c:a", "libmp3lame",
        "-b:a", "128k",
        "-ar", "48000",
        "-ac", "1",
        output,
      ]);

      const bytes = await fs.readFile(output);
      const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(OUTPUT_PATH, bytes, {
        contentType: "audio/mpeg",
        upsert: true,
        cacheControl: "3600",
      });
      if (uploadError) throw uploadError;

      return {
        success: true,
        source_duration_seconds: SOURCE_DURATION_SECONDS,
        target_duration_seconds: TARGET_DURATION_SECONDS,
        finished_film_target_seconds: 240,
        logo_intro_seconds: 5.5,
        end_resolve_seconds: 5,
        tempo: Number(TEMPO.toFixed(9)),
        bytes: bytes.length,
        storage_path: OUTPUT_PATH,
        audio_url: await signedUrl(OUTPUT_PATH, 86400),
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },

  async downloadUrl(seconds = 86400) {
    if (!(await exists(OUTPUT_PATH))) return null;
    return signedUrl(OUTPUT_PATH, seconds);
  },
};
