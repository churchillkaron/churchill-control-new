import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";
import * as modal from "modal";

const CONTRACT = "AVANTIQO_INVESTOR_VISUAL_PROOF_24S_HQ_DFR_V1";
const MODAL_APP = "avantiqo-video-owned";
const MODAL_FUNCTION = "generate_investor_hq_job";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const MODEL_WIDTH = 3840;
const MODEL_HEIGHT = 2176;
const WIDTH = 3840;
const HEIGHT = 2160;
const FPS = 24;
const SHOT_DURATION = 6;
const TARGET_DURATION = 24;
const MAX_WAIT_SECONDS = Math.max(1800, Number(process.env.AVANTIQO_INVESTOR_HQ_MAX_WAIT_SECONDS || 2100));

const SHOTS = Object.freeze([
  {
    id: "physical-stake",
    seed: 26090511,
    instruction: "Prestige investor-film opening in a real high-end hospitality receiving area shortly before service. Begin in extreme macro on tactile delivery evidence: corrugated cardboard fibers, a folded packing slip edge, condensation on stainless steel, a clean quantity mark with no readable words. Slowly reveal a serious receiving manager discovering a critical supplier short-shipment through the physical absence of an expected item. The performance is restrained: a pause, a careful recount, one glance toward the kitchen. No melodrama and no technology. The shot must communicate that a small physical mismatch has real consequence. Camera: premium cinema macro lens transitioning to a composed medium shot, precise focus pull, stable dolly movement, realistic motion blur. Lighting: soft cool daylight mixed with warm practicals, detailed shadows, controlled specular highlights. Wardrobe and environment are contemporary international hospitality, sophisticated but credible.",
  },
  {
    id: "causal-ripple",
    seed: 26090512,
    instruction: "Continue the same premium hospitality business moments after the supplier exception. Show the consequence travelling through reality without a feature montage. A chef reaches an expected prep position and stops because the ingredient is absent; service quietly adjusts a customer commitment; a manager checks the supplier invoice and understands the financial implication before making a measured call. Use motivated match movement and spatial continuity so these feel like consequences of one event, not unrelated stock clips. Keep the same architectural palette, wardrobe realism and lighting language as the opening. Natural human timing, small expressions, tactile close details, one controlled camera transition between macro consequence and human-scale operation. No technology, no screens as the subject, no crisis acting.",
  },
  {
    id: "avantiqo-recognition",
    seed: 26090513,
    instruction: "First controlled reveal of Avantiqo operating intelligence in the same business. A real manager sits at a refined dark workstation beside the original physical evidence. The camera begins over the evidence and arcs slowly toward one large real physical display. On that display, show a restrained obsidian operating surface with off-white evidence geometry and a single warm-gold causal thread connecting one evidence object to three consequence lanes and one governed proposed action. Do not generate readable words or fake detailed UI labels; the authored Studio layer will add exact typography later. It must look like a serious operating system captured in-camera on a calibrated display, with realistic luminance, reflections and viewing angle, not a floating interface or concept HUD. The manager remains present in frame and the system feels calm, precise and consequential. Deep detailed blacks, warm gold used sparingly, premium lensing, physically correct hands and posture.",
  },
  {
    id: "human-control-foresight",
    seed: 26090514,
    instruction: "Prestige investor-film close about human control. In the same calm operations setting, the responsible manager reviews a consequential recommendation on a real physical display with the original evidence visibly nearby. The decision moment is quiet and deliberate: the manager considers, makes one clear approval or adjustment gesture, then the operation responds with staff moving confidently and the earlier disruption becoming controlled. Finish with the business calm again and a subtle early-warning state emerging on the physical display, implying the system recognizes a repeating supplier risk before another disruption. Human judgment must remain the emotional center. Use a restrained slow push, natural room movement, realistic face and hand anatomy, detailed materials, practical lighting and near-silence in the decision beat. No triumphal tech fantasy and no generated logo.",
  },
]);

function text(v) { return String(v ?? "").trim(); }
function ensure(c, code) { if (!c) throw new Error(`${CONTRACT}_${code}`); }
function requireEnv(name) { const v = text(process.env[name]); if (!v) throw new Error(`${name}_REQUIRED`); return v; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function ffprobe(file) {
  return JSON.parse(execFileSync("ffprobe", [
    "-v", "error", "-show_entries",
    "format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate",
    "-of", "json", file,
  ], { encoding: "utf8" }));
}

async function download(storage, objectPath, localPath) {
  const { data, error } = await storage.download(objectPath);
  if (error || !data) throw new Error(`${CONTRACT}_DOWNLOAD_FAILED:${objectPath}:${error?.message || "missing"}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

function normalizeNative(source, target) {
  const probe = ffprobe(source);
  const video = (probe.streams || []).find((s) => s.codec_type === "video") || {};
  ensure(Number(video.width) === MODEL_WIDTH && Number(video.height) === MODEL_HEIGHT, `MODEL_RESOLUTION_INVALID:${video.width}x${video.height}`);
  const hasAudio = (probe.streams || []).some((s) => s.codec_type === "audio");
  const vf = `crop=${WIDTH}:${HEIGHT}:0:8,setsar=1,fps=${FPS},format=yuv420p`;
  if (hasAudio) {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", source, "-t", String(SHOT_DURATION), "-vf", vf,
      "-af", "aresample=48000,aformat=channel_layouts=stereo,apad=pad_dur=6,atrim=duration=6,asetpts=PTS-STARTPTS",
      "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-profile:v", "high", "-level", "5.2",
      "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2", target]);
  } else {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", source,
      "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", String(SHOT_DURATION), "-vf", vf,
      "-c:v", "libx264", "-preset", "slow", "-crf", "12", "-profile:v", "high", "-level", "5.2",
      "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2", "-shortest", target]);
  }
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vfsjqabpkcbiuerhzugk.supabase.co";
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const tokenId = requireEnv("MODAL_TOKEN_ID");
  const tokenSecret = requireEnv("MODAL_TOKEN_SECRET");
  const runKey = text(process.env.AVANTIQO_INVESTOR_PROOF_RUN_KEY) || `hq-dfr-${Date.now()}`;

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const storage = supabase.storage.from(BUCKET);
  const client = new modal.ModalClient({ tokenId, tokenSecret });
  const worker = await client.functions.fromName(MODAL_APP, MODAL_FUNCTION);
  const root = path.join(os.tmpdir(), `avantiqo-investor-hq-${Date.now()}`);
  const outDir = path.resolve("local-audit-output/avantiqo-investor-visual-proof-24s-hq");
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });

  const generated = [];
  for (let index = 0; index < SHOTS.length; index += 1) {
    const shot = SHOTS[index];
    const objectPath = `${ORGANIZATION_ID}/investor-film-hq/${runKey}/generated/${index + 1}-${shot.id}.mp4`;
    await storage.remove([objectPath]).catch(() => null);
    const { data: upload, error: uploadError } = await storage.createSignedUploadUrl(objectPath, { upsert: false });
    if (uploadError || !upload?.signedUrl) throw new Error(`${CONTRACT}_SIGNED_UPLOAD_FAILED:${index + 1}:${uploadError?.message || "missing"}`);

    const payload = {
      capability: "ai.video.generate",
      organization_id: ORGANIZATION_ID,
      usage_id: `${runKey}-shot-${index + 1}`,
      instruction: shot.instruction,
      duration_seconds: SHOT_DURATION,
      seed: shot.seed,
      source_urls: [],
      storage_upload: {
        signed_url: upload.signedUrl,
        storage_reference: `storage://${BUCKET}/${objectPath}`,
      },
    };

    const call = await worker.spawn([payload]);
    const functionCallId = text(call.functionCallId);
    ensure(functionCallId, `FUNCTION_CALL_ID_REQUIRED:${index + 1}`);
    console.log(`AVANTIQO_INVESTOR_HQ_SHOT_${index + 1}_STARTED=${functionCallId}`);

    const deadline = Date.now() + MAX_WAIT_SECONDS * 1000;
    let result = null;
    let polls = 0;
    for (;;) {
      if (Date.now() >= deadline) {
        try { await (await client.functionCalls.fromId(functionCallId)).cancel({ terminateContainers: true }); } catch {}
        throw new Error(`${CONTRACT}_SHOT_TIMEOUT:${index + 1}:${MAX_WAIT_SECONDS}s`);
      }
      const same = await client.functionCalls.fromId(functionCallId);
      try {
        result = await same.get({ timeoutMs: 0 });
        break;
      } catch (error) {
        if (error instanceof modal.FunctionTimeoutError && /Timeout exceeded:\s*0ms/i.test(text(error?.message))) {
          polls += 1;
          console.log(`AVANTIQO_INVESTOR_HQ_SHOT_${index + 1}_PENDING=${polls}`);
          await sleep(10000);
          continue;
        }
        throw error;
      }
    }

    ensure(result?.success === true, `SHOT_FAILED:${index + 1}`);
    ensure(result?.pure_text_to_video === true, `SHOT_NOT_PURE_T2V:${index + 1}`);
    ensure(Number(result?.source_visual_asset_count) === 0, `SHOT_SOURCE_ASSET_VIOLATION:${index + 1}`);
    ensure(result?.model === "avantiqo-ltx-2.5", `SHOT_MODEL_INVALID:${index + 1}`);
    ensure(result?.pipeline === "LTX25_DFR_DETAIL_FIDELITY", `SHOT_PIPELINE_INVALID:${index + 1}`);
    ensure(Number(result?.width) === MODEL_WIDTH && Number(result?.height) === MODEL_HEIGHT, `SHOT_RESOLUTION_INVALID:${index + 1}`);
    ensure(result?.generation?.dfr_used === true, `SHOT_DFR_REQUIRED:${index + 1}`);
    ensure(result?.generation?.detailing_ic_lora_used === true, `SHOT_DETAILING_REQUIRED:${index + 1}`);
    ensure(result?.generation?.pixel_delivery_upscale_used === false, `SHOT_PIXEL_UPSCALE_FORBIDDEN:${index + 1}`);
    generated.push({ shot, objectPath, functionCallId, result });
    console.log(`AVANTIQO_INVESTOR_HQ_SHOT_${index + 1}=PASS:${functionCallId}`);
  }

  const normalized = [];
  for (let index = 0; index < generated.length; index += 1) {
    const local = path.join(root, `generated-${index + 1}.mp4`);
    const norm = path.join(root, `normalized-${index + 1}.mp4`);
    await download(storage, generated[index].objectPath, local);
    normalizeNative(local, norm);
    normalized.push(norm);
  }

  const concatFile = path.join(root, "concat.txt");
  const joined = path.join(root, "joined.mp4");
  await fs.writeFile(concatFile, normalized.map((f) => `file '${f.replaceAll("'", "'\\''")}'`).join("\n") + "\n");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", joined]);

  const finalFile = path.join(outDir, "avantiqo-investor-visual-proof-24s-hq-4k.mp4");
  const regular = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
  const bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  const filter = [
    `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.16:t=fill:enable='between(t,21.6,24)'`,
    `drawtext=fontfile=${bold}:text='AVANTIQO':fontcolor=#D6A66A:fontsize=104:x=(w-text_w)/2:y=874:alpha='if(lt(t,22.0),(t-21.6)/0.4,if(lt(t,23.6),1,(24-t)/0.4))':enable='between(t,21.6,24)'`,
    `drawtext=fontfile=${regular}:text='BUSINESS OPERATING INTELLIGENCE':fontcolor=#F4F1EA:fontsize=40:x=(w-text_w)/2:y=1012:alpha='if(lt(t,22.1),(t-21.7)/0.4,if(lt(t,23.6),0.86,(24-t)/0.4))':enable='between(t,21.7,24)'`,
  ].join(",");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", joined, "-t", String(TARGET_DURATION),
    "-vf", filter, "-af", "aresample=48000,alimiter=limit=0.94",
    "-c:v", "libx264", "-preset", "veryslow", "-crf", "12", "-profile:v", "high", "-level", "5.2", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", finalFile]);

  const finalProbe = ffprobe(finalFile);
  const duration = Number(finalProbe.format?.duration || 0);
  const video = (finalProbe.streams || []).find((s) => s.codec_type === "video") || {};
  ensure(Number(video.width) === WIDTH && Number(video.height) === HEIGHT, `FINAL_RESOLUTION_INVALID:${video.width}x${video.height}`);
  ensure(Math.abs(duration - TARGET_DURATION) <= 0.08, `FINAL_DURATION_INVALID:${duration}`);
  ensure((finalProbe.streams || []).some((s) => s.codec_type === "audio"), "FINAL_AUDIO_REQUIRED");

  const finalBuffer = await fs.readFile(finalFile);
  const finalPath = `${ORGANIZATION_ID}/investor-film-hq/${runKey}/final/avantiqo-investor-visual-proof-24s-hq-4k.mp4`;
  await storage.remove([finalPath]).catch(() => null);
  const { error: finalUploadError } = await storage.upload(finalPath, finalBuffer, { contentType: "video/mp4", upsert: false, cacheControl: "3600" });
  if (finalUploadError) throw new Error(`${CONTRACT}_FINAL_UPLOAD_FAILED:${finalUploadError.message}`);
  const { data: signed, error: signedError } = await storage.createSignedUrl(finalPath, 24 * 60 * 60);
  if (signedError || !signed?.signedUrl) throw new Error(`${CONTRACT}_SIGNED_URL_FAILED`);

  const report = {
    success: true,
    contract: CONTRACT,
    run_key: runKey,
    proof_type: "PURE_T2V_LTX25_DFR_NATIVE_4K_NEW_ASSETS_ONLY",
    generated_shot_count: generated.length,
    generated_duration_seconds: TARGET_DURATION,
    source_visual_asset_count: 0,
    existing_visual_assets_used: false,
    source_images_used: false,
    source_videos_used: false,
    screenshot_or_browser_capture_used: false,
    pure_text_to_video: true,
    modal_used: true,
    model: "avantiqo-ltx-2.5",
    pipeline: "LTX25_DFR_DETAIL_FIDELITY",
    dfr_used: true,
    detailing_ic_lora_used: true,
    native_generation_resolution: `${MODEL_WIDTH}x${MODEL_HEIGHT}`,
    pixel_delivery_upscale_used: false,
    gpu_generation_calls: generated.length,
    simultaneous_gpu_jobs: 1,
    automatic_paid_retry: false,
    external_provider_used: false,
    master_resolution: `${WIDTH}x${HEIGHT}`,
    actual_duration_seconds: duration,
    studio_mastering_used: true,
    shots: generated.map((entry) => ({
      id: entry.shot.id,
      seed: entry.shot.seed,
      storage_reference: `storage://${BUCKET}/${entry.objectPath}`,
      function_call_id: entry.functionCallId,
      result: entry.result,
    })),
    final_output: {
      storage_reference: `storage://${BUCKET}/${finalPath}`,
      signed_url: signed.signedUrl,
      sha256: crypto.createHash("sha256").update(finalBuffer).digest("hex"),
      bytes: finalBuffer.length,
    },
  };
  await fs.writeFile(path.join(outDir, "avantiqo-investor-visual-proof-24s-hq-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${CONTRACT}=PASS`);
  console.log(`FINAL_STORAGE_REFERENCE=${report.final_output.storage_reference}`);
  console.log(`FINAL_SIGNED_URL=${report.final_output.signed_url}`);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exitCode = 1;
});
