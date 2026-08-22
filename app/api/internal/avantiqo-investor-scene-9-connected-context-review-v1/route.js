export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const TOKEN = "avq-investor-scene-9-connected-context-review-v1-20260822";
const CONTRACT = "AVANTIQO_INVESTOR_SCENE_9_CONNECTED_CONTEXT_REVIEW_V1";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const W = 1920;
const H = 1080;
const FPS = 24;
const DURATION = 7.172;
const VOICE_START = 30.375;
const VOICE_END = 37.547;
const NARRATION = "The business should not have to explain itself to its software. The software should understand the business.";

const MEDIA = Object.freeze({
  customer: `${ORG}/unassigned/7c1d5a46-812f-4c68-9e4f-0162c0748360-gemini-hr90v0w9p4wc.mp4`,
  communication: `${ORG}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`,
  operations: `${ORG}/unassigned/cbba2295-76c6-43ea-acf5-1511017cc63b-gemini-v24pbxy5sy1t.mp4`,
  supply: `${ORG}/unassigned/eef84bd3-c208-4ed8-bba0-6088a9b67ef9-gemini-thgn4qnk6hof.mp4`,
  finance: `${ORG}/unassigned/701a4abb-3ed8-4460-99ef-d388d1ce1ffa-gemini-8yvpgxklek51.mp4`,
  convergence: `${ORG}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`,
  logo: `${ORG}/unassigned/5a068b01-d435-412d-b288-d138c33a7f98-avantiqo-logo.png`,
  voice: `${ORG}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v5-founder-locked-229.5s.mp3`,
  score: `${ORG}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`,
});

const CUTS = Object.freeze([
  { key: "customer", seconds: 0.95, sourceIn: 0, path: [[430,720],[720,650],[1240,650],[1980,610]] },
  { key: "communication", seconds: 1.10, sourceIn: 3.10, path: [[-60,610],[420,590],[1080,690],[1980,610]] },
  { key: "operations", seconds: 1.10, sourceIn: 0, path: [[-60,610],[420,670],[1160,610],[1980,610]] },
  { key: "supply", seconds: 1.10, sourceIn: 0, path: [[-60,610],[480,560],[1210,680],[1980,610]] },
  { key: "finance", seconds: 1.20, sourceIn: 0, path: [[-60,610],[520,660],[1220,560],[1980,610]] },
  { key: "convergence", seconds: 1.722, sourceIn: 3.10, convergence: true },
]);

const OUTPUT = `${ORG}/${PROJECT}/scene-previews-20260822/scene-09-connected-operating-context-review-v1.mp4`;
const supabase = getServiceSupabase();

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function run(command, args, timeoutMs = 285000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) {
        settled = true;
        reject(new Error("SCENE_9_REVIEW_TIMEOUT"));
      }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        reject(error);
      }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) reject(new Error(err.slice(-16000) || `MEDIA_EXIT_${code}`));
      else resolve(out);
    });
  });
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`SCENE_9_SOURCE_EMPTY:${storagePath}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

async function exists(storagePath) {
  const directory = path.posix.dirname(storagePath);
  const filename = path.posix.basename(storagePath);
  const { data, error } = await supabase.storage.from(BUCKET).list(directory, { search: filename, limit: 10 });
  if (error) return false;
  return (data || []).some((row) => row.name === filename);
}

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

function cubicPoint(points, t) {
  const [p0, p1, p2, p3] = points;
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return [
    uuu * p0[0] + 3 * uu * t * p1[0] + 3 * u * tt * p2[0] + ttt * p3[0],
    uuu * p0[1] + 3 * uu * t * p1[1] + 3 * u * tt * p2[1] + ttt * p3[1],
  ];
}

function smoothstep(t) {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
}

function traceDefs() {
  return `<defs>
    <filter id="soft" x="-100%" y="-100%" width="300%" height="300%">
      <feGaussianBlur stdDeviation="6" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
    <radialGradient id="pulse">
      <stop offset="0" stop-color="#fff8ec" stop-opacity="0.95"/>
      <stop offset="0.36" stop-color="#e8d3ab" stop-opacity="0.70"/>
      <stop offset="1" stop-color="#d6a66a" stop-opacity="0"/>
    </radialGradient>
  </defs>`;
}

function pathSvg(points, progress) {
  const [p0,p1,p2,p3] = points;
  const p = Math.max(0, Math.min(1, progress));
  const [x,y] = cubicPoint(points, p);
  const dash = Math.max(0.001, p * 100);
  return `<path d="M${p0[0]} ${p0[1]} C${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]} ${p3[0]} ${p3[1]}" pathLength="100" fill="none" stroke="#f2f2ee" stroke-opacity="0.055" stroke-width="1.0"/>
    <path d="M${p0[0]} ${p0[1]} C${p1[0]} ${p1[1]} ${p2[0]} ${p2[1]} ${p3[0]} ${p3[1]}" pathLength="100" fill="none" stroke="#d6a66a" stroke-opacity="0.54" stroke-width="1.45" stroke-linecap="round" stroke-dasharray="${dash} ${100-dash}" filter="url(#soft)"/>
    <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="18" fill="url(#pulse)" opacity="0.46" filter="url(#soft)"/>
    <circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="2.7" fill="#fff8ec" opacity="0.92"/>`;
}

function traceSvg(frameIndex) {
  const time = frameIndex / FPS;
  let cursor = 0;
  let active = CUTS[CUTS.length - 1];
  let local = 1;
  for (const cut of CUTS) {
    if (time < cursor + cut.seconds) {
      active = cut;
      local = (time - cursor) / cut.seconds;
      break;
    }
    cursor += cut.seconds;
  }

  if (!active.convergence) {
    const p = smoothstep(Math.min(1, Math.max(0, local / 0.88)));
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${traceDefs()}${pathSvg(active.path, p)}</svg>`);
  }

  const p = smoothstep(Math.min(1, Math.max(0, local / 0.82)));
  const paths = [
    [[-80,330],[360,350],[690,470],[960,540]],
    [[-80,790],[380,740],[720,620],[960,540]],
    [[2000,320],[1570,350],[1240,455],[960,540]],
    [[2000,800],[1570,750],[1230,625],[960,540]],
  ];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${traceDefs()}${paths.map((pts) => pathSvg(pts, p)).join("")}</svg>`);
}

async function makeTraceFrames(directory) {
  const frameDirectory = path.join(directory, "trace");
  await fs.mkdir(frameDirectory, { recursive: true });
  const totalFrames = Math.ceil(DURATION * FPS) + 1;
  const jobs = [];
  for (let index = 0; index < totalFrames; index += 1) {
    jobs.push(async () => {
      const target = path.join(frameDirectory, `trace-${String(index).padStart(4, "0")}.png`);
      await sharp(traceSvg(index)).png().toFile(target);
    });
  }
  for (let offset = 0; offset < jobs.length; offset += 12) {
    await Promise.all(jobs.slice(offset, offset + 12).map((job) => job()));
  }
  return path.join(frameDirectory, "trace-%04d.png");
}

async function normalize(ffmpeg, source, output, seconds, sourceIn = 0) {
  const args = ["-y"];
  if (sourceIn > 0) args.push("-ss", String(sourceIn));
  args.push(
    "-stream_loop", "-1",
    "-i", source,
    "-t", String(seconds),
    "-an",
    "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},eq=contrast=1.025:brightness=-0.006:saturation=0.92,format=yuv420p`,
    "-c:v", "libx264",
    "-preset", "fast",
    "-crf", "16",
    "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    output,
  );
  await run(ffmpeg, args);
}

async function concat(ffmpeg, clips, output, directory) {
  const list = path.join(directory, "scene9.concat.txt");
  await fs.writeFile(list, clips.map((clip) => `file '${clip.replace(/'/g, "'\\''")}'`).join("\n"), "utf8");
  await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-an", "-c:v", "copy", output]);
}

async function upload(localPath) {
  const bytes = await fs.readFile(localPath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabase.storage.from(BUCKET).upload(OUTPUT, bytes, {
    contentType: "video/mp4",
    cacheControl: "3600",
    upsert: true,
    metadata: {
      contract: CONTRACT,
      organization_id: ORG,
      creative_project_id: PROJECT,
      scene: "9",
      narration: NARRATION,
      narration_start_seconds: String(VOICE_START),
      narration_end_seconds: String(VOICE_END),
      duration_seconds: String(DURATION),
      visual_chain: "CUSTOMER_TO_COMMUNICATION_TO_OPERATIONS_TO_SUPPLY_TO_FINANCE_TO_ONE_CONTEXT",
      connection_treatment: "CONTINUOUS_PLATINUM_CHAMPAGNE_CONTEXT_TRACE_THROUGH_REAL_WORLD_CUTS",
      existing_live_action_only: "true",
      authentic_avantiqo_logo: "true",
      cards_present: "false",
      fake_ui_present: "false",
      orb_present: "false",
      image_generation_used: "false",
      churchill_present: "false",
      publication_authorized: "false",
      sha256,
    },
  });
  if (error) throw error;
  return { bytes: bytes.length, sha256 };
}

async function render() {
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CREATIVE_MEDIA_EDITOR_NOT_READY");

  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-scene9-context-"));
  try {
    const local = {};
    for (const [key, storagePath] of Object.entries(MEDIA)) {
      const extension = key === "voice" || key === "score" ? ".mp3" : key === "logo" ? ".png" : ".mp4";
      local[key] = path.join(directory, `${key}${extension}`);
      await download(storagePath, local[key]);
    }

    const clips = [];
    for (let index = 0; index < CUTS.length; index += 1) {
      const cut = CUTS[index];
      const target = path.join(directory, `cut-${String(index).padStart(2, "0")}.mp4`);
      await normalize(ffmpeg, local[cut.key], target, cut.seconds, cut.sourceIn || 0);
      clips.push(target);
    }

    const picture = path.join(directory, "picture.mp4");
    await concat(ffmpeg, clips, picture, directory);

    const tracePattern = await makeTraceFrames(directory);
    const connected = path.join(directory, "connected.mp4");
    const logoFadeStart = 5.72;
    await run(ffmpeg, [
      "-y",
      "-i", picture,
      "-framerate", String(FPS), "-start_number", "0", "-i", tracePattern,
      "-loop", "1", "-i", local.logo,
      "-t", String(DURATION),
      "-filter_complex",
      `[1:v]format=rgba[trace];[0:v][trace]overlay=shortest=1[base];[2:v]scale=380:-1,format=rgba,fade=t=in:st=${logoFadeStart}:d=0.78:alpha=1[logo];[base][logo]overlay=x='(W-w)/2':y='(H-h)/2+12':enable='gte(t,${logoFadeStart})':shortest=1,format=yuv420p[v]`,
      "-map", "[v]",
      "-an",
      "-c:v", "libx264",
      "-preset", "fast",
      "-crf", "16",
      "-pix_fmt", "yuv420p",
      "-r", String(FPS),
      connected,
    ]);

    const final = path.join(directory, "scene9-final.mp4");
    await run(ffmpeg, [
      "-y",
      "-i", connected,
      "-i", local.voice,
      "-i", local.score,
      "-filter_complex",
      `[1:a]atrim=start=${VOICE_START}:end=${VOICE_END},asetpts=PTS-STARTPTS,volume=1.02[voice];[2:a]atrim=start=${VOICE_START}:end=${VOICE_END},asetpts=PTS-STARTPTS,volume=0.105[score];[voice][score]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,alimiter=limit=0.95,atrim=duration=${DURATION}[a]`,
      "-map", "0:v:0",
      "-map", "[a]",
      "-t", String(DURATION),
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "320k",
      "-ar", "48000",
      "-ac", "2",
      "-movflags", "+faststart",
      final,
    ]);

    const stored = await upload(final);
    return {
      success: true,
      contract: CONTRACT,
      scene: 9,
      duration_seconds: DURATION,
      narration: NARRATION,
      output_ready: true,
      output_path: OUTPUT,
      signed_url: await signedUrl(OUTPUT),
      visual_chain: ["CUSTOMER", "COMMUNICATION", "OPERATIONS", "SUPPLY", "FINANCE", "ONE_AVANTIQO_CONTEXT"],
      rules: {
        existing_live_action_only: true,
        authentic_avantiqo_logo: true,
        continuous_context_trace: true,
        cards_present: false,
        fake_ui_present: false,
        orb_present: false,
        image_generation_used: false,
        churchill_present: false,
      },
      ...stored,
    };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = String(url.searchParams.get("action") || "status").trim().toLowerCase();
    if (action === "render") return json(await render());
    const ready = await exists(OUTPUT);
    if (action === "signed") return json({ success: true, output_ready: ready, output_path: OUTPUT, signed_url: ready ? await signedUrl(OUTPUT) : null });
    if (action === "status") return json({ success: true, contract: CONTRACT, scene: 9, output_ready: ready, output_path: OUTPUT });
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    return json({ success: false, contract: CONTRACT, error: error?.message || String(error) }, 500);
  }
}
