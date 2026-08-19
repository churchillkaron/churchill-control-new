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
const OUTPUT_PATH = `${OUTPUT_DIR}/avantiqo-investor-film-v4-identity-safe-review.mp4`;
const NARRATION_PATH = `${ORGANIZATION_ID}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v2.mp3`;
const SCORE_PATH = `${ORGANIZATION_ID}/f6a567de-e4a7-4522-8c75-182a150402bc/14fb6dbf-c2ec-47af-974d-2cd0dbb479d3/14fb6dbf-c2ec-47af-974d-2cd0dbb479d3.mp3`;
const FOUNDER_REFERENCE_PATH = `${ORGANIZATION_ID}/unassigned/ca19f771-e2ad-4e62-ac50-19ff8efed996-avantiqo-founder-speaking-keyframe.jpg`;

const SOURCES = Object.freeze({
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
});

const EDIT = Object.freeze([
  ["b01", 9.2], ["b08", 5], ["b09", 5], ["founder01", 9.4],
  ["b02", 9.2], ["b15", 5], ["b19", 5], ["founder02", 9.4],
  ["b03", 9], ["b18", 5], ["b04", 9.2], ["b05", 9.2], ["b06", 9.2],
  ["b07", 5], ["b20", 5], ["b08", 5], ["b11", 5], ["b12", 5], ["b10", 5],
  ["b13", 5], ["b14", 5], ["b16", 5], ["b17", 5], ["founder03", 9.4],
  ["b15", 5], ["b14", 5], ["b09", 5], ["b18", 5], ["founder04", 9.4],
  ["b10", 5], ["b13", 5], ["b07", 5], ["b19", 5], ["b20", 5], ["b16", 5],
  ["b17", 5], ["founder05", 9.4],
]);

const FILLER = Object.freeze(["b07", "b08", "b09", "b10", "b14", "b15", "b18", "b19", "b20"]);

function run(command, args, timeoutMs = 290000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"] });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("INVESTOR_FILM_RENDER_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-14000) || `FFMPEG_EXIT_${code}`));
      else resolve(Buffer.concat(stderr).toString("utf8"));
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

async function download(storagePath, targetPath) {
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error) throw error;
  await fs.writeFile(targetPath, Buffer.from(await data.arrayBuffer()));
}

async function upload(storagePath, localPath) {
  const bytes = await fs.readFile(localPath);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: "video/mp4", upsert: true, cacheControl: "3600",
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
    const child = spawn(ffmpeg, ["-hide_banner", "-i", localPath], { shell: false, stdio: ["ignore", "ignore", "pipe"] });
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

async function signedUrl(storagePath, seconds = 86400) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, seconds);
  if (error) throw error;
  return data?.signedUrl || null;
}

async function makeLogoRaw(directory) {
  const source = path.join(process.cwd(), "public", "branding", "avantiqo-logo.png");
  const target = path.join(directory, "logo.rgba");
  const buffer = await sharp(source)
    .resize({ width: 680, height: 390, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 165, bottom: 165, left: 300, right: 300, background: { r: 2, g: 2, b: 5, alpha: 1 } })
    .ensureAlpha().raw().toBuffer();
  await fs.writeFile(target, buffer);
  return target;
}

function productScreenSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="604"><rect width="1080" height="604" rx="24" fill="#050607" stroke="#c8a96a" stroke-opacity=".62" stroke-width="2"/><text x="28" y="42" fill="#fff" font-family="Arial" font-size="24" font-weight="700">AVANTIQO</text><text x="28" y="61" fill="#777" font-family="Arial" font-size="9">SYNTHETIC INTELLIGENCE OS</text><g fill="#999" font-family="Arial" font-size="10"><text x="28" y="92">HOME</text><text x="86" y="92">COMMERCIAL</text><text x="170" y="92">OPERATIONS</text><text x="252" y="92">SUPPLY CHAIN</text><text x="345" y="92">FINANCE</text><text x="405" y="92">PEOPLE</text><text x="458" y="92">COMPLIANCE</text><text x="542" y="92">DOCUMENTS</text><text x="625" y="92">ANALYTICS</text></g><rect x="40" y="140" width="485" height="110" rx="20" fill="#090a0c" stroke="#2b2d31"/><text x="64" y="185" fill="#fff" font-family="Arial" font-size="25">Good Afternoon</text><text x="64" y="214" fill="#888" font-family="Arial" font-size="13">One operating context across the company.</text><rect x="40" y="270" width="485" height="280" rx="20" fill="#090a0c" stroke="#2b2d31"/><text x="64" y="306" fill="#aaa" font-family="Arial" font-size="12">LIVE BUSINESS STATE</text><g fill="#ddd" font-family="Arial" font-size="14"><text x="64" y="350">Revenue</text><text x="64" y="388">Orders</text><text x="64" y="426">Inventory Alerts</text><text x="64" y="464">Pending Approvals</text></g><g fill="#c8a96a" font-family="Arial" font-size="12" font-weight="700"><text x="384" y="350">CONNECTED</text><text x="384" y="388">CONNECTED</text><text x="384" y="426">CONNECTED</text><text x="384" y="464">CONNECTED</text></g><rect x="545" y="140" width="495" height="410" rx="20" fill="#090a0c" stroke="#2b2d31"/><text x="570" y="180" fill="#c8a96a" font-family="Arial" font-size="12" font-weight="700">COMPANY INTELLIGENCE</text><text x="570" y="228" fill="#fff" font-family="Arial" font-size="30">Organization intelligence</text><text x="570" y="263" fill="#999" font-family="Arial" font-size="13">Open a workspace, prepare work or execute</text><text x="570" y="284" fill="#999" font-family="Arial" font-size="13">connected capabilities across the business.</text><rect x="570" y="322" width="445" height="80" rx="14" fill="#050607" stroke="#26282c"/><text x="592" y="354" fill="#ddd" font-family="Arial" font-size="13">I'm Avantiqo. Ask me about this organization.</text><text x="592" y="379" fill="#888" font-family="Arial" font-size="12">Tell me what to open, prepare or execute.</text><rect x="570" y="478" width="445" height="48" rx="14" fill="#050607" stroke="#26282c"/><text x="592" y="508" fill="#777" font-family="Arial" font-size="13">Ask Avantiqo anything...</text><rect x="925" y="486" width="78" height="32" rx="10" fill="#c8a96a"/><text x="949" y="508" fill="#080808" font-family="Arial" font-size="11" font-weight="700">SEND</text></svg>`);
}

function businessSystemMapSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><g fill="none" stroke="#c8a96a" stroke-opacity=".72" stroke-width="1.5"><path d="M274 187 C390 187 430 260 510 300"/><path d="M274 294 C390 294 440 320 510 338"/><path d="M274 401 C390 401 440 380 510 360"/><path d="M274 508 C390 508 440 430 510 390"/><path d="M1006 187 C890 187 850 260 770 300"/><path d="M1006 294 C890 294 840 320 770 338"/><path d="M1006 401 C890 401 840 380 770 360"/><path d="M1006 508 C890 508 840 430 770 390"/></g><g font-family="Arial"><g fill="#050607" stroke="#c8a96a" stroke-opacity=".5"><rect x="54" y="145" width="220" height="78" rx="18"/><rect x="54" y="252" width="220" height="78" rx="18"/><rect x="54" y="359" width="220" height="78" rx="18"/><rect x="54" y="466" width="220" height="78" rx="18"/><rect x="1006" y="145" width="220" height="78" rx="18"/><rect x="1006" y="252" width="220" height="78" rx="18"/><rect x="1006" y="359" width="220" height="78" rx="18"/><rect x="1006" y="466" width="220" height="78" rx="18"/></g><g fill="#c8a96a" font-size="11" font-weight="700"><text x="76" y="178">COMMERCIAL</text><text x="76" y="285">OPERATIONS</text><text x="76" y="392">SUPPLY CHAIN</text><text x="76" y="499">PEOPLE</text><text x="1028" y="178">FINANCE</text><text x="1028" y="285">COMPLIANCE</text><text x="1028" y="392">DOCUMENTS</text><text x="1028" y="499">ANALYTICS</text></g><g fill="#f1f1f2" font-size="14"><text x="76" y="204">Customers · Growth</text><text x="76" y="311">Orders · Dispatch · Jobs</text><text x="76" y="418">Buy · Receive · Stock</text><text x="76" y="525">Roles · Work · Payroll</text><text x="1028" y="204">Invoice · Ledger · Close</text><text x="1028" y="311">Obligations · Evidence</text><text x="1028" y="418">Context · Records · Proof</text><text x="1028" y="525">Signals · Decisions</text></g><rect x="462" y="235" width="356" height="204" rx="28" fill="#030405" stroke="#e0c98f" stroke-opacity=".75" stroke-width="2"/><text x="640" y="285" fill="#c8a96a" font-size="12" font-weight="700" text-anchor="middle">ORGANIZATION CONTEXT</text><text x="640" y="332" fill="#fff" font-size="30" font-weight="700" text-anchor="middle">ONE BUSINESS</text><text x="640" y="366" fill="#d0d1d4" font-size="15" text-anchor="middle">entities · locations · roles · customers</text><text x="640" y="390" fill="#d0d1d4" font-size="15" text-anchor="middle">suppliers · permissions · history</text><text x="640" y="420" fill="#75dbb4" font-size="12" font-weight="700" text-anchor="middle">AI EXECUTION LAYER</text><text x="640" y="604" fill="#ddd" font-size="13" text-anchor="middle">CUSTOMER REQUEST → SERVICE ORDER → DISPATCH → PROOF → INVOICE → LEDGER</text><text x="640" y="654" fill="#c8a96a" font-size="16" font-weight="700" text-anchor="middle">ONE COMPANY · ONE CONTEXT · ONE INTELLIGENCE LAYER</text></g></svg>`);
}

async function makeRawSvg(directory, name, svg, width, height) {
  const target = path.join(directory, `${name}.rgba`);
  const metadata = await sharp(svg).metadata();
  if (metadata.width !== width || metadata.height !== height) throw new Error(`${name.toUpperCase()}_SIZE_MISMATCH`);
  await fs.writeFile(target, await sharp(svg).ensureAlpha().raw().toBuffer());
  return target;
}

async function renderLogoClip(ffmpeg, logoRaw, output, duration) {
  await run(ffmpeg, ["-y", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "1280x720", "-framerate", "24", "-i", logoRaw, "-vf", `tpad=stop_mode=clone:stop_duration=${duration},zoompan=z='min(zoom+0.00025,1.035)':d=1:s=1280x720:fps=24,fade=t=in:st=.2:d=.75,fade=t=out:st=${Math.max(0, duration - .65)}:d=.6,format=yuv420p`, "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-t", String(duration), output]);
}

async function renderFounderPlate(ffmpeg, founderImage, output, duration, variant) {
  const inc = [0.000055, 0.00004, 0.000065, 0.000045, 0.00006][variant] || 0.00005;
  await run(ffmpeg, ["-y", "-loop", "1", "-framerate", "24", "-i", founderImage, "-vf", `scale=1360:765:force_original_aspect_ratio=increase,crop=1280:720,zoompan=z='min(zoom+${inc},1.04)':d=1:s=1280x720:fps=24,eq=contrast=1.02:saturation=.97,format=yuv420p`, "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-t", String(duration), output]);
}

async function renderScreenRise(ffmpeg, basePath, screenRaw, mapRaw, output) {
  const filter = [
    "[0:v]trim=duration=9,setpts=PTS-STARTPTS,scale=1280:720,fps=24,setsar=1,eq=brightness=-.025:saturation=.88[base]",
    "[1:v]tpad=stop_mode=clone:stop_duration=9,setpts=PTS-STARTPTS,scale=760:425,format=rgba,fade=t=in:st=2.05:d=.42:alpha=1,fade=t=out:st=8.55:d=.35:alpha=1[screen]",
    "[2:v]tpad=stop_mode=clone:stop_duration=9,setpts=PTS-STARTPTS,format=rgba,fade=t=in:st=4.35:d=.65:alpha=1,fade=t=out:st=8.55:d=.35:alpha=1[map]",
    "[base][screen]overlay=x='(W-w)/2':y='if(lt(t,2.25),720,if(lt(t,4.05),720-(720-118)*(t-2.25)/1.8,118))':eval=frame[stage]",
    "[stage][map]overlay=0:0:eval=frame,format=yuv420p[v]",
  ].join(";");
  await run(ffmpeg, ["-y", "-i", basePath, "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "1080x604", "-framerate", "24", "-i", screenRaw, "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "1280x720", "-framerate", "24", "-i", mapRaw, "-filter_complex", filter, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "18", "-t", "9", output]);
}

function fitEditToNarration(duration) {
  const close = EDIT.at(-1);
  const body = EDIT.slice(0, -1);
  const targetBeforeClose = Math.max(0, duration - close[1]);
  const result = [];
  let used = 0;
  for (const [key, requested] of body) {
    if (used >= targetBeforeClose - 0.02) break;
    const actual = Math.min(requested, targetBeforeClose - used);
    if (actual > 0.2) result.push({ key, duration: actual });
    used += actual;
  }
  let fillerIndex = 0;
  while (used < targetBeforeClose - 0.02) {
    const actual = Math.min(5, targetBeforeClose - used);
    result.push({ key: FILLER[fillerIndex % FILLER.length], duration: actual });
    used += actual;
    fillerIndex += 1;
  }
  if (duration - used > 0.2) result.push({ key: close[0], duration: Math.min(close[1], duration - used) });
  return result;
}

async function renderChunk(ffmpeg, items, output) {
  const args = ["-y"];
  items.forEach((item) => args.push("-i", item.path));
  const filters = [];
  const labels = [];
  items.forEach((item, index) => {
    filters.push(`[${index}:v]trim=duration=${item.duration.toFixed(3)},setpts=PTS-STARTPTS,scale=1280:720:force_original_aspect_ratio=increase,crop=1280:720,fps=24,setsar=1,eq=contrast=1.02:saturation=.97,format=yuv420p[v${index}]`);
    labels.push(`[v${index}]`);
  });
  filters.push(`${labels.join("")}concat=n=${items.length}:v=1:a=0[vout]`);
  await run(ffmpeg, [...args, "-filter_complex", filters.join(";"), "-map", "[vout]", "-an", "-c:v", "libx264", "-preset", "ultrafast", "-crf", "19", "-pix_fmt", "yuv420p", output]);
}

async function concatenateChunks(ffmpeg, chunks, output, directory) {
  const listPath = path.join(directory, "chunks.txt");
  await fs.writeFile(listPath, chunks.map((item) => `file '${item.replaceAll("'", "'\\''")}'`).join("\n"));
  await run(ffmpeg, ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-movflags", "+faststart", output]);
}

export const AvantiqoInvestorFilmFinishedRuntime = {
  OUTPUT_PATH,

  async status() {
    return {
      ffmpeg_configured: Boolean(resolveCreativeFfmpegPath()),
      narration_ready: await storageExists(NARRATION_PATH),
      score_ready: await storageExists(SCORE_PATH),
      founder_reference_ready: await storageExists(FOUNDER_REFERENCE_PATH),
      finished_video_ready: await storageExists(OUTPUT_PATH),
      wrong_founder_clips_excluded: true,
      founder_identity_policy: "APPROVED_REFERENCE_ONLY_UNTIL_VALIDATED_LIPSYNC",
      lip_sync_applied: false,
      render_strategy: "MEMORY_SAFE_CHUNKED_FFMPEG_V1",
      screen_rise_ready: true,
      screen_rise_source: "ORGANIZATION_INTELLIGENCE_CONNECTED_BUSINESS_REVEAL_V1",
      source_count: Object.keys(SOURCES).length,
      entity_id: ENTITY_ID,
    };
  },

  async downloadUrl(seconds = 86400) {
    if (!(await storageExists(OUTPUT_PATH))) return null;
    return signedUrl(OUTPUT_PATH, seconds);
  },

  async render() {
    const ffmpeg = resolveCreativeFfmpegPath();
    if (!ffmpeg) throw new Error("CREATIVE_MEDIA_FFMPEG_NOT_READY");

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-investor-safe-"));
    try {
      const narration = path.join(directory, "narration.mp3");
      const score = path.join(directory, "score.mp3");
      const founderImage = path.join(directory, "founder.jpg");
      await download(NARRATION_PATH, narration);
      await download(SCORE_PATH, score);
      await download(FOUNDER_REFERENCE_PATH, founderImage);
      const narrationDuration = await mediaDuration(ffmpeg, narration);
      const edit = fitEditToNarration(narrationDuration);

      const local = new Map();
      const businessKeys = [...new Set(edit.map((item) => item.key).filter((key) => SOURCES[key]))];
      for (const key of businessKeys) {
        const target = path.join(directory, `${key}.mp4`);
        await download(SOURCES[key], target);
        local.set(key, target);
      }

      for (let index = 0; index < 5; index += 1) {
        const key = `founder0${index + 1}`;
        const target = path.join(directory, `${key}.mp4`);
        await renderFounderPlate(ffmpeg, founderImage, target, 9.4, index);
        local.set(key, target);
      }

      const logoRaw = await makeLogoRaw(directory);
      const screenRaw = await makeRawSvg(directory, "screen", productScreenSvg(), 1080, 604);
      const mapRaw = await makeRawSvg(directory, "map", businessSystemMapSvg(), 1280, 720);
      const intro = path.join(directory, "intro.mp4");
      const outro = path.join(directory, "outro.mp4");
      await renderLogoClip(ffmpeg, logoRaw, intro, 4.5);
      await renderLogoClip(ffmpeg, logoRaw, outro, 5);

      const screenRise = path.join(directory, "screen-rise.mp4");
      await renderScreenRise(ffmpeg, local.get("b03"), screenRaw, mapRaw, screenRise);
      local.set("b03", screenRise);

      const segments = [
        { path: intro, duration: 4.5 },
        ...edit.map((item) => ({ path: local.get(item.key), duration: item.duration })),
        { path: outro, duration: 5 },
      ];

      const chunkFiles = [];
      for (let index = 0; index < segments.length; index += 5) {
        const output = path.join(directory, `chunk-${String(chunkFiles.length).padStart(2, "0")}.mp4`);
        await renderChunk(ffmpeg, segments.slice(index, index + 5), output);
        chunkFiles.push(output);
      }

      const videoOnly = path.join(directory, "video-only.mp4");
      await concatenateChunks(ffmpeg, chunkFiles, videoOnly, directory);

      const totalDuration = 4.5 + narrationDuration + 5;
      const audioOnly = path.join(directory, "audio.m4a");
      const audioFilter = `[0:a]adelay=4500:all=1,volume=1,aresample=48000,apad=pad_dur=6[voice];[1:a]volume=.075,afade=t=in:st=0:d=2.5,afade=t=out:st=${Math.max(0, totalDuration - 4).toFixed(3)}:d=3.5,atrim=duration=${totalDuration.toFixed(3)},aresample=48000[music];[voice][music]amix=inputs=2:duration=longest:dropout_transition=2,atrim=duration=${totalDuration.toFixed(3)},alimiter=limit=.94[aout]`;
      await run(ffmpeg, ["-y", "-i", narration, "-stream_loop", "-1", "-i", score, "-filter_complex", audioFilter, "-map", "[aout]", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-t", totalDuration.toFixed(3), audioOnly]);

      const output = path.join(directory, "final.mp4");
      await run(ffmpeg, ["-y", "-i", videoOnly, "-i", audioOnly, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "copy", "-movflags", "+faststart", "-shortest", output]);

      const uploaded = await upload(OUTPUT_PATH, output);
      return {
        success: true,
        duration_seconds: Number(totalDuration.toFixed(3)),
        narration_duration_seconds: Number(narrationDuration.toFixed(3)),
        wrong_founder_clips_excluded: true,
        founder_source: "APPROVED_FOUNDER_REFERENCE_ONLY",
        founder_motion: "DETERMINISTIC_CAMERA_MOTION_NO_IDENTITY_REGENERATION",
        lip_sync_applied: false,
        review_master_quality: "H264_CRF19_CHUNKED_AAC160K",
        screen_rise_applied: true,
        render_strategy: "MEMORY_SAFE_CHUNKED_FFMPEG_V1",
        output: uploaded,
        signed_url: await signedUrl(OUTPUT_PATH, 86400),
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
};
