import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

import { createClient } from "@supabase/supabase-js";
import * as modal from "modal";

const CONTRACT = "AVANTIQO_INVESTOR_VISUAL_PROOF_24S_NEW_ONLY_V1";
const MODAL_APP = "avantiqo-video-owned";
const MODAL_FUNCTION = "generate_investor_t2v_job";
const BUCKET = "creative-assets";
const ORGANIZATION_ID = "9a148429-b6a0-4bc6-ac83-a35c64fb7045";
const WIDTH = 3840;
const MODEL_HEIGHT = 2176;
const HEIGHT = 2160;
const FPS = 24;
const SHOT_DURATION = 6;
const TARGET_DURATION = 24;
const MAX_WAIT_SECONDS = Math.max(300, Number(process.env.AVANTIQO_INVESTOR_T2V_MAX_WAIT_SECONDS || 600));

const SHOTS = Object.freeze([
  {
    id: "evidence",
    seed: 26090501,
    instruction: "Prestige investor-film opening in a real high-end hospitality receiving area before service. Start extremely close on the tactile evidence of a delivery: cardboard edge, sealed packing slip, stainless surface, cool morning condensation. Reveal a serious receiving manager discovering a critical supplier short-shipment through the physical absence of an expected item. No melodrama. The moment is quiet, expensive and consequential. Camera language like a premium global brand film: controlled macro-to-medium reveal, deliberate focus pull, natural practical light, restrained contrast, authentic wardrobe and materials, physically correct hands. The audience must understand that one small operational event matters before any technology appears.",
  },
  {
    id: "consequence",
    seed: 26090502,
    instruction: "Continue the same serious enterprise story inside one real operating business. Show one supplier exception becoming multiple real consequences without montage gimmicks: a chef pauses at an empty prep position, service adjusts a commitment, a manager sees the financial consequence in a paper invoice and makes a measured call. One continuous motivated camera move links these people and spaces so the causal chain is visually clear. Premium documentary-commercial realism, quiet urgency, natural performance, subtle warm practical lighting, precise composition, no smiling stock actors, no exaggerated crisis, no technology yet.",
  },
  {
    id: "intelligence",
    seed: 26090503,
    instruction: "First controlled reveal of Avantiqo intelligence in a premium executive operating environment. Do not show a conventional dashboard. A real manager sits at a beautifully designed dark workstation in the same business. On one large physical display, a minimal obsidian operating surface resolves one real evidence object into connected operational context: restrained warm-gold continuity lines, crisp off-white geometric evidence cards, three downstream consequence paths and one governed proposed action. No readable generated words. The visual should feel like an intelligent operating system, not software marketing art. Camera slowly arcs from the manager and physical evidence toward the display; subtle screen reflections, realistic luminance, deep blacks, warm gold only, quiet confidence, no holograms or floating sci-fi graphics.",
  },
  {
    id: "judgment",
    seed: 26090504,
    instruction: "Prestige investor-film close about human control and foresight. In a calm real operations setting, the responsible manager reviews a consequential recommendation with evidence attached on a physical display, makes a deliberate approval/change decision, and the operation responds: staff move with clarity, the earlier disruption is controlled. In the final seconds, the environment becomes calm again and a subtle early-warning signal appears on the real display as the system recognizes a repeating risk before it becomes another disruption. Human judgment remains visibly central. Elegant cinematic restraint, realistic faces and hands, subtle camera push, natural sound and practical light, no triumphant tech fantasy, no logo inside the generated shot.",
  },
]);

function text(v) { return String(v ?? "").trim(); }
function ensure(c, code) { if (!c) throw new Error(`${CONTRACT}_${code}`); }
function requireEnv(name) { const v = text(process.env[name]); if (!v) throw new Error(`${name}_REQUIRED`); return v; }
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function ffprobe(file) { return JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,avg_frame_rate", "-of", "json", file], { encoding: "utf8" })); }

async function download(storage, objectPath, localPath) {
  const { data, error } = await storage.download(objectPath);
  if (error || !data) throw new Error(`${CONTRACT}_DOWNLOAD_FAILED:${objectPath}:${error?.message || "missing"}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

function normalize(source, target) {
  const probe = ffprobe(source);
  const hasAudio = (probe.streams || []).some((s) => s.codec_type === "audio");
  const vf = `scale=${WIDTH}:${MODEL_HEIGHT}:flags=lanczos,crop=${WIDTH}:${HEIGHT}:0:8,setsar=1,fps=${FPS},format=yuv420p`;
  if (hasAudio) {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", source, "-t", String(SHOT_DURATION), "-vf", vf, "-af", "aresample=48000,aformat=channel_layouts=stereo,apad=pad_dur=6,atrim=duration=6,asetpts=PTS-STARTPTS", "-c:v", "libx264", "-preset", "fast", "-crf", "14", "-profile:v", "high", "-level", "5.2", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", target]);
  } else {
    execFileSync("ffmpeg", ["-y", "-v", "error", "-i", source, "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", String(SHOT_DURATION), "-vf", vf, "-c:v", "libx264", "-preset", "fast", "-crf", "14", "-profile:v", "high", "-level", "5.2", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-shortest", target]);
  }
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://vfsjqabpkcbiuerhzugk.supabase.co";
  const serviceRole = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const tokenId = requireEnv("MODAL_TOKEN_ID");
  const tokenSecret = requireEnv("MODAL_TOKEN_SECRET");
  const runKey = text(process.env.AVANTIQO_INVESTOR_PROOF_RUN_KEY) || `new-only-${Date.now()}`;

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
  const storage = supabase.storage.from(BUCKET);
  const client = new modal.ModalClient({ tokenId, tokenSecret });
  const worker = await client.functions.fromName(MODAL_APP, MODAL_FUNCTION);
  const root = path.join(os.tmpdir(), `avantiqo-investor-new-only-${Date.now()}`);
  const outDir = path.resolve("local-audit-output/avantiqo-investor-visual-proof-24s-new-only");
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });

  const generated = [];
  for (let index = 0; index < SHOTS.length; index += 1) {
    const shot = SHOTS[index];
    const objectPath = `${ORGANIZATION_ID}/investor-film-new-only/${runKey}/generated/${index + 1}-${shot.id}.mp4`;
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
      storage_upload: { signed_url: upload.signedUrl, storage_reference: `storage://${BUCKET}/${objectPath}` },
    };

    const call = await worker.spawn([payload]);
    const functionCallId = text(call.functionCallId);
    ensure(functionCallId, `FUNCTION_CALL_ID_REQUIRED:${index + 1}`);
    const deadline = Date.now() + MAX_WAIT_SECONDS * 1000;
    let result = null;
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
          await sleep(8000);
          continue;
        }
        throw error;
      }
    }
    ensure(result?.success === true, `SHOT_FAILED:${index + 1}`);
    ensure(result?.pure_text_to_video === true, `SHOT_NOT_PURE_T2V:${index + 1}`);
    ensure(Number(result?.source_visual_asset_count) === 0, `SHOT_SOURCE_ASSET_VIOLATION:${index + 1}`);
    ensure(result?.model === "avantiqo-ltx-2.5", `SHOT_MODEL_INVALID:${index + 1}`);
    ensure(Number(result?.width) === 1920 && Number(result?.height) === 1088, `SHOT_RESOLUTION_INVALID:${index + 1}`);
    generated.push({ shot, objectPath, functionCallId, result });
    console.log(`AVANTIQO_INVESTOR_NEW_ONLY_SHOT_${index + 1}=PASS:${functionCallId}`);
  }

  const normalized = [];
  for (let index = 0; index < generated.length; index += 1) {
    const local = path.join(root, `generated-${index + 1}.mp4`);
    const norm = path.join(root, `normalized-${index + 1}.mp4`);
    await download(storage, generated[index].objectPath, local);
    normalize(local, norm);
    normalized.push(norm);
  }

  const concatFile = path.join(root, "concat.txt");
  const joined = path.join(root, "joined.mp4");
  await fs.writeFile(concatFile, normalized.map((f) => `file '${f.replaceAll("'", "'\\''")}'`).join("\n") + "\n");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", joined]);

  const finalFile = path.join(outDir, "avantiqo-investor-visual-proof-24s-new-only-4k.mp4");
  const regular = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf";
  const bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf";
  const filter = [
    `drawbox=x=0:y=0:w=iw:h=ih:color=black@0.20:t=fill:enable='between(t,21.6,24)'`,
    `drawtext=fontfile=${bold}:text='AVANTIQO':fontcolor=#D6A66A:fontsize=108:x=(w-text_w)/2:y=880:alpha='if(lt(t,22.0),(t-21.6)/0.4,if(lt(t,23.6),1,(24-t)/0.4))':enable='between(t,21.6,24)'`,
    `drawtext=fontfile=${regular}:text='BUSINESS OPERATING INTELLIGENCE':fontcolor=#F4F1EA:fontsize=42:x=(w-text_w)/2:y=1018:alpha='if(lt(t,22.1),(t-21.7)/0.4,if(lt(t,23.6),0.86,(24-t)/0.4))':enable='between(t,21.7,24)'`,
  ].join(",");
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", joined, "-t", String(TARGET_DURATION), "-vf", filter, "-af", "aresample=48000,alimiter=limit=0.94", "-c:v", "libx264", "-preset", "slow", "-crf", "14", "-profile:v", "high", "-level", "5.2", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", finalFile]);

  const finalProbe = ffprobe(finalFile);
  const duration = Number(finalProbe.format?.duration || 0);
  const video = (finalProbe.streams || []).find((s) => s.codec_type === "video") || {};
  ensure(Number(video.width) === WIDTH && Number(video.height) === HEIGHT, `FINAL_RESOLUTION_INVALID:${video.width}x${video.height}`);
  ensure(Math.abs(duration - TARGET_DURATION) <= 0.08, `FINAL_DURATION_INVALID:${duration}`);
  ensure((finalProbe.streams || []).some((s) => s.codec_type === "audio"), "FINAL_AUDIO_REQUIRED");

  const finalBuffer = await fs.readFile(finalFile);
  const finalPath = `${ORGANIZATION_ID}/investor-film-new-only/${runKey}/final/avantiqo-investor-visual-proof-24s-new-only-4k.mp4`;
  await storage.remove([finalPath]).catch(() => null);
  const { error: finalUploadError } = await storage.upload(finalPath, finalBuffer, { contentType: "video/mp4", upsert: false, cacheControl: "3600" });
  if (finalUploadError) throw new Error(`${CONTRACT}_FINAL_UPLOAD_FAILED:${finalUploadError.message}`);
  const { data: signed, error: signedError } = await storage.createSignedUrl(finalPath, 24 * 60 * 60);
  if (signedError || !signed?.signedUrl) throw new Error(`${CONTRACT}_SIGNED_URL_FAILED`);

  const report = {
    success: true,
    contract: CONTRACT,
    run_key: runKey,
    proof_type: "PURE_T2V_NEW_ASSETS_ONLY",
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
    pipeline: "DISTILLED_TWO_STAGE_T2V_BF16",
    gpu_generation_calls: generated.length,
    automatic_paid_retry: false,
    external_provider_used: false,
    master_resolution: `${WIDTH}x${HEIGHT}`,
    actual_duration_seconds: duration,
    studio_mastering_used: true,
    shots: generated.map((entry, i) => ({ id: entry.shot.id, seed: entry.shot.seed, storage_reference: `storage://${BUCKET}/${entry.objectPath}`, function_call_id: entry.functionCallId, result: entry.result })),
    final_output: {
      storage_reference: `storage://${BUCKET}/${finalPath}`,
      signed_url: signed.signedUrl,
      sha256: crypto.createHash("sha256").update(finalBuffer).digest("hex"),
      bytes: finalBuffer.length,
    },
  };
  await fs.writeFile(path.join(outDir, "avantiqo-investor-visual-proof-24s-new-only-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${CONTRACT}=PASS`);
  console.log(`FINAL_SIGNED_URL=${signed.signedUrl}`);
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
