import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const supabase = getServiceSupabase();

const BUCKET = "creative-assets";
const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const OUTPUT_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260819`;
const NARRATION_PATH = `${ORGANIZATION_ID}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v2.mp3`;
const SCORE_PATH = `${OUTPUT_DIR}/avantiqo-investor-film-score-v1.mp3`;
const BUSINESS_LOOP_V2_PATH = `${OUTPUT_DIR}/avantiqo-business-loop-vfx-v2.mp4`;
const SCREEN_RECORDING_TAKE2_PATH = `${OUTPUT_DIR}/avantiqo-screen-recording-take2.mp4`;

const SOURCES = Object.freeze({
  f01: `${ORGANIZATION_ID}/unassigned/a6089db7-57fd-47f8-b138-b63e92e40698-gemini-knata2wctqhk.mp4`,
  f02: `${ORGANIZATION_ID}/unassigned/3a8d8e19-eee4-491d-8923-8d253c60548a-gemini-ekhiyo7vyyqe.mp4`,
  f03: `${ORGANIZATION_ID}/unassigned/b94181b3-310e-4f47-9c50-6c9d1890611d-gemini-0m182edqz2p9.mp4`,
  f04: `${ORGANIZATION_ID}/unassigned/a8e8ca28-f5b9-463c-b408-5e923d7da4d0-gemini-p57cwqrvz4f2.mp4`,
  f05: `${ORGANIZATION_ID}/unassigned/48f07dd4-349a-435d-8d50-cfd1cbb55f55-gemini-5ofkbhixuv67.mp4`,
  b01: `${ORGANIZATION_ID}/unassigned/7fb49565-ee64-4fc5-b336-64cb334fb758-gemini-tylp0qmz2bpi.mp4`,
  b02: `${ORGANIZATION_ID}/unassigned/8fce813d-68ac-4032-918e-0eee89871265-gemini-q1zghwo9x4g8.mp4`,
  b03: `${ORGANIZATION_ID}/unassigned/5a56a041-3f60-47ff-a67b-bb011db8874c-gemini-qwgea6koo5yg.mp4`,
  b04: `${ORGANIZATION_ID}/unassigned/752d3d33-c62c-402c-8459-62b04a9e4010-gemini-urre56o4cv2u.mp4`,
  b05: `${ORGANIZATION_ID}/unassigned/68fdaca9-8d0f-46c9-ac86-8a639a593b57-gemini-kh6kptlc7phe.mp4`,
  b06: `${ORGANIZATION_ID}/unassigned/0e33d68f-edd6-4b46-9b76-9e73798c9936-gemini-92iup6dlxliw.mp4`,
  b07: `${ORGANIZATION_ID}/unassigned/bf710577-3c52-4d22-b695-f6242c8d0caa-gemini-by1086blb68c.mp4`,
  b08: `${ORGANIZATION_ID}/unassigned/e1b2c387-2dda-4192-bb7a-3cea339e2293-gemini-32vbfjlubvh7.mp4`,
  b09: `${ORGANIZATION_ID}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`,
  b10: `${ORGANIZATION_ID}/unassigned/7c1d5a46-812f-4c68-9e4f-0162c0748360-gemini-hr90v0w9p4wc.mp4`,
  b11: `${ORGANIZATION_ID}/unassigned/cbba2295-76c6-43ea-acf5-1511017cc63b-gemini-v24pbxy5sy1t.mp4`,
  b12: `${ORGANIZATION_ID}/unassigned/316fafe1-6521-4879-8431-4c4fd428a821-gemini-mxcowg69gr1f.mp4`,
  b13: `${ORGANIZATION_ID}/unassigned/9b34b515-b9e4-4772-b142-c4ab375ed5ba-gemini-zzz5upejcnut.mp4`,
  b14: `${ORGANIZATION_ID}/unassigned/eef84bd3-c208-4ed8-bba0-6088a9b67ef9-gemini-thgn4qnk6hof.mp4`,
  b15: `${ORGANIZATION_ID}/unassigned/701a4abb-3ed8-4460-99ef-d388d1ce1ffa-gemini-8yvpgxklek51.mp4`,
  b16: `${ORGANIZATION_ID}/unassigned/97c0dbc3-5cd0-49f8-8121-1f85831ed2ab-gemini-fpkwe0jb7rex.mp4`,
  b17: `${ORGANIZATION_ID}/unassigned/a9568908-d7d6-402c-83ff-cf4376c2f9d8-gemini-qztxkgp5yet3.mp4`,
  b18: `${ORGANIZATION_ID}/unassigned/8ad5ac7b-2db9-46a3-8ecf-65e7a7d134a7-gemini-qv0auqgaxcyl.mp4`,
  b19: `${ORGANIZATION_ID}/unassigned/51e67c02-7a80-49c2-bca9-354f5fae7c72-gemini-5f5uydt8ya3j.mp4`,
  b20: `${ORGANIZATION_ID}/unassigned/b2e6721e-de37-4309-8b2c-a68425cf4c1e-gemini-wxewcbe6qpak.mp4`,
  loop: BUSINESS_LOOP_V2_PATH,
});

const EDIT = Object.freeze([
  ["b01", 9.2], ["b08", 5.0], ["b09", 5.0], ["f01", 9.4],
  ["b02", 9.2], ["b15", 5.0], ["b19", 5.0], ["f02", 9.4],
  ["loop", 48.0],
  ["b04", 9.2], ["b05", 9.2], ["b06", 9.2], ["b07", 5.0],
  ["b08", 5.0], ["b11", 5.0], ["b12", 5.0], ["b10", 5.0],
  ["b13", 5.0], ["b14", 5.0], ["b16", 5.0], ["b17", 5.0],
  ["f03", 9.4], ["b15", 5.0], ["b14", 5.0], ["b09", 5.0],
  ["f04", 9.4], ["b18", 5.0], ["b20", 5.0], ["b16", 5.0],
  ["b17", 5.0], ["f05", 9.4],
]);

function run(command, args, timeoutMs = 290000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("AVANTIQO_INVESTOR_FILM_RENDER_TIMEOUT"));
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
      resolve(Buffer.concat(stderr).toString("utf8"));
    });
  });
}

async function storageExists(storagePath) {
  const directory = storagePath.split("/").slice(0, -1).join("/");
  const file = storagePath.split("/").at(-1);
  const { data, error } = await supabase.storage.from(BUCKET).list(directory, {
    search: file,
    limit: 10,
  });
  if (error) return false;
  return (data || []).some((item) => item.name === file);
}

async function download(storagePath, targetPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`MEDIA_DOWNLOAD_EMPTY:${storagePath}`);
  await fs.writeFile(targetPath, Buffer.from(await data.arrayBuffer()));
  return targetPath;
}

async function upload(storagePath, localPath, contentType) {
  const bytes = await fs.readFile(localPath);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType,
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

function durationFromFfmpeg(value) {
  const match = String(value || "").match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function mediaDuration(ffmpeg, localPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, ["-hide_banner", "-i", localPath], {
      shell: false,
      stdio: ["ignore", "ignore", "pipe"],
    });
    const stderr = [];
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", () => {
      const duration = durationFromFfmpeg(Buffer.concat(stderr).toString("utf8"));
      if (!duration) reject(new Error(`MEDIA_DURATION_UNAVAILABLE:${path.basename(localPath)}`));
      else resolve(duration);
    });
  });
}

function standardVideo(index, duration, sourceKey) {
  if (sourceKey === "loop") {
    return `[${index}:v]trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=30,setsar=1,eq=contrast=1.02:saturation=0.98:brightness=-0.004,format=yuv420p[v${index}]`;
  }

  const founder = sourceKey.startsWith("f");
  const push = founder ? 1.018 : 1.035;
  const increment = founder ? "0.00006" : "0.00012";
  return `[${index}:v]trim=duration=${duration.toFixed(3)},setpts=PTS-STARTPTS,scale=1344:756:force_original_aspect_ratio=increase,crop=1280:720,fps=30,setsar=1,eq=contrast=1.035:saturation=0.94:brightness=-0.008,unsharp=5:5:0.35:5:5:0.0,zoompan=z='min(zoom+${increment},${push})':d=1:s=1280x720:fps=30,format=yuv420p[v${index}]`;
}

function xfadeChain(labels, durations, transition = 0.42) {
  if (labels.length === 1) {
    return { filters: [], output: labels[0], duration: durations[0] };
  }

  const filters = [];
  let current = labels[0];
  let timeline = durations[0];
  const transitions = [
    "fade",
    "smoothleft",
    "dissolve",
    "smoothright",
    "fadeblack",
    "smoothup",
  ];

  for (let index = 1; index < labels.length; index += 1) {
    const next = labels[index];
    const output = `xf${index}`;
    const offset = Math.max(0, timeline - transition);
    filters.push(
      `[${current}][${next}]xfade=transition=${transitions[(index - 1) % transitions.length]}:duration=${transition}:offset=${offset.toFixed(3)}[${output}]`,
    );
    timeline = timeline + durations[index] - transition;
    current = output;
  }

  return { filters, output: current, duration: timeline };
}

async function signedUrl(storagePath) {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 6 * 60 * 60);
  if (error) throw error;
  return data?.signedUrl || null;
}

export const AvantiqoInvestorFilmFinishingRuntime = {
  ORGANIZATION_ID,
  ENTITY_ID,
  BUCKET,
  OUTPUT_DIR,
  NARRATION_PATH,
  SCORE_PATH,
  BUSINESS_LOOP_V2_PATH,
  SCREEN_RECORDING_TAKE2_PATH,
  SOURCES,

  async status() {
    const businessLoopReady = await storageExists(BUSINESS_LOOP_V2_PATH);
    return {
      ffmpeg_configured: Boolean(resolveCreativeFfmpegPath()),
      narration_ready: await storageExists(NARRATION_PATH),
      score_ready: await storageExists(SCORE_PATH),
      business_loop_v2_ready: businessLoopReady,
      screen_rise_ready: businessLoopReady,
      screen_rise_version: "DEVICE_ORIGIN_TRANSPARENT_GLASS_RISE_V2",
      physical_device_remains_visible: true,
      screen_recording_take2_ready: await storageExists(SCREEN_RECORDING_TAKE2_PATH),
      screen_recording_take2_is_blocking: false,
      source_count: Object.keys(SOURCES).length,
      edit_segment_count: EDIT.length,
      logo_path: "public/branding/avantiqo-logo.png",
    };
  },

  async render({ mode = "review", useScore = true } = {}) {
    const ffmpeg = resolveCreativeFfmpegPath();
    if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");
    if (!(await storageExists(BUSINESS_LOOP_V2_PATH))) {
      throw new Error("BUSINESS_LOOP_V2_REQUIRED");
    }

    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "avantiqo-investor-master-"),
    );

    try {
      const logoPath = path.join(
        process.cwd(),
        "public",
        "branding",
        "avantiqo-logo.png",
      );
      await fs.access(logoPath);

      const narration = path.join(directory, "narration.mp3");
      await download(NARRATION_PATH, narration);
      const narrationDuration = await mediaDuration(ffmpeg, narration);

      const uniqueNames = [...new Set(EDIT.map(([name]) => name))];
      const localByName = new Map();
      for (const name of uniqueNames) {
        const local = path.join(directory, `${name}.mp4`);
        await download(SOURCES[name], local);
        localByName.set(name, local);
      }

      const scoreReady = useScore && await storageExists(SCORE_PATH);
      const score = scoreReady ? path.join(directory, "score.mp3") : null;
      if (score) await download(SCORE_PATH, score);

      const introDuration = 4.8;
      const outroDuration = 5.0;
      const transition = 0.42;
      const targetVisualDuration = narrationDuration + introDuration + 0.5;

      const expanded = EDIT.map(([name, duration]) => ({ name, duration }));
      let montageDuration =
        expanded.reduce((sum, item) => sum + item.duration, 0) -
        transition * Math.max(0, expanded.length - 1);
      const requiredMontage = Math.max(
        1,
        targetVisualDuration - introDuration - outroDuration + transition * 2,
      );
      const filler = [
        "b07",
        "b08",
        "b09",
        "b10",
        "b14",
        "b15",
        "b18",
        "b19",
        "b20",
      ];
      let fillerIndex = 0;
      while (montageDuration < requiredMontage) {
        const name = filler[fillerIndex % filler.length];
        const duration = 5.0;
        expanded.splice(Math.max(1, expanded.length - 1), 0, {
          name,
          duration,
        });
        montageDuration += duration - transition;
        fillerIndex += 1;
      }

      const args = [
        "-y",
        "-loop",
        "1",
        "-framerate",
        "30",
        "-t",
        String(introDuration + outroDuration + 2),
        "-i",
        logoPath,
      ];

      for (const item of expanded) {
        args.push("-i", localByName.get(item.name));
      }

      const narrationIndex = expanded.length + 1;
      args.push("-i", narration);
      const scoreIndex = score ? narrationIndex + 1 : null;
      if (score) {
        args.push("-stream_loop", "-1", "-i", score);
      }

      const filters = [];
      filters.push(
        `color=c=#010104:s=1280x720:r=30:d=${introDuration}[introbg]`,
      );
      filters.push(
        `[0:v]trim=duration=${introDuration},setpts=PTS-STARTPTS,scale=760:-1,format=rgba,colorchannelmixer=aa=0.98,fade=t=in:st=0.18:d=1.25:alpha=1,fade=t=out:st=${(introDuration - 0.8).toFixed(2)}:d=0.72:alpha=1,zoompan=z='1.0+0.045*(on/${Math.round(introDuration * 30)})':d=1:s=760x430:fps=30[intrologo]`,
      );
      filters.push(
        `[introbg]drawbox=x=0:y=358:w=1280:h=1:color=0xd4b56a@0.12:t=fill[introline]`,
      );
      filters.push(
        `[introline][intrologo]overlay=(W-w)/2:(H-h)/2,fade=t=in:st=0:d=0.5,fade=t=out:st=${(introDuration - 0.45).toFixed(2)}:d=0.45,vignette=PI/7[intro]`,
      );

      const segmentLabels = ["intro"];
      const segmentDurations = [introDuration];
      expanded.forEach((item, index) => {
        const inputIndex = index + 1;
        filters.push(standardVideo(inputIndex, item.duration, item.name));
        segmentLabels.push(`v${inputIndex}`);
        segmentDurations.push(item.duration);
      });

      filters.push(
        `color=c=#010104:s=1280x720:r=30:d=${outroDuration}[outbg]`,
      );
      filters.push(
        `[0:v]trim=duration=${outroDuration},setpts=PTS-STARTPTS,scale=680:-1,format=rgba,fade=t=in:st=0.3:d=0.9:alpha=1,fade=t=out:st=${(outroDuration - 0.7).toFixed(2)}:d=0.65:alpha=1[outlogo]`,
      );
      filters.push(
        `[outbg][outlogo]overlay=(W-w)/2:(H-h)/2,fade=t=in:st=0:d=0.45,fade=t=out:st=${(outroDuration - 0.45).toFixed(2)}:d=0.45,vignette=PI/7[outro]`,
      );
      segmentLabels.push("outro");
      segmentDurations.push(outroDuration);

      const xfade = xfadeChain(
        segmentLabels,
        segmentDurations,
        transition,
      );
      filters.push(...xfade.filters);
      filters.push(
        `[${xfade.output}]trim=duration=${targetVisualDuration.toFixed(3)},setpts=PTS-STARTPTS,fade=t=out:st=${Math.max(0, targetVisualDuration - 0.7).toFixed(3)}:d=0.7[video]`,
      );

      filters.push(
        `[${narrationIndex}:a]adelay=${Math.round(introDuration * 1000)}:all=1,volume=1.0,aresample=48000,apad=pad_dur=${outroDuration + 2}[voice]`,
      );

      if (score) {
        filters.push(
          `[${scoreIndex}:a]volume=0.10,afade=t=in:st=0:d=2.4,afade=t=out:st=${Math.max(0, targetVisualDuration - 4).toFixed(3)}:d=3.5,atrim=duration=${targetVisualDuration.toFixed(3)},aresample=48000[music]`,
        );
        filters.push(
          `[voice][music]amix=inputs=2:duration=longest:dropout_transition=2,alimiter=limit=0.94[audio]`,
        );
      } else {
        filters.push(
          `[voice]atrim=duration=${targetVisualDuration.toFixed(3)},alimiter=limit=0.94[audio]`,
        );
      }

      const output = path.join(
        directory,
        `avantiqo-investor-film-${mode}.mp4`,
      );
      const review = mode !== "upload";

      args.push(
        "-filter_complex",
        filters.join(";"),
        "-map",
        "[video]",
        "-map",
        "[audio]",
        "-c:v",
        "libx264",
        "-preset",
        review ? "veryfast" : "slow",
        review ? "-crf" : "-b:v",
        review ? "20" : "285k",
        ...(review
          ? []
          : ["-maxrate", "340k", "-bufsize", "680k"]),
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        review ? "160k" : "64k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "-t",
        targetVisualDuration.toFixed(3),
        output,
      );

      await run(ffmpeg, args, 290000);

      const storagePath = `${OUTPUT_DIR}/avantiqo-investor-film-${mode}-v2-screen-rise.mp4`;
      const uploaded = await upload(storagePath, output, "video/mp4");
      const url = await signedUrl(storagePath);

      return {
        success: true,
        mode,
        narration_duration_seconds: Number(narrationDuration.toFixed(3)),
        duration_seconds: Number(targetVisualDuration.toFixed(3)),
        score_applied: Boolean(score),
        business_loop_v2_applied: true,
        business_loop_v2_duration_seconds: 48,
        screen_rise_ready: true,
        screen_rise_version: "DEVICE_ORIGIN_TRANSPARENT_GLASS_RISE_V2",
        physical_device_remains_visible: true,
        screen_recording_take2_ready: await storageExists(
          SCREEN_RECORDING_TAKE2_PATH,
        ),
        screen_recording_take2_is_blocking: false,
        segment_count: expanded.length + 2,
        output: uploaded,
        signed_url: url,
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
};
