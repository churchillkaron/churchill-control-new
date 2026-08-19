import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const supabase = getServiceSupabase();

const BUCKET = "creative-assets";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const OUTPUT_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260819`;
const OUTPUT_PATH = `${OUTPUT_DIR}/avantiqo-logo-reveal-worldclass-v1.mp4`;
const DURATION = 5.5;
const FPS = 24;
const THREAD_ARGS = ["-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1"];

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
      reject(new Error("AVANTIQO_LOGO_REVEAL_TIMEOUT"));
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

async function storageExists(storagePath) {
  const directory = storagePath.split("/").slice(0, -1).join("/");
  const file = storagePath.split("/").at(-1);
  const { data, error } = await supabase.storage.from(BUCKET).list(directory, { search: file, limit: 10 });
  if (error) return false;
  return (data || []).some((item) => item.name === file);
}

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function upload(storagePath, localPath) {
  const bytes = await fs.readFile(localPath);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4",
    upsert: true,
    cacheControl: "3600",
  });
  if (error) throw error;
  return {
    bucket: BUCKET,
    path: storagePath,
    bytes: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
  };
}

async function makeLogoRaw(directory) {
  const source = path.join(process.cwd(), "public", "branding", "avantiqo-logo.png");
  const target = path.join(directory, "avantiqo-logo.rgba");
  const buffer = await sharp(source)
    .resize({
      width: 820,
      height: 260,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .ensureAlpha()
    .raw()
    .toBuffer();
  await fs.writeFile(target, buffer);
  return target;
}

async function renderReveal(ffmpeg, logoRaw, output) {
  const scale = "0.38+0.70*min(t/1.35,1)-0.08*min(max((t-1.35)/0.5,0),1)";
  const tilt = "0.055*(1-min(t/1.35,1))";
  const rise = "70*(1-min(t/1.35,1))";

  const filter = [
    "[0:v]format=rgba,noise=alls=2.4:allf=t+u,drawbox=x=176:y=188:w=928:h=344:color=0xc8a96a@0.025:t=2:enable='between(t,1.0,4.8)'[bg]",
    `[1:v]tpad=stop_mode=clone:stop_duration=${DURATION},setpts=PTS-STARTPTS,format=rgba,split=3[l0][l1][l2]`,
    `[l0]scale=w='iw*(${scale})':h='ih*(${scale})':eval=frame,rotate='${tilt}':c=none:ow=rotw(iw):oh=roth(ih),boxblur=18:2,colorchannelmixer=rr=0.72:gg=0.49:bb=0.17:aa=0.28[glow]`,
    `[l1]scale=w='iw*(${scale})':h='ih*(${scale})':eval=frame,rotate='${tilt}':c=none:ow=rotw(iw):oh=roth(ih),colorchannelmixer=rr=0.42:gg=0.30:bb=0.14:aa=0.82[depth]`,
    `[l2]scale=w='iw*(${scale})':h='ih*(${scale})':eval=frame,rotate='${tilt}':c=none:ow=rotw(iw):oh=roth(ih),fade=t=in:st=0.18:d=0.82:alpha=1[main]`,
    `[bg][glow]overlay=x='(W-w)/2+12':y='(H-h)/2+12+${rise}':eval=frame[s1]`,
    `[s1][depth]overlay=x='(W-w)/2+7':y='(H-h)/2+7+${rise}':eval=frame[s2]`,
    `[s2][main]overlay=x='(W-w)/2':y='(H-h)/2+${rise}':eval=frame[s3]`,
    "[2:v]format=rgba,rotate='0.20':c=none:ow=rotw(iw):oh=roth(ih),boxblur=20:2,fade=t=in:st=1.55:d=0.30:alpha=1,fade=t=out:st=2.70:d=0.45:alpha=1[beam]",
    "[s3][beam]overlay=x='-420+(W+760)*min(max((t-1.55)/1.35,0),1)':y='(H-h)/2':eval=frame[s4]",
    `[s4]vignette=PI/7,fade=t=in:st=0:d=0.25,fade=t=out:st=${DURATION - 0.55}:d=0.5,format=yuv420p[v]`,
  ].join(";");

  await run(ffmpeg, [
    "-y", ...THREAD_ARGS,
    "-f", "lavfi", "-i", `color=c=0x020204:s=1280x720:r=${FPS}:d=${DURATION}`,
    "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "820x260", "-framerate", String(FPS), "-i", logoRaw,
    "-f", "lavfi", "-i", `color=c=0xffe4ad@0.11:s=170x980:r=${FPS}:d=${DURATION},format=rgba`,
    "-filter_complex", filter,
    "-map", "[v]",
    "-an",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "17",
    "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-t", String(DURATION),
    "-movflags", "+faststart",
    output,
  ]);
}

export const AvantiqoInvestorLogoRevealRuntime = {
  OUTPUT_PATH,

  async status() {
    return {
      success: true,
      ffmpeg_configured: Boolean(resolveCreativeFfmpegPath()),
      exact_brand_logo: "public/branding/avantiqo-logo.png",
      generated_logo_substitution: false,
      duration_seconds: DURATION,
      reveal_ready: await storageExists(OUTPUT_PATH),
      visual_direction: "CINEMATIC_DEPTH_CENTER_LOCK_GOLD_GLOW_LIGHT_SWEEP",
    };
  },

  async downloadUrl(seconds = 86400) {
    if (!(await storageExists(OUTPUT_PATH))) return null;
    return signedUrl(OUTPUT_PATH, seconds);
  },

  async render() {
    const ffmpeg = resolveCreativeFfmpegPath();
    if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-logo-reveal-"));
    try {
      const logoRaw = await makeLogoRaw(directory);
      const output = path.join(directory, "avantiqo-logo-reveal.mp4");
      await renderReveal(ffmpeg, logoRaw, output);
      const uploaded = await upload(OUTPUT_PATH, output);
      return {
        success: true,
        duration_seconds: DURATION,
        exact_brand_logo: true,
        generated_logo_substitution: false,
        visual_direction: "CINEMATIC_DEPTH_CENTER_LOCK_GOLD_GLOW_LIGHT_SWEEP",
        output: uploaded,
        signed_url: await signedUrl(OUTPUT_PATH, 86400),
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
};
