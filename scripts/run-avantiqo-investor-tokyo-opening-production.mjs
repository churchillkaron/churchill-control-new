import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import * as modal from "modal";

const CONTRACT = "AVANTIQO_INVESTOR_TOKYO_OPENING_PRODUCTION_V1";
const MODAL_APP = "avantiqo-video-owned";
const MODAL_FUNCTION = "generate_investor_t2v_job";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const PROJECT_ID = "469011ad-a130-4466-bc75-83a53a32ed62";
const FPS = 24;
const SHOT_SECONDS = 5;
const MASTER_WIDTH = 3840;
const MASTER_HEIGHT = 2176;
const CUSTOMER_PRICE_PER_SECOND_THB = 3.39615;
const AUTHORIZED_CEILING_THB = 33.9615;
const EXPECTED_PRICE_THB = 2 * SHOT_SECONDS * CUSTOMER_PRICE_PER_SECOND_THB;
const MAX_WAIT_SECONDS = 600;

function text(v) { return String(v ?? "").trim(); }
function ensure(c, code) { if (!c) throw new Error(`${CONTRACT}_${code}`); }
function requireEnv(name) { const v = text(process.env[name]); if (!v) throw new Error(`${name}_REQUIRED`); return v; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function probe(file) { return JSON.parse(execFileSync("ffprobe", ["-v","error","-show_entries","format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate","-of","json",file], { encoding: "utf8" })); }
const SHOTS = Object.freeze([
  {
    id: "tokyo-cafe-morning",
    seed: 26091701,
    instruction: "Avantiqo investor film, Evolution world, Tokyo opening. One camera setup only. Real family-owned specialty coffee cafe in Tokyo during morning rush, premium cinematic documentary realism. Start close on an elegant glass coffee cup, freshly ground coffee, polished dark wood counter, natural hands preparing the first service of the day. Aiko is present only as partial human presence: hands, apron edge, controlled purposeful movement; do not reveal a full face yet. The room feels lived-in, refined, quiet before the rush. Camera makes one slow precise macro-to-medium drift with shallow depth of field, physically correct glass, coffee, reflections and hands. Natural practical morning light, restrained warm-neutral palette, deep blacks, high-end global brand film quality. No UI, no dashboard, no hologram, no text, no logo, no light threads, no abstract pattern, no steam shaped like a brain. The intelligence is withheld in this first shot; only subtle anticipation.",
  },
  {
    id: "tokyo-coffee-brain-reveal",
    seed: 26091702,
    instruction: "Avantiqo investor film, Evolution world, Tokyo opening reveal. One camera setup only. Extreme macro of the same elegant glass coffee cup and dark coffee surface from the previous shot in the same Tokyo cafe, same morning light and materials. As coffee settles, a physically credible optical refraction and reflection on the glass and liquid surface resolves into the unmistakable recognizable Avantiqo brain itself for the audience, subtle but clearly readable as a real brain form carried by the optics. The brain is the visible story-bearing intelligence, not a symbol or proxy. It must feel naturally caused by glass geometry, coffee surface reflection and practical light; no floating hologram, no neon, no generic network, no light threads, no H-pattern, no dashboard, no UI, no steam-brain, no magical object. Camera performs one restrained slow push toward the surface, with realistic Fresnel behavior, stable geometry, fine condensation detail, rich black coffee, warm morning highlights and premium luxury-commercial restraint. No readable text and no logo card.",
  },
]);

async function download(storage, objectPath, localPath) {
  const { data, error } = await storage.download(objectPath);
  if (error || !data) throw new Error(`${CONTRACT}_DOWNLOAD_FAILED:${objectPath}:${error?.message || "missing"}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

function normalize4k(source, target) {
  const sourceProbe = probe(source);
  const hasAudio = (sourceProbe.streams || []).some((s) => s.codec_type === "audio");
  const vf = `scale=${MASTER_WIDTH}:${MASTER_HEIGHT}:flags=lanczos,setsar=1,fps=${FPS},format=yuv420p`;
  const args = ["-y","-v","error","-i",source,"-t",String(SHOT_SECONDS),"-vf",vf];
  if (hasAudio) {
    args.push("-af",`aresample=48000,aformat=channel_layouts=stereo,apad=pad_dur=${SHOT_SECONDS},atrim=duration=${SHOT_SECONDS},asetpts=PTS-STARTPTS`);
  } else {
    args.push("-f","lavfi","-i","anullsrc=r=48000:cl=stereo");
  }
  args.push("-c:v","libx264","-preset","slow","-crf","14","-profile:v","high","-level","5.2","-c:a","aac","-b:a","256k","-ar","48000","-ac","2");
  if (!hasAudio) args.push("-shortest");
  args.push(target);
  execFileSync("ffmpeg", args);
}

async function main() {
  ensure(Math.abs(EXPECTED_PRICE_THB - AUTHORIZED_CEILING_THB) < 0.0001, "AUTHORIZATION_MISMATCH");
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const tokenId = requireEnv("MODAL_TOKEN_ID");
  const tokenSecret = requireEnv("MODAL_TOKEN_SECRET");
  const runKey = `tokyo-opening-${Date.now()}`;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vfsjqabpkcbiuerhzugk.supabase.co";
  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const storage = supabase.storage.from(BUCKET);
  const client = new modal.ModalClient({ tokenId, tokenSecret });
  const worker = await client.functions.fromName(MODAL_APP, MODAL_FUNCTION);
  const root = path.join(os.tmpdir(), `avantiqo-tokyo-opening-${Date.now()}`);
  const outDir = path.resolve("local-audit-output/investor-film/tokyo-opening");
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });

  const takes = [];
  for (let index = 0; index < SHOTS.length; index += 1) {
    const shot = SHOTS[index];
    const objectPath = `${ORGANIZATION_ID}/investor-film/${PROJECT_ID}/${runKey}/native/${index + 1}-${shot.id}.mp4`;
    await storage.remove([objectPath]).catch(() => null);
    const { data: upload, error: uploadError } = await storage.createSignedUploadUrl(objectPath, { upsert: false });
    if (uploadError || !upload?.signedUrl) throw new Error(`${CONTRACT}_SIGNED_UPLOAD_FAILED:${index + 1}:${uploadError?.message || "missing"}`);
    const payload = {
      capability: "ai.video.generate",
      organization_id: ORGANIZATION_ID,
      usage_id: `${runKey}-shot-${index + 1}`,
      instruction: shot.instruction,
      duration_seconds: SHOT_SECONDS,
      seed: shot.seed,
      source_urls: [],
      storage_upload: { signed_url: upload.signedUrl, storage_reference: `storage://${BUCKET}/${objectPath}` },
    };
    const call = await worker.spawn([payload]);
    const functionCallId = text(call.functionCallId);
    ensure(functionCallId, `FUNCTION_CALL_ID_REQUIRED:${index + 1}`);
    console.log(`SHOT_${index + 1}_ACCEPTED=${functionCallId}`);
    const deadline = Date.now() + MAX_WAIT_SECONDS * 1000;
    let result = null;
    for (;;) {
      if (Date.now() >= deadline) throw new Error(`${CONTRACT}_SHOT_TIMEOUT:${index + 1}`);
      try {
        result = await (await client.functionCalls.fromId(functionCallId)).get({ timeoutMs: 0 });
        break;
      } catch (error) {
        if (error instanceof modal.FunctionTimeoutError && /Timeout exceeded:\s*0ms/i.test(text(error?.message))) {
          await sleep(8000);
          continue;
        }
        throw error;
      }
    }
    ensure(result?.success === true, `SHOT_FAILED:${index + 1}`);
    ensure(result?.model === "avantiqo-ltx-2.5", `MODEL_INVALID:${index + 1}`);
    ensure(Number(result?.width) === 1920 && Number(result?.height) === 1088, `NATIVE_RESOLUTION_INVALID:${index + 1}`);
    ensure(Number(result?.fps) === FPS, `FPS_INVALID:${index + 1}`);
    ensure(result?.external_provider_used === false && result?.automatic_paid_retry === false, `ROUTING_INVALID:${index + 1}`);
    takes.push({ index: index + 1, shot, objectPath, functionCallId, result });
  }
  const mastered = [];
  for (const take of takes) {
    const nativeFile = path.join(root, `${take.index}-native.mp4`);
    const masterFile = path.join(root, `${take.index}-master-4k.mp4`);
    await download(storage, take.objectPath, nativeFile);
    const nativeProbe = probe(nativeFile);
    const nativeVideo = (nativeProbe.streams || []).find((s) => s.codec_type === "video") || {};
    ensure(Number(nativeVideo.width) === 1920 && Number(nativeVideo.height) === 1088, `DOWNLOADED_NATIVE_INVALID:${take.index}`);
    normalize4k(nativeFile, masterFile);
    const masterProbe = probe(masterFile);
    const masterVideo = (masterProbe.streams || []).find((s) => s.codec_type === "video") || {};
    ensure(Number(masterVideo.width) === MASTER_WIDTH && Number(masterVideo.height) === MASTER_HEIGHT, `MASTER_RESOLUTION_INVALID:${take.index}`);
    const buffer = await fs.readFile(masterFile);
    const masterObjectPath = `${ORGANIZATION_ID}/investor-film/${PROJECT_ID}/${runKey}/master/${take.index}-${take.shot.id}-3840x2176.mp4`;
    const { error: masterUploadError } = await storage.upload(masterObjectPath, buffer, { contentType: "video/mp4", upsert: false, cacheControl: "3600" });
    if (masterUploadError) throw new Error(`${CONTRACT}_MASTER_UPLOAD_FAILED:${take.index}:${masterUploadError.message}`);
    const { data: signed, error: signedError } = await storage.createSignedUrl(masterObjectPath, 24 * 60 * 60);
    if (signedError || !signed?.signedUrl) throw new Error(`${CONTRACT}_MASTER_SIGNED_URL_FAILED:${take.index}`);
    mastered.push({
      ...take,
      native_probe: nativeProbe,
      master_probe: masterProbe,
      master_storage_reference: `storage://${BUCKET}/${masterObjectPath}`,
      master_signed_url: signed.signedUrl,
      master_sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
      master_bytes: buffer.length,
    });
  }

  const report = {
    success: true,
    contract: CONTRACT,
    project_id: PROJECT_ID,
    stage: "PRODUCTION_UNITS",
    run_key: runKey,
    authorization: {
      approved_customer_ceiling_thb: AUTHORIZED_CEILING_THB,
      customer_rate_thb_per_second: CUSTOMER_PRICE_PER_SECOND_THB,
      authorized_shots: 2,
      seconds_per_shot: SHOT_SECONDS,
      automatic_paid_retry: false,
      external_provider_fallback: false,
    },
    native_generation: { model: "avantiqo-ltx-2.5", resolution: "1920x1088", fps: FPS, modal_app: MODAL_APP, modal_function: MODAL_FUNCTION },
    delivery_mastering: { method: "deterministic_lanczos", resolution: `${MASTER_WIDTH}x${MASTER_HEIGHT}` },
    takes: mastered.map((take) => ({
      take_id: `TOKYO-OPENING-${String(take.index).padStart(2, "0")}`,
      shot_id: take.shot.id,
      seed: take.shot.seed,
      duration_seconds: SHOT_SECONDS,
      function_call_id: take.functionCallId,
      native_storage_reference: `storage://${BUCKET}/${take.objectPath}`,
      master_storage_reference: take.master_storage_reference,
      master_signed_url: take.master_signed_url,
      master_sha256: take.master_sha256,
      master_bytes: take.master_bytes,
      provider_result: take.result,
    })),
  };
  const reportFile = path.join(outDir, `${runKey}-production-report.json`);
  await fs.writeFile(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${CONTRACT}=PASS`);
  console.log(`REPORT_FILE=${reportFile}`);
  for (const take of report.takes) console.log(`TAKE_${take.take_id}_URL=${take.master_signed_url}`);
}

main().catch((error) => { console.error(error?.stack || error?.message || String(error)); process.exitCode = 1; });
