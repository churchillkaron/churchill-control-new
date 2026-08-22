export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";

import "@/lib/finance/bootstrap/registerFinanceBilling";
import { ServiceExecutionRuntime } from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { resolveCreativeFfmpegPath, resolveCreativeFfprobePath } from "@/lib/creative/media/runtime/CreativeMediaBinaryRuntime";
import { investorBrandBadge, investorBrandDefs } from "@/lib/investor-film/InvestorBrandMarkRuntime";

const TOKEN = "avq-investor-scene-5-6-review-v3-20260822";
const CONTRACT = "AVANTIQO_INVESTOR_SCENE_5_6_REVIEW_V3";
const ORG = "33336a72-acb5-474e-856b-8be0269360e2";
const PROJECT = "37ca49f2-210d-4665-af6b-6b5fa834f750";
const BUCKET = "creative-assets";
const FPS = 24;
const W = 1920;
const H = 1080;

const MEDIA = {
  operations: `${ORG}/unassigned/cbba2295-76c6-43ea-acf5-1511017cc63b-gemini-v24pbxy5sy1t.mp4`,
  customers: `${ORG}/unassigned/7c1d5a46-812f-4c68-9e4f-0162c0748360-gemini-hr90v0w9p4wc.mp4`,
  staff: `${ORG}/unassigned/97c0dbc3-5cd0-49f8-8121-1f85831ed2ab-gemini-fpkwe0jb7rex.mp4`,
  suppliers: `${ORG}/unassigned/eef84bd3-c208-4ed8-bba0-6088a9b67ef9-gemini-thgn4qnk6hof.mp4`,
  manager: `${ORG}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`,
  score: `${ORG}/avantiqo-investor-film-20260820/audio/avantiqo-investor-score-v1-approved.mp3`,
};

const OUT5 = `${ORG}/${PROJECT}/scene-previews-20260822/scene-05-operations-luxury-review-v3.mp4`;
const OUT6 = `${ORG}/${PROJECT}/scene-previews-20260822/scene-06-fragmentation-luxury-review-v3.mp4`;
const supabase = getServiceSupabase();

function response(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store, private" } });
}

function run(command, args, timeoutMs = 285000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, OMP_NUM_THREADS: "1" } });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("SCENE_5_6_V3_TIMEOUT")); }, timeoutMs);
    child.stdout.on("data", (c) => stdout.push(c));
    child.stderr.on("data", (c) => stderr.push(c));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) reject(new Error(err.slice(-16000) || `MEDIA_EXIT_${code}`)); else resolve(out);
    });
  });
}

async function download(storagePath, localPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  if (!data) throw new Error(`SOURCE_EMPTY:${storagePath}`);
  await fs.writeFile(localPath, Buffer.from(await data.arrayBuffer()));
}

async function exists(storagePath) {
  const dir = path.posix.dirname(storagePath);
  const file = path.posix.basename(storagePath);
  const { data, error } = await supabase.storage.from(BUCKET).list(dir, { search: file, limit: 10 });
  if (error) return false;
  return (data || []).some((r) => r.name === file);
}

async function signed(storagePath, seconds = 86400) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function upload(storagePath, localPath, metadata) {
  const bytes = await fs.readFile(localPath);
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4", upsert: true, cacheControl: "3600",
    metadata: { ...metadata, contract: CONTRACT, organization_id: ORG, creative_project_id: PROJECT, no_churchill: "true", print_screen_used: "false", publication_authorized: "false", sha256 },
  });
  if (error) throw error;
  return { bytes: bytes.length, sha256 };
}

function findAudio(value, depth = 0) {
  if (depth > 9 || !value || typeof value !== "object") return null;
  if (typeof value.audio_base64 === "string" && value.audio_base64.trim()) return value.audio_base64.trim();
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    const found = findAudio(item, depth + 1);
    if (found) return found;
  }
  return null;
}

async function speech(text, operation, out) {
  const words = text.split(/\s+/).filter(Boolean).length;
  const execution = await ServiceExecutionRuntime.execute({
    organization_id: ORG,
    bill_to_organization_id: ORG,
    service_id: "ai.text.to.speech",
    input: {
      input: text,
      voice: "cedar",
      response_format: "mp3",
      speed: 0.89,
      quantity: Math.max(0.02, words / 124),
      instructions: "Continuation of the approved Avantiqo founder investor-film performance. Neutral international English, warm, intelligent, experienced, calm, assured and cinematic. Never announcer-like. Pronounce Avantiqo as ah-VAN-tee-koh.",
    },
    metadata: { module: "CREATIVE", operation, brand: "Avantiqo", speaker_policy: "ONE_FOUNDER_VOICE_ENTIRE_FILM" },
    category: "AI",
  });
  const base64 = findAudio(execution);
  if (!base64) throw new Error("TTS_EMPTY");
  await fs.writeFile(out, Buffer.from(base64, "base64"));
}

async function probeDuration(ffprobe, file) {
  const raw = await run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", file], 60000);
  const n = Number(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) throw new Error(`BAD_DURATION:${file}`);
  return n;
}

async function normalize(ffmpeg, source, output, seconds, start = 0) {
  const args = ["-y"];
  if (start > 0) args.push("-ss", String(start));
  args.push("-stream_loop", "-1", "-i", source, "-t", String(seconds), "-an", "-vf", `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p`, "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-r", String(FPS), "-movflags", "+faststart", output);
  await run(ffmpeg, args);
}

async function svgToRaw(directory, name, svg) {
  const raw = await sharp(svg).resize(W, H).ensureAlpha().raw().toBuffer();
  const target = path.join(directory, `${name}.rgba`);
  await fs.writeFile(target, raw);
  return target;
}

async function overlayRaw(ffmpeg, source, rgba, output, seconds, start = 0) {
  const args = ["-y"];
  if (start > 0) args.push("-ss", String(start));
  args.push(
    "-stream_loop", "-1", "-i", source,
    "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${W}x${H}`, "-framerate", String(FPS), "-i", rgba,
    "-t", String(seconds),
    "-filter_complex", `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},format=yuv420p[b];[1:v]format=rgba[o];[b][o]overlay=x='4*sin(t*.67)':y='3*sin(t*.49)':eof_action=repeat:repeatlast=1,format=yuv420p[v]`,
    "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "fast", "-crf", "16", "-r", String(FPS), "-movflags", "+faststart", output,
  );
  await run(ffmpeg, args);
}

async function concat(ffmpeg, clips, output, directory) {
  const list = path.join(directory, "concat.txt");
  await fs.writeFile(list, clips.map((c) => `file '${c.replace(/'/g, "'\\''")}'`).join("\n"));
  await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", list, "-an", "-c:v", "copy", "-movflags", "+faststart", output]);
}

async function mix(ffmpeg, picture, voice, score, scoreOffset, seconds, output) {
  const filter = `[1:a]asetpts=PTS-STARTPTS,volume=1,apad,atrim=duration=${seconds}[v];[2:a]atrim=start=${scoreOffset}:duration=${seconds},asetpts=PTS-STARTPTS,volume=.14,afade=t=in:st=0:d=.18,afade=t=out:st=${Math.max(.2, seconds - .3)}:d=.25[s];[v][s]amix=inputs=2:duration=longest:normalize=0,alimiter=limit=.95,atrim=duration=${seconds}[a]`;
  await run(ffmpeg, ["-y", "-i", picture, "-i", voice, "-i", score, "-filter_complex", filter, "-map", "0:v:0", "-map", "[a]", "-t", String(seconds), "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", output]);
}

function channelsSvg() {
  const nodes = [["whatsapp",135,230,220],["line",410,145,220],["messenger",690,230,220],["instagram",970,145,220],["facebook",1250,230,220],["googleReviews",1510,145,270]];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${investorBrandDefs()}<radialGradient id="g"><stop offset="0" stop-color="#fff" stop-opacity=".075"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><ellipse cx="960" cy="430" rx="820" ry="340" fill="url(#g)"/>${nodes.map(([key,x,y,w])=>`<g transform="translate(${x} ${y})"><rect width="${w}" height="86" rx="31" fill="#05070a" fill-opacity=".30" stroke="#e8edf2" stroke-opacity=".20"/><path d="M24 10 H${w-34}" stroke="#fff" stroke-opacity=".17"/>${investorBrandBadge(key,{x:14,y:18,width:w-28,height:50})}</g>`).join("")}</svg>`);
}

function campaignSvg() {
  const keys = ["facebook","instagram","googleAds","tiktok","youtube","linkedin"];
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs>${investorBrandDefs()}<linearGradient id="e"><stop offset="0" stop-color="#fff" stop-opacity=".42"/><stop offset=".5" stop-color="#bcc3cb" stop-opacity=".11"/><stop offset="1" stop-color="#d6a66a" stop-opacity=".30"/></linearGradient></defs><path d="M140 520 C520 260 1400 260 1780 520" fill="none" stroke="url(#e)" stroke-opacity=".30" stroke-width="1.5"/>${keys.map((key,i)=>`<g transform="translate(${120+i*282} ${i%2===0?210:138})"><rect width="224" height="88" rx="32" fill="#05070a" fill-opacity=".29" stroke="#e8edf2" stroke-opacity=".19"/><path d="M22 11 H192" stroke="#fff" stroke-opacity=".16"/>${investorBrandBadge(key,{x:14,y:19,width:196,height:50})}</g>`).join("")}</svg>`);
}

function creativeSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><defs><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".35" stop-color="#aab1ba" stop-opacity=".05"/><stop offset="1" stop-color="#d6a66a" stop-opacity=".05"/></linearGradient><radialGradient id="metal"><stop offset="0" stop-color="#f4f1e9"/><stop offset=".25" stop-color="#9da4ac"/><stop offset=".5" stop-color="#242930"/><stop offset=".72" stop-color="#d6a66a"/><stop offset="1" stop-color="#050607"/></radialGradient><linearGradient id="edge"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset="1" stop-color="#d6a66a" stop-opacity=".32"/></linearGradient></defs><g transform="translate(500 125)"><rect width="920" height="720" rx="44" fill="#040506" fill-opacity=".42" stroke="url(#edge)" stroke-width="1.3"/><rect x="20" y="20" width="880" height="680" rx="34" fill="url(#glass)"/><g transform="translate(460 385) rotate(-16)"><ellipse rx="190" ry="265" fill="url(#metal)"/><ellipse cx="-24" cy="-42" rx="105" ry="170" fill="#080a0d" fill-opacity=".34"/><path d="M-92 -174 C-12 -255 116 -205 146 -90" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="4"/><path d="M-124 180 C-45 255 92 232 148 128" fill="none" stroke="#d6a66a" stroke-opacity=".58" stroke-width="5"/></g><path d="M70 72 H842" stroke="#fff" stroke-opacity=".14"/><circle cx="842" cy="72" r="4" fill="#d6a66a"/></g></svg>`);
}

async function render() {
  const ffmpeg = resolveCreativeFfmpegPath();
  const ffprobe = resolveCreativeFfprobePath();
  if (!ffmpeg || !ffprobe) throw new Error("MEDIA_EDITOR_NOT_READY");
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "avq-scenes-56-v3-"));
  try {
    const local = Object.fromEntries(Object.keys(MEDIA).map((k)=>[k,path.join(dir,`${k}.${k==="score"?"mp3":"mp4"}`)]));
    await Promise.all(Object.entries(MEDIA).map(([k,p])=>download(p,local[k])));

    const voice5 = path.join(dir,"voice5.mp3");
    const voice6 = path.join(dir,"voice6.mp3");
    const line5 = "Operations knew another.";
    const line6 = "Customers, staff, suppliers, conversations, campaigns and creative work all lived in different systems.";
    await speech(line5,"AVANTIQO_INVESTOR_SCENE_5_REVIEW_V3",voice5);
    await speech(line6,"AVANTIQO_INVESTOR_SCENE_6_REVIEW_V3",voice6);
    const d5 = Math.max(1.2, Math.min(2.5,(await probeDuration(ffprobe,voice5))+.08));
    const d6 = Math.max(5.1, Math.min(7.5,(await probeDuration(ffprobe,voice6))+.12));

    const p5 = path.join(dir,"p5.mp4");
    const f5 = path.join(dir,"f5.mp4");
    await normalize(ffmpeg,local.operations,p5,d5,.55);
    await mix(ffmpeg,p5,voice5,local.score,14.344,d5,f5);
    const s5 = await upload(OUT5,f5,{scene:"5",role:"LIVE_OPERATIONS_KITCHEN",narration:line5,treatment:"REAL_CINEMATIC_OPERATIONS_NO_UI_NO_HOLOGRAM"});

    const rawChannels = await svgToRaw(dir,"channels",channelsSvg());
    const rawCampaign = await svgToRaw(dir,"campaign",campaignSvg());
    const rawCreative = await svgToRaw(dir,"creative",creativeSvg());
    const weights=[.155,.155,.155,.18,.18,.175];
    const ds=weights.map(w=>d6*w); ds[5]+=d6-ds.reduce((a,b)=>a+b,0);
    const clips=Array.from({length:6},(_,i)=>path.join(dir,`s6-${i}.mp4`));
    await normalize(ffmpeg,local.customers,clips[0],ds[0],.35);
    await normalize(ffmpeg,local.staff,clips[1],ds[1],.45);
    await normalize(ffmpeg,local.suppliers,clips[2],ds[2],.40);
    await overlayRaw(ffmpeg,local.manager,rawChannels,clips[3],ds[3],.25);
    await overlayRaw(ffmpeg,local.manager,rawCampaign,clips[4],ds[4],1.55);
    await overlayRaw(ffmpeg,local.manager,rawCreative,clips[5],ds[5],3.0);
    const p6=path.join(dir,"p6.mp4"); const f6=path.join(dir,"f6.mp4");
    await concat(ffmpeg,clips,p6,dir);
    await mix(ffmpeg,p6,voice6,local.score,15.61,d6,f6);
    const s6=await upload(OUT6,f6,{scene:"6",role:"FRAGMENTATION_MONTAGE_REVISED",narration:line6,treatment:"FOOTAGE_FIRST_LUXURY_OPTICAL_GLASS",communication_marks:"WHATSAPP,LINE,MESSENGER,INSTAGRAM,FACEBOOK,GOOGLE_REVIEWS",campaign_marks:"FACEBOOK,INSTAGRAM,GOOGLE_ADS,TIKTOK,YOUTUBE,LINKEDIN",churchill_used:"false"});

    return {success:true,contract:CONTRACT,scene5:{duration_seconds:d5,output_path:OUT5,signed_url:await signed(OUT5),...s5},scene6:{duration_seconds:d6,output_path:OUT6,signed_url:await signed(OUT6),...s6},rules:{no_churchill:true,no_print_screens:true,luxury_optical_glass:true,footage_first:true}};
  } finally { await fs.rm(dir,{recursive:true,force:true}).catch(()=>{}); }
}

export async function GET(request) {
  try {
    const url=new URL(request.url);
    if(url.searchParams.get("token")!==TOKEN) return response({success:false},404);
    const action=String(url.searchParams.get("action")||"status").toLowerCase();
    if(action==="render") return response(await render());
    if(action==="signed") {
      const [r5,r6]=await Promise.all([exists(OUT5),exists(OUT6)]);
      return response({success:true,scene5:{output_ready:r5,output_path:OUT5,signed_url:r5?await signed(OUT5):null},scene6:{output_ready:r6,output_path:OUT6,signed_url:r6?await signed(OUT6):null}});
    }
    if(action==="status") return response({success:true,contract:CONTRACT,scene5:{output_ready:await exists(OUT5),output_path:OUT5},scene6:{output_ready:await exists(OUT6),output_path:OUT6},rules:{no_churchill:true,no_print_screens:true,luxury_optical_glass:true,footage_first:true}});
    return response({success:false,error:"Unsupported action"},400);
  } catch(error) { return response({success:false,contract:CONTRACT,error:error?.message||String(error)},500); }
}
