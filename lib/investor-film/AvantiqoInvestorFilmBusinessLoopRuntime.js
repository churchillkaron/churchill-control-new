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
const ENTITY_ID = "073dc5f5-b6a8-4cae-8cda-fd7acb21ef50";
const OUTPUT_DIR = `${ORGANIZATION_ID}/avantiqo-investor-film-20260819`;
const OUTPUT_PATH = `${OUTPUT_DIR}/avantiqo-business-loop-vfx-v1.mp4`;

const SOURCES = Object.freeze({
  growth: `${ORGANIZATION_ID}/unassigned/8ad5ac7b-2db9-46a3-8ecf-65e7a7d134a7-gemini-qv0auqgaxcyl.mp4`,
  communications: `${ORGANIZATION_ID}/unassigned/51e67c02-7a80-49c2-bca9-354f5fae7c72-gemini-5f5uydt8ya3j.mp4`,
  restaurant: `${ORGANIZATION_ID}/unassigned/e1b2c387-2dda-4192-bb7a-3cea339e2293-gemini-32vbfjlubvh7.mp4`,
  kitchen: `${ORGANIZATION_ID}/unassigned/cbba2295-76c6-43ea-acf5-1511017cc63b-gemini-v24pbxy5sy1t.mp4`,
  bar: `${ORGANIZATION_ID}/unassigned/316fafe1-6521-4879-8431-4c4fd428a821-gemini-mxcowg69gr1f.mp4`,
  manager: `${ORGANIZATION_ID}/unassigned/b1f518b9-e1da-4153-a665-93d1768b42f3-gemini-5sts8qv981mh.mp4`,
  finance: `${ORGANIZATION_ID}/unassigned/701a4abb-3ed8-4460-99ef-d388d1ce1ffa-gemini-8yvpgxklek51.mp4`,
});

const FLOW = Object.freeze(["STUDIO", "MARKETING", "CUSTOMER", "WAITER", "KITCHEN", "BAR", "POS", "FINANCE", "INTELLIGENCE", "FOLLOW-UP"]);

const SCENES = Object.freeze([
  { id: "studio", source: "growth", eyebrow: "CREATIVE STUDIO", title: "Build the next business move", subtitle: "The campaign starts from company context, not a blank prompt.", rows: [["Business goal", "CONNECTED"], ["Brand context", "LOADED"], ["Audience memory", "READY"], ["Creative direction", "PREPARED"]], action: "Prepare campaign for Marketing", current: 0, origin: [792, 356], target: [420, 92] },
  { id: "marketing", source: "growth", eyebrow: "MARKETING", title: "Campaign approved for release", subtitle: "Publishing and measurement stay attached to the same business objective.", rows: [["Channel plan", "READY"], ["Audience", "CONNECTED"], ["Publishing", "APPROVED"], ["Conversion tracking", "ACTIVE"]], action: "Watch for customer response", current: 1, origin: [792, 356], target: [72, 92] },
  { id: "customer", source: "communications", eyebrow: "CUSTOMER CONTEXT", title: "A response becomes a business event", subtitle: "Avantiqo keeps the campaign source, customer context and next action connected.", rows: [["Campaign source", "LINKED"], ["Customer context", "IDENTIFIED"], ["Intent", "CAPTURED"], ["History", "AVAILABLE"]], action: "Continue into the operating flow", current: 2, origin: [646, 468], target: [420, 96] },
  { id: "waiter", source: "restaurant", eyebrow: "ORDER CONTEXT", title: "One order. One business record.", subtitle: "The waiter enters the order once. Avantiqo routes the work automatically.", rows: [["Customer / table", "CONNECTED"], ["Order", "CAPTURED"], ["Food items", "→ KITCHEN"], ["Beverage items", "→ BAR"]], action: "Route production without re-entry", current: 3, origin: [704, 466], target: [420, 104] },
  { id: "kitchen", source: "kitchen", eyebrow: "KITCHEN EXECUTION", title: "Production receives exactly what it needs", subtitle: "The same order becomes a kitchen work event with status and cost context.", rows: [["Order", "RECEIVED"], ["Production", "IN PROGRESS"], ["Readiness", "TRACKED"], ["Cost context", "CONNECTED"]], action: "Return readiness to service", current: 4, origin: [884, 300], target: [72, 104] },
  { id: "bar", source: "bar", eyebrow: "BAR EXECUTION", title: "A parallel workstream stays synchronized", subtitle: "Beverage production remains part of the same customer and order context.", rows: [["Beverage queue", "RECEIVED"], ["Preparation", "IN PROGRESS"], ["Table sync", "ACTIVE"], ["Stock context", "CONNECTED"]], action: "Return completion to the order", current: 5, origin: [748, 462], target: [420, 104] },
  { id: "pos", source: "restaurant", eyebrow: "TRANSACTION", title: "Execution becomes a transaction", subtitle: "Kitchen, bar and service resolve into one financial source event.", rows: [["Service", "COMPLETE"], ["Bill", "ASSEMBLED"], ["Payment", "CAPTURED"], ["Order", "CLOSED"]], action: "Create the financial event", current: 6, origin: [716, 454], target: [72, 104] },
  { id: "finance", source: "finance", eyebrow: "FINANCE", title: "The books retain the operational story", subtitle: "Finance sees not only what happened, but the business event that caused it.", rows: [["Revenue", "LINKED"], ["Tax", "RECORDED"], ["Cost", "CONNECTED"], ["Margin", "UPDATED"]], action: "Send the complete event to Intelligence", current: 7, origin: [870, 338], target: [420, 94] },
  { id: "intelligence", source: "manager", eyebrow: "AVANTIQO BUSINESS PARTNER", title: "I understand the complete business event", subtitle: "Campaign → customer → order → production → payment → finance.", rows: [["Cause and effect", "UNDERSTOOD"], ["Business signals", "CONNECTED"], ["Opportunity", "IDENTIFIED"], ["Next best action", "PREPARED"]], action: "Recommend, explain and prepare execution", current: 8, origin: [730, 340], target: [72, 92] },
  { id: "follow_up", source: "communications", eyebrow: "FOLLOW-UP", title: "The business learns and acts again", subtitle: "Customer follow-up and campaign learning return to Studio for the next cycle.", rows: [["Customer follow-up", "PREPARED"], ["Review request", "READY"], ["Campaign learning", "SAVED"], ["Studio memory", "UPDATED"]], action: "Close the loop → Creative Studio", current: 9, origin: [646, 468], target: [420, 96] },
]);

const THREAD_ARGS = ["-threads", "1", "-filter_threads", "1", "-filter_complex_threads", "1"];
const SCENE_DURATION = 4.8;

function run(command, args, timeoutMs = 290000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, OMP_NUM_THREADS: "1" } });
    const stderr = [];
    const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("AVANTIQO_BUSINESS_LOOP_RENDER_TIMEOUT")); }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => { clearTimeout(timer); if (code !== 0) { reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-14000) || `FFMPEG_EXIT_${code}`)); return; } resolve(Buffer.concat(stderr).toString("utf8")); });
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
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, { contentType: "video/mp4", upsert: true, cacheControl: "3600" });
  if (error) throw error;
  return { bucket: BUCKET, path: storagePath, bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function panelSvg(scene) {
  const rowY = [240, 296, 352, 408];
  const rows = scene.rows.map(([label, value], index) => `<rect x="48" y="${rowY[index] - 34}" width="864" height="46" rx="13" fill="#ffffff" fill-opacity="0.035" stroke="#ffffff" stroke-opacity="0.08"/><text x="70" y="${rowY[index] - 5}" fill="#d5d7dc" font-family="Arial, Helvetica, sans-serif" font-size="18">${esc(label)}</text><text x="888" y="${rowY[index] - 5}" fill="#d5b977" font-family="Arial, Helvetica, sans-serif" font-size="16" font-weight="700" text-anchor="end">${esc(value)}</text>`).join("");
  const stepWidth = 84;
  const stepGap = 8;
  const totalWidth = FLOW.length * stepWidth + (FLOW.length - 1) * stepGap;
  const startX = (960 - totalWidth) / 2;
  const flow = FLOW.map((label, index) => { const x = startX + index * (stepWidth + stepGap); const active = index === scene.current; return `<rect x="${x}" y="492" width="${stepWidth}" height="34" rx="10" fill="${active ? "#d5b977" : "#ffffff"}" fill-opacity="${active ? "0.92" : "0.035"}" stroke="${active ? "#ead79f" : "#ffffff"}" stroke-opacity="${active ? "0.9" : "0.07"}"/><text x="${x + stepWidth / 2}" y="514" fill="${active ? "#08090b" : "#8d919a"}" font-family="Arial, Helvetica, sans-serif" font-size="10" font-weight="${active ? "700" : "500"}" text-anchor="middle">${esc(label)}</text>`; }).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><defs><linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#090c11" stop-opacity="0.82"/><stop offset="0.58" stop-color="#05070b" stop-opacity="0.72"/><stop offset="1" stop-color="#0d1016" stop-opacity="0.64"/></linearGradient><linearGradient id="gold" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6f5c35" stop-opacity="0.2"/><stop offset="0.52" stop-color="#dcc48a" stop-opacity="0.96"/><stop offset="1" stop-color="#6f5c35" stop-opacity="0.15"/></linearGradient><radialGradient id="light" cx="0.18" cy="0.03" r="0.72"><stop offset="0" stop-color="#ffffff" stop-opacity="0.12"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="12"/></filter></defs><rect x="18" y="22" width="924" height="500" rx="32" fill="#000000" fill-opacity="0.42" filter="url(#shadow)"/><rect x="20" y="20" width="920" height="500" rx="32" fill="url(#glass)" stroke="#cdb77e" stroke-opacity="0.56" stroke-width="1.4"/><rect x="22" y="22" width="916" height="496" rx="30" fill="url(#light)"/><rect x="44" y="46" width="872" height="1.5" rx="1" fill="url(#gold)"/><circle cx="62" cy="82" r="6" fill="#d7bd7e"/><text x="82" y="88" fill="#d7bd7e" font-family="Arial, Helvetica, sans-serif" font-size="14" font-weight="700" letter-spacing="1.8">AVANTIQO · ${esc(scene.eyebrow)}</text><text x="48" y="145" fill="#f6f6f4" font-family="Arial, Helvetica, sans-serif" font-size="36" font-weight="700">${esc(scene.title)}</text><text x="48" y="178" fill="#a9adb6" font-family="Arial, Helvetica, sans-serif" font-size="17">${esc(scene.subtitle)}</text>${rows}<rect x="48" y="438" width="864" height="38" rx="12" fill="#d5b977" fill-opacity="0.1" stroke="#d5b977" stroke-opacity="0.28"/><text x="70" y="463" fill="#d8c18a" font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700">NEXT · ${esc(scene.action)}</text>${flow}</svg>`);
}

async function makePanelPng(directory, scene) {
  const target = path.join(directory, `panel-${scene.id}.png`);
  await sharp(panelSvg(scene)).png().toFile(target);
  return target;
}

function riseExpression(start, end, from, to) {
  return `if(lt(t,${start}),${from},if(lt(t,${end}),${from}+(${to}-${from})*(t-${start})/(${end}-${start}),${to}))`;
}

async function renderGlassScene(ffmpeg, sourceUrl, panelPath, scene, output) {
  const start = 0.62;
  const end = 1.72;
  const fadeOut = 4.42;
  const originWidth = 190;
  const originHeight = 107;
  const targetWidth = 800;
  const targetHeight = 450;
  const [originX, originY] = scene.origin;
  const [targetX, targetY] = scene.target;
  const width = riseExpression(start, end, originWidth, targetWidth);
  const height = riseExpression(start, end, originHeight, targetHeight);
  const x = riseExpression(start, end, originX - originWidth / 2, targetX);
  const y = riseExpression(start, end, originY - originHeight / 2, targetY);
  const filter = [
    `[0:v]scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,setsar=1,eq=contrast=1.03:saturation=0.94:brightness=-0.01[base]`,
    `[1:v]format=rgba,fade=t=in:st=${start}:d=0.20:alpha=1,fade=t=out:st=${fadeOut}:d=0.28:alpha=1,scale=w='${width}':h='${height}':eval=frame[glass]`,
    `[base][glass]overlay=x='${x}':y='${y}':eval=frame:shortest=1[stage]`,
    `[stage]drawbox=x=${originX - 5}:y=${originY - 5}:w=10:h=10:color=c8a96a@0.9:t=fill:enable='between(t,${(start - 0.08).toFixed(2)},${(start + 0.62).toFixed(2)})',format=yuv420p[v]`,
  ].join(";");
  await run(ffmpeg, ["-y", ...THREAD_ARGS, "-stream_loop", "-1", "-i", sourceUrl, "-loop", "1", "-framerate", "24", "-i", panelPath, "-filter_complex", filter, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "19", "-r", "24", "-t", String(SCENE_DURATION), output]);
}

async function concatenate(ffmpeg, files, directory, output) {
  const list = path.join(directory, "business-loop-segments.txt");
  await fs.writeFile(list, files.map((file) => `file '${file.replaceAll("'", "'\\''")}'`).join("\n"));
  await run(ffmpeg, ["-y", ...THREAD_ARGS, "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", "-movflags", "+faststart", output]);
}

export const AvantiqoInvestorFilmBusinessLoopRuntime = {
  BUCKET, ORGANIZATION_ID, ENTITY_ID, OUTPUT_PATH, SCENES,
  async status() {
    const sourceReadiness = {};
    for (const [key, storagePath] of Object.entries(SOURCES)) sourceReadiness[key] = await storageExists(storagePath);
    return { ffmpeg_configured: Boolean(resolveCreativeFfmpegPath()), finished_business_loop_ready: await storageExists(OUTPUT_PATH), source_readiness: sourceReadiness, scene_count: SCENES.length, duration_seconds: Number((SCENES.length * SCENE_DURATION).toFixed(2)), vfx_language: "DEVICE_ORIGIN_TRANSPARENT_GLASS_RISE_V1", physical_device_remains_visible: true, interface_origin_policy: "Every Avantiqo glass layer begins at the physical device coordinate before rising toward the viewer.", flow: FLOW };
  },
  async downloadUrl(seconds = 86400) {
    if (!(await storageExists(OUTPUT_PATH))) return null;
    return signedUrl(OUTPUT_PATH, seconds);
  },
  async render() {
    const ffmpeg = resolveCreativeFfmpegPath();
    if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-business-loop-"));
    try {
      const sourceUrls = {};
      for (const [key, storagePath] of Object.entries(SOURCES)) { sourceUrls[key] = await signedUrl(storagePath, 3600); if (!sourceUrls[key]) throw new Error(`SOURCE_URL_MISSING:${key}`); }
      const segments = [];
      for (let index = 0; index < SCENES.length; index += 1) { const scene = SCENES[index]; const panel = await makePanelPng(directory, scene); const output = path.join(directory, `scene-${String(index + 1).padStart(2, "0")}-${scene.id}.mp4`); await renderGlassScene(ffmpeg, sourceUrls[scene.source], panel, scene, output); segments.push(output); }
      const final = path.join(directory, "avantiqo-business-loop-vfx-v1.mp4");
      await concatenate(ffmpeg, segments, directory, final);
      const uploaded = await upload(OUTPUT_PATH, final);
      return { success: true, duration_seconds: Number((SCENES.length * SCENE_DURATION).toFixed(2)), vfx_language: "DEVICE_ORIGIN_TRANSPARENT_GLASS_RISE_V1", screen_origin_calibration: "V1_PHYSICAL_DEVICE_COORDINATES", physical_device_remains_visible: true, scenes: SCENES.map((scene) => ({ id: scene.id, source: scene.source, origin: scene.origin, target: scene.target, current_flow_step: FLOW[scene.current] })), output: uploaded, signed_url: await signedUrl(OUTPUT_PATH, 86400) };
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
};
