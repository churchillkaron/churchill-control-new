export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { runAIService } from "@/lib/platform/service-runtime/ai";
import { resolveCreativeFfmpegPath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";

const ORGANIZATION_ID = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT_ID = "da38f668-11a1-4760-a8f2-6adc3effdab5";
const TOKEN = "churchill-stay-night-v5-qc-20260822";
const BUCKET = "creative-assets";
const CONTRACT = "CHURCHILL_STAY_FOR_THE_NIGHT_V5_WORLD_CLASS_VISION_GATE_V1";
const SAMPLE_OFFSET = 1.5;
const SAMPLE_STEP = 3;
const SAMPLE_COUNT = 29;
const FRAME_WIDTH = 480;
const FRAME_HEIGHT = 270;

const TIMELINE = Object.freeze([
  { key: "scene_01_the_drop", label: "THE DROP", start: 0, end: 4 },
  { key: "scene_02_entrance_into_night", label: "ENTRANCE INTO NIGHT", start: 4, end: 9 },
  { key: "scene_03_wine_universe", label: "WINE UNIVERSE", start: 9, end: 16 },
  { key: "scene_04_dinner_future_reflections", label: "DINNER / FUTURE REFLECTIONS", start: 16, end: 23 },
  { key: "scene_05_steam_into_bar", label: "STEAM INTO BAR", start: 23, end: 27 },
  { key: "scene_06_ice_time_freeze", label: "ICE TIME FREEZE", start: 27, end: 35 },
  { key: "scene_07_pool_activation", label: "POOL ACTIVATION", start: 35, end: 41 },
  { key: "scene_08_pool_to_shuffleboard", label: "POOL TO SHUFFLEBOARD", start: 41, end: 46 },
  { key: "scene_09_shuffleboard_to_dart", label: "SHUFFLEBOARD TO DART", start: 46, end: 50 },
  { key: "scene_10_electric_dart_flight", label: "ELECTRONIC DART FLIGHT", start: 50, end: 57 },
  { key: "scene_11_band_activates_churchill", label: "BAND ACTIVATES CHURCHILL", start: 57, end: 64 },
  { key: "scene_12_many_realities_same_night", label: "MANY REALITIES / SAME NIGHT", start: 64, end: 70 },
  { key: "scene_13_frozen_night_hero", label: "FROZEN NIGHT HERO", start: 70, end: 77 },
  { key: "scene_14_wine_loop_return", label: "WINE LOOP RETURN", start: 77, end: 81 },
  { key: "scene_15_logo_epilogue", label: "LOGO EPILOGUE", start: 81, end: 90 },
]);

function text(value) { return String(value ?? "").trim(); }
function json(value, status = 200) { return Response.json(value, { status, headers: { "Cache-Control": "no-store, private" } }); }

function run(command, args, timeoutMs = 180000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, OMP_NUM_THREADS: "1" } });
    const stdout = [];
    const stderr = [];
    let settled = false;
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      if (!settled) { settled = true; reject(new Error("CHURCHILL_V5_QC_MEDIA_TIMEOUT")); }
    }, timeoutMs);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      if (!settled) { settled = true; reject(error); }
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (code === 0) resolve({ stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
      else reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-12000) || `CHURCHILL_V5_QC_MEDIA_EXIT_${code}`));
    });
  });
}

async function project() {
  const { data, error } = await supabaseAdmin.from("creative_projects").select("id,metadata").eq("id", PROJECT_ID).eq("organization_id", ORGANIZATION_ID).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V5_QC_PROJECT_REQUIRED");
  return data;
}

function storagePath(reference) {
  const value = text(reference);
  const prefix = `storage://${BUCKET}/`;
  if (!value.startsWith(prefix)) throw new Error("CHURCHILL_V5_QC_STORAGE_REFERENCE_REQUIRED");
  return value.slice(prefix.length);
}

async function download(reference, target) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(storagePath(reference));
  if (error) throw error;
  if (!data) throw new Error("CHURCHILL_V5_QC_MASTER_EMPTY");
  await fs.writeFile(target, Buffer.from(await data.arrayBuffer()));
}

async function signed(storagePathValue, expiresIn = 3600) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(storagePathValue, expiresIn);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("CHURCHILL_V5_QC_SIGNED_URL_REQUIRED");
  return data.signedUrl;
}

function sceneAt(seconds) { return TIMELINE.find((scene) => seconds >= scene.start && seconds < scene.end) || TIMELINE[TIMELINE.length - 1]; }
function labelSvg(label) {
  const safe = String(label || "").replace(/[&<>\"]/g, "");
  return Buffer.from(`<svg width="${FRAME_WIDTH}" height="${FRAME_HEIGHT}" xmlns="http://www.w3.org/2000/svg"><rect x="8" y="8" width="210" height="32" rx="7" fill="rgba(0,0,0,0.72)"/><text x="18" y="30" font-family="Arial,Helvetica,sans-serif" font-size="16" fill="white">${safe}</text></svg>`);
}

async function extractFrames(ffmpeg, master, directory) {
  const pattern = path.join(directory, "frame-%02d.jpg");
  await run(ffmpeg, ["-y", "-ss", String(SAMPLE_OFFSET), "-i", master, "-vf", `fps=1/${SAMPLE_STEP},scale=${FRAME_WIDTH}:${FRAME_HEIGHT}:force_original_aspect_ratio=increase,crop=${FRAME_WIDTH}:${FRAME_HEIGHT}`, "-frames:v", String(SAMPLE_COUNT), "-q:v", "2", pattern], 150000);
  const files = (await fs.readdir(directory)).filter((name) => /^frame-\d+\.jpg$/.test(name)).sort().slice(0, SAMPLE_COUNT);
  if (files.length < 28) throw new Error(`CHURCHILL_V5_QC_INSUFFICIENT_FRAMES:${files.length}`);
  const frames = [];
  for (let index = 0; index < files.length; index += 1) {
    const seconds = SAMPLE_OFFSET + (index * SAMPLE_STEP);
    const scene = sceneAt(seconds);
    const source = path.join(directory, files[index]);
    const buffer = await sharp(source).composite([{ input: labelSvg(`${scene.key.slice(6, 8)}  ${seconds.toFixed(1)}s`), top: 0, left: 0 }]).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    frames.push({ buffer, seconds, scene_key: scene.key, scene_label: scene.label });
  }
  const covered = new Set(frames.map((frame) => frame.scene_key));
  const missing = TIMELINE.filter((scene) => !covered.has(scene.key)).map((scene) => scene.key);
  if (missing.length) throw new Error(`CHURCHILL_V5_QC_SCENE_COVERAGE_MISSING:${missing.join(",")}`);
  return frames;
}

async function makeSheets(frames) {
  const sheets = [];
  for (let sheetIndex = 0; sheetIndex < 3; sheetIndex += 1) {
    const group = frames.slice(sheetIndex * 10, (sheetIndex + 1) * 10);
    if (!group.length) continue;
    const composites = group.map((frame, index) => ({ input: frame.buffer, left: (index % 4) * FRAME_WIDTH, top: Math.floor(index / 4) * FRAME_HEIGHT }));
    const buffer = await sharp({ create: { width: FRAME_WIDTH * 4, height: FRAME_HEIGHT * 3, channels: 3, background: "#080808" } }).composite(composites).jpeg({ quality: 91, mozjpeg: true }).toBuffer();
    sheets.push({ index: sheetIndex + 1, buffer, samples: group.map(({ seconds, scene_key, scene_label }) => ({ seconds, scene_key, scene_label })) });
  }
  return sheets;
}

async function uploadSheets(p, masterChecksum, sheets) {
  const evidence = [];
  for (const sheet of sheets) {
    const checksum = crypto.createHash("sha256").update(sheet.buffer).digest("hex");
    const target = `${ORGANIZATION_ID}/${p.id}/churchill-stay-night-v5/qc/${masterChecksum}/sheet-${sheet.index}-${checksum.slice(0, 10)}.jpg`;
    const { error } = await supabaseAdmin.storage.from(BUCKET).upload(target, sheet.buffer, { contentType: "image/jpeg", upsert: true, cacheControl: "3600", metadata: { organization_id: ORGANIZATION_ID, creative_project_id: p.id, qc_contract: CONTRACT, master_checksum: masterChecksum, non_generative_frame_extraction: "true", sheet_index: String(sheet.index) } });
    if (error) throw error;
    evidence.push({ sheet_index: sheet.index, storage_path: target, checksum_sha256: checksum, samples: sheet.samples, signed_url: await signed(target, 3600) });
  }
  return evidence;
}

function unwrap(value = {}) {
  let current = value?.output || value;
  const seen = new Set();
  while (current && typeof current === "object" && current.output && typeof current.output === "object" && !seen.has(current)) { seen.add(current); current = current.output; }
  return current || {};
}
function parseReview(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  return JSON.parse(String(value || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim());
}

function reviewPrompt(evidence) {
  const sampleMap = evidence.flatMap((sheet) => sheet.samples.map((sample) => ({ sheet: sheet.sheet_index, time_seconds: sample.seconds, scene_key: sample.scene_key, scene_label: sample.scene_label })));
  return `
You are the senior film dailies director, VFX supervisor and finishing QC director for a world-class Churchill Restaurant & Bar campaign film.
You are reviewing THREE non-generative contact sheets extracted directly from the finished 90-second 1920x1080 V5 review master. Frames are chronological and labeled with scene number and master timestamp. These are evidence frames, not generated review art.

FILM PROMISE: COME FOR DINNER. STAY FOR THE NIGHT.
The film should feel like a premium global hospitality / automotive / spirits commercial: photographic blacks, restrained warm amber practical light, rich wine tones, physically believable optics and expensive camera language. It must not look like an AI demo, Canva montage, cyberpunk HUD or generic pub advert.

AUTHENTICITY HARD CONTRACT:
- Churchill venue identity, architecture, pool area, shuffleboard, electronic darts, singer/band and logo may not be replaced by invented versions.
- Electronic darts only. A traditional sisal/bristle/cork/vintage dartboard is a HARD FAIL anywhere.
- No malformed or invented Churchill text/logo.
- No synthetic replacement close-up faces for the real singer, band or guests.
- Generated sequences may provide only premium physics/transition/VFX language; they must not read as fake Churchill rooms or fake people.
- Real portrait footage may sit over a tasteful blurred background, but the treatment must look intentional and premium, not like a cheap social-video patch.

SCENES:\n${TIMELINE.map((scene) => `${scene.key}: ${scene.start}-${scene.end}s ${scene.label}`).join("\n")}
SAMPLED EVIDENCE MAP:\n${JSON.stringify(sampleMap)}

HARD FAILS:
1 wrong/traditional dartboard; 2 fake/malformed Churchill logo or branding; 3 warped/melting venue geometry; 4 malformed anatomy/duplicated or synthetic replacement people; 5 rubbery/liquid deformation or obvious AI texture collapse; 6 cheap neon/cyberpunk/HUD language; 7 frozen/repeated/blank padding; 8 amateur portrait treatment; 9 visible transition discontinuity; 10 weak or incorrect logo epilogue.
Do not invent defects not visible in the samples. Still frames cannot prove motion smoothness or audio quality; put those into human_motion_audio_review_items.

Score EACH scene 0-100 for cinematic_quality, authenticity, composition, continuity, synthetic_artifact_freedom, brand_integrity.
PASS per scene requires cinematic_quality>=90, authenticity>=95, composition>=90, continuity>=90, synthetic_artifact_freedom>=94, brand_integrity>=95, zero hard fails.

Return STRICT JSON only:
{"contract":"${CONTRACT}","verdict":"PASS|FAIL","world_class_ready":false,"hard_fail_count":0,"scenes":[{"scene_key":"scene_01_the_drop","verdict":"PASS|FAIL|INSUFFICIENT_EVIDENCE","scores":{"cinematic_quality":0,"authenticity":0,"composition":0,"continuity":0,"synthetic_artifact_freedom":0,"brand_integrity":0},"hard_fail_issues":[{"time_seconds":0,"issue":"specific visible defect","severity":"BLOCKER|MAJOR"}],"strengths":[],"issues":[],"repair_instructions":[]}],"cross_scene_continuity_issues":[],"release_blockers":[],"human_motion_audio_review_items":[],"finishing_recommendations":[],"summary":"specific release conclusion"}
`;
}

async function patchQc(p, evidence, review, execution) {
  const metadata = p.metadata || {};
  const qc = { contract: CONTRACT, status: review?.verdict === "PASS" ? "MACHINE_PASS_HUMAN_REVIEW_REQUIRED" : "REPAIR_REQUIRED", review, evidence: evidence.map(({ signed_url, ...item }) => item), provider: execution?.provider || "openai", model: execution?.model || "gpt-4.1-mini", usage_id: execution?.usage?.id || null, machine_visual_review_complete: true, human_visual_review_complete: false, approved_for_master: false, publication_authorized: false, reviewed_at: new Date().toISOString() };
  const { error } = await supabaseAdmin.from("creative_projects").update({ metadata: { ...metadata, churchill_v5_qc: qc }, updated_at: new Date().toISOString() }).eq("id", p.id).eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
  return qc;
}

async function executeReview() {
  const p = await project();
  const master = p.metadata?.churchill_v5_master || null;
  if (master?.status !== "REVIEW_REQUIRED" || !master?.output_reference) throw new Error("CHURCHILL_V5_QC_MASTER_REVIEW_OUTPUT_REQUIRED");
  const masterChecksum = text(master.checksum_sha256 || "unverified");
  const ffmpeg = resolveCreativeFfmpegPath();
  if (!ffmpeg) throw new Error("CHURCHILL_V5_QC_FFMPEG_REQUIRED");
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "churchill-v5-qc-"));
  try {
    const masterFile = path.join(directory, "master.mp4");
    await download(master.output_reference, masterFile);
    const frames = await extractFrames(ffmpeg, masterFile, directory);
    const evidence = await uploadSheets(p, masterChecksum, await makeSheets(frames));
    const execution = await runAIService.execute({ organization_id: ORGANIZATION_ID, bill_to_organization_id: ORGANIZATION_ID, service_id: "ai.image.analyze", provider_id: "openai", input: { capability: "ai.image.analyze", model: "gpt-4.1-mini", assets: evidence.map((item) => item.signed_url), quantity: 1, prompt: reviewPrompt(evidence), temperature: 0, max_output_tokens: 8000 }, metadata: { module: "CREATIVE", operation: "CHURCHILL_V5_WORLD_CLASS_MASTER_VISION_GATE", creative_project_id: p.id, master_checksum: masterChecksum, evidence_paths: evidence.map((item) => item.storage_path), non_generative_review_evidence: true }, category: "AI" });
    if (execution?.pending) throw new Error("CHURCHILL_V5_QC_ASYNC_NOT_SUPPORTED");
    const providerOutput = unwrap(execution);
    const raw = providerOutput?.text || providerOutput?.content || providerOutput?.result || providerOutput;
    const review = parseReview(raw);
    return { success: true, qc: await patchQc(p, evidence, review, execution) };
  } finally {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function status() {
  const p = await project();
  return { success: true, contract: CONTRACT, master: p.metadata?.churchill_v5_master || null, qc: p.metadata?.churchill_v5_qc || null, policy: { evidence_is_non_generative_frame_extraction: true, machine_pass_does_not_equal_human_approval: true, approved_for_master: false, publication_authorized: false } };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("token") !== TOKEN) return json({ success: false }, 404);
    const action = text(url.searchParams.get("action") || "status").toLowerCase();
    if (action === "status") return json(await status());
    if (action === "run") return json(await executeReview());
    return json({ success: false, error: "Unsupported action" }, 400);
  } catch (error) {
    console.error("CHURCHILL_V5_QC_FAILED", { message: error?.message || String(error), details: error?.details || null });
    return json({ success: false, error: error?.message || String(error), details: error?.details || null }, 500);
  }
}
