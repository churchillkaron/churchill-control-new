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
const OUTPUT_PATH = `${OUTPUT_DIR}/avantiqo-investor-film-finished-v3-wow.mp4`;
const NARRATION_PATH = `${ORGANIZATION_ID}/avantiqo-investor-video-20260818/avantiqo-investor-narration-cedar-v2.mp3`;
const SCORE_PATH = `${ORGANIZATION_ID}/f6a567de-e4a7-4522-8c75-182a150402bc/14fb6dbf-c2ec-47af-974d-2cd0dbb479d3/14fb6dbf-c2ec-47af-974d-2cd0dbb479d3.mp3`;

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
});

const EDIT = Object.freeze([
  ["b01", 9.2], ["b08", 5.0], ["b09", 5.0], ["f01", 9.4],
  ["b02", 9.2], ["b15", 5.0], ["b19", 5.0], ["f02", 9.4],
  ["b03", 9.0], ["b18", 5.0], ["b04", 9.2], ["b05", 9.2],
  ["b06", 9.2], ["b07", 5.0], ["b20", 5.0], ["b08", 5.0],
  ["b11", 5.0], ["b12", 5.0], ["b10", 5.0], ["b13", 5.0],
  ["b14", 5.0], ["b16", 5.0], ["b17", 5.0], ["f03", 9.4],
  ["b15", 5.0], ["b14", 5.0], ["b09", 5.0], ["b18", 5.0],
  ["f04", 9.4], ["b10", 5.0], ["b13", 5.0], ["b07", 5.0],
  ["b19", 5.0], ["b20", 5.0], ["b16", 5.0], ["b17", 5.0],
  ["f05", 9.4],
]);

function run(command, args, timeoutMs = 290000) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "ignore", "pipe"] });
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("INVESTOR_FILM_RENDER_TIMEOUT"));
    }, timeoutMs);
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8").slice(-14000) || `FFMPEG_EXIT_${code}`));
        return;
      }
      resolve(Buffer.concat(stderr).toString("utf8"));
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
  const target = path.join(directory, "logo-1280x720.rgba");
  const buffer = await sharp(source)
    .resize({ width: 680, height: 390, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 165, bottom: 165, left: 300, right: 300, background: { r: 2, g: 2, b: 5, alpha: 1 } })
    .ensureAlpha()
    .raw()
    .toBuffer();
  await fs.writeFile(target, buffer);
  return target;
}

function productScreenSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="604" viewBox="0 0 1080 604">
  <defs>
    <linearGradient id="bg" x1="0" x2="1"><stop offset="0" stop-color="#030405"/><stop offset="1" stop-color="#090a0c"/></linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="150%"><feGaussianBlur stdDeviation="16"/></filter>
  </defs>
  <rect x="16" y="22" width="1048" height="566" rx="24" fill="#000" opacity="0.72" filter="url(#shadow)"/>
  <rect x="2" y="2" width="1076" height="596" rx="24" fill="url(#bg)" fill-opacity="0.94" stroke="#c8a96a" stroke-opacity="0.62" stroke-width="2"/>
  <text x="28" y="40" fill="#f5f5f5" font-family="Arial" font-size="24" font-weight="700" letter-spacing="2">AVANTIQO</text>
  <text x="28" y="58" fill="#777a7e" font-family="Arial" font-size="8" letter-spacing="4">SYNTHETIC INTELLIGENCE OS</text>
  <rect x="224" y="19" width="154" height="33" rx="16" fill="#090a0c" stroke="#292b30"/><text x="245" y="40" fill="#b5b5b8" font-family="Arial" font-size="11">Avantiqo Platform</text>
  <rect x="388" y="19" width="118" height="33" rx="16" fill="#090a0c" stroke="#292b30"/><text x="410" y="40" fill="#b5b5b8" font-family="Arial" font-size="11">Current Period</text>
  <rect x="520" y="19" width="390" height="33" rx="16" fill="#090a0c" stroke="#292b30"/><text x="543" y="40" fill="#686b70" font-family="Arial" font-size="11">Search anything...</text>
  <g fill="#9b9da1" font-family="Arial" font-size="9"><text x="28" y="91">HOME</text><text x="87" y="91">COMMERCIAL</text><text x="166" y="91">OPERATIONS</text><text x="244" y="91">SUPPLY CHAIN</text><text x="329" y="91">FINANCE</text><text x="383" y="91">PEOPLE</text><text x="430" y="91">PROJECTS</text><text x="491" y="91">COMPLIANCE</text><text x="568" y="91">DOCUMENTS</text><text x="640" y="91">ANALYTICS</text><text x="705" y="91">SERVICES</text><text x="765" y="91">ADMINISTRATION</text></g>
  <line x1="0" y1="108" x2="1080" y2="108" stroke="#1c1e22"/>
  <rect x="40" y="145" width="486" height="95" rx="20" fill="#07080a" stroke="#292b30"/><text x="60" y="183" fill="#f6f6f6" font-family="Arial" font-size="23">Good Afternoon, User</text><text x="60" y="211" fill="#85888d" font-family="Arial" font-size="12">Waiting for live operational data...</text>
  <rect x="40" y="258" width="486" height="169" rx="20" fill="#07080a" stroke="#292b30"/><text x="60" y="289" fill="#96999f" font-family="Arial" font-size="11" letter-spacing="3">LIVE BUSINESS STATE</text><g fill="#c7c8ca" font-family="Arial" font-size="12"><text x="60" y="326">Revenue: —</text><text x="60" y="353">Orders: —</text><text x="60" y="380">Inventory Alerts: —</text><text x="60" y="407">Pending Approvals: —</text></g>
  <rect x="40" y="445" width="486" height="104" rx="20" fill="#07080a" stroke="#292b30"/><text x="60" y="478" fill="#96999f" font-family="Arial" font-size="11" letter-spacing="3">PRIORITY SIGNALS</text><text x="60" y="510" fill="#777b80" font-family="Arial" font-size="12">No active alerts</text>
  <rect x="545" y="145" width="495" height="404" rx="20" fill="#07080a" stroke="#292b30"/><text x="568" y="180" fill="#c8a96a" font-family="Arial" font-size="11" font-weight="700" letter-spacing="3">COMPANY INTELLIGENCE</text><text x="568" y="222" fill="#f6f6f6" font-family="Arial" font-size="27">Organization intelligence</text><text x="568" y="251" fill="#95979c" font-family="Arial" font-size="12">Talk with Avantiqo about the business, open a workspace,</text><text x="568" y="270" fill="#95979c" font-family="Arial" font-size="12">prepare work or execute connected capabilities.</text>
  <rect x="568" y="302" width="449" height="70" rx="13" fill="#050607" stroke="#26282c"/><text x="588" y="330" fill="#c7c8ca" font-family="Arial" font-size="12">I'm Avantiqo. Ask me about this organization,</text><text x="588" y="351" fill="#c7c8ca" font-family="Arial" font-size="12">tell me what to open, or tell me what you need done.</text>
  <line x1="568" y1="472" x2="1018" y2="472" stroke="#1f2125"/>
  <rect x="568" y="490" width="449" height="46" rx="13" fill="#050607" stroke="#26282c"/><text x="588" y="518" fill="#696c71" font-family="Arial" font-size="12">Ask Avantiqo anything...</text><rect x="925" y="497" width="82" height="32" rx="10" fill="#c8a96a"/><text x="951" y="518" fill="#090909" font-family="Arial" font-size="11" font-weight="700">SEND</text>
  <rect x="817" y="558" width="223" height="29" rx="15" fill="#07130f" stroke="#1c8a64"/><text x="851" y="577" fill="#72d9b2" font-family="Arial" font-size="10" font-weight="700" letter-spacing="2">HEY AVANTIQO · LISTENING</text>
</svg>`);
}

function businessSystemMapSvg() {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <defs>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <linearGradient id="line" x1="0" x2="1"><stop offset="0" stop-color="#c8a96a" stop-opacity="0.18"/><stop offset="0.5" stop-color="#e6cf98" stop-opacity="0.88"/><stop offset="1" stop-color="#c8a96a" stop-opacity="0.18"/></linearGradient>
  </defs>
  <g fill="none" stroke="url(#line)" stroke-width="1.6" opacity="0.9" filter="url(#glow)">
    <path d="M274 187 C380 187 430 250 510 300"/><path d="M274 294 C390 294 438 318 510 336"/><path d="M274 401 C395 401 440 374 510 360"/><path d="M274 508 C395 508 438 428 510 390"/>
    <path d="M1006 187 C900 187 850 250 770 300"/><path d="M1006 294 C890 294 842 318 770 336"/><path d="M1006 401 C885 401 840 374 770 360"/><path d="M1006 508 C885 508 842 428 770 390"/>
  </g>
  <g font-family="Arial">
    <rect x="54" y="145" width="220" height="78" rx="18" fill="#050607" fill-opacity="0.88" stroke="#c8a96a" stroke-opacity="0.46"/><text x="76" y="176" fill="#c8a96a" font-size="10" font-weight="700" letter-spacing="2">COMMERCIAL</text><text x="76" y="200" fill="#f1f1f2" font-size="14">Customers · Growth</text>
    <rect x="54" y="252" width="220" height="78" rx="18" fill="#050607" fill-opacity="0.88" stroke="#c8a96a" stroke-opacity="0.46"/><text x="76" y="283" fill="#c8a96a" font-size="10" font-weight="700" letter-spacing="2">OPERATIONS</text><text x="76" y="307" fill="#f1f1f2" font-size="14">Orders · Dispatch · Jobs</text>
    <rect x="54" y="359" width="220" height="78" rx="18" fill="#050607" fill-opacity="0.88" stroke="#c8a96a" stroke-opacity="0.46"/><text x="76" y="390" fill="#c8a96a" font-size="10" font-weight="700" letter-spacing="2">SUPPLY CHAIN</text><text x="76" y="414" fill="#f1f1f2" font-size="14">Buy · Receive · Stock</text>
    <rect x="54" y="466" width="220" height="78" rx="18" fill="#050607" fill-opacity="0.88" stroke="#c8a96a" stroke-opacity="0.46"/><text x="76" y="497" fill="#c8a96a" font-size="10" font-weight="700" letter-spacing="2">PEOPLE</text><text x="76" y="521" fill="#f1f1f2" font-size="14">Roles · Work · Payroll</text>
    <rect x="1006" y="145" width="220" height="78" rx="18" fill="#050607" fill-opacity="0.88" stroke="#c8a96a" stroke-opacity="0.46"/><text x="1028" y="176" fill="#c8a96a" font-size="10" font-weight="700" letter-spacing="2">FINANCE</text><text x="1028" y="200" fill="#f1f1f2" font-size="14">Invoice · Ledger · Close</text>
    <rect x="1006" y="252" width="220" height="78" rx="18" fill="#050607" fill-opacity="0.88" stroke="#c8a96a" stroke-opacity="0.46"/><text x="1028" y="283" fill="#c8a96a" font-size="10" font-weight="700" letter-spacing="2">COMPLIANCE</text><text x="1028" y="307" fill="#f1f1f2" font-size="14">Obligations · Evidence</text>
    <rect x="1006" y="359" width="220" height="78" rx="18" fill="#050607" fill-opacity="0.88" stroke="#c8a96a" stroke-opacity="0.46"/><text x="1028" y="390" fill="#c8a96a" font-size="10" font-weight="700" letter-spacing="2">DOCUMENTS</text><text x="1028" y="414" fill="#f1f1f2" font-size="14">Context · Records · Proof</text>
    <rect x="1006" y="466" width="220" height="78" rx="18" fill="#050607" fill-opacity="0.88" stroke="#c8a96a" stroke-opacity="0.46"/><text x="1028" y="497" fill="#c8a96a" font-size="10" font-weight="700" letter-spacing="2">ANALYTICS</text><text x="1028" y="521" fill="#f1f1f2" font-size="14">Signals · Decisions</text>
    <rect x="462" y="235" width="356" height="204" rx="28" fill="#030405" fill-opacity="0.9" stroke="#e0c98f" stroke-opacity="0.72" stroke-width="2" filter="url(#glow)"/><text x="640" y="285" fill="#c8a96a" font-size="11" font-weight="700" letter-spacing="3" text-anchor="middle">ORGANIZATION CONTEXT</text><text x="640" y="330" fill="#ffffff" font-size="29" font-weight="700" text-anchor="middle">ONE BUSINESS</text><text x="640" y="359" fill="#d0d1d4" font-size="15" text-anchor="middle">entities · locations · roles · customers</text><text x="640" y="383" fill="#d0d1d4" font-size="15" text-anchor="middle">suppliers · permissions · history</text><text x="640" y="419" fill="#75dbb4" font-size="12" font-weight="700" letter-spacing="2" text-anchor="middle">AI EXECUTION LAYER</text>
    <text x="640" y="604" fill="#d7d8da" font-size="13" text-anchor="middle" letter-spacing="2">CUSTOMER REQUEST  →  SERVICE ORDER  →  DISPATCH  →  PROOF  →  INVOICE  →  LEDGER</text>
    <text x="640" y="654" fill="#c8a96a" font-size="15" font-weight="700" text-anchor="middle" letter-spacing="4">ONE COMPANY · ONE CONTEXT · ONE INTELLIGENCE LAYER</text>
  </g>
</svg>`);
}

async function makeRawSvg(directory, name, svg, width, height) {
  const target = path.join(directory, `${name}.rgba`);
  const buffer = await sharp(svg).ensureAlpha().raw().toBuffer();
  const metadata = await sharp(svg).metadata();
  if (metadata.width !== width || metadata.height !== height) {
    throw new Error(`${name.toUpperCase()}_SIZE_MISMATCH`);
  }
  await fs.writeFile(target, buffer);
  return target;
}

async function renderLogoClip(ffmpeg, logoRaw, output, duration, closing = false) {
  const filters = [
    `[0:v]tpad=stop_mode=clone:stop_duration=${duration},setpts=PTS-STARTPTS,format=rgba,zoompan=z='min(zoom+0.00025,1.035)':d=1:s=1280x720:fps=24,fade=t=in:st=${closing ? 0.1 : 0.25}:d=0.75,fade=t=out:st=${Math.max(0, duration - 0.65)}:d=0.6,format=yuv420p[v]`,
  ];
  await run(ffmpeg, [
    "-y", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "1280x720", "-framerate", "24", "-i", logoRaw,
    "-filter_complex", filters.join(";"), "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-t", String(duration), output,
  ]);
}

async function renderScreenRise(ffmpeg, basePath, screenRaw, mapRaw, output) {
  const filter = [
    "[0:v]trim=duration=9,setpts=PTS-STARTPTS,scale=1280:720,fps=24,setsar=1,eq=brightness=-0.025:saturation=0.88[base]",
    "[1:v]tpad=stop_mode=clone:stop_duration=9,setpts=PTS-STARTPTS,scale=760:425,format=rgba,fade=t=in:st=2.05:d=0.42:alpha=1,fade=t=out:st=8.55:d=0.35:alpha=1[screen]",
    "[2:v]tpad=stop_mode=clone:stop_duration=9,setpts=PTS-STARTPTS,format=rgba,fade=t=in:st=4.35:d=0.65:alpha=1,fade=t=out:st=8.55:d=0.35:alpha=1[map]",
    "[base][screen]overlay=x='(W-w)/2':y='if(lt(t,2.25),720,if(lt(t,4.05),720-(720-118)*(t-2.25)/1.8,118))':eval=frame:format=auto[stage]",
    "[stage][map]overlay=x=0:y=0:eval=frame:format=auto,format=yuv420p[v]",
  ].join(";");
  await run(ffmpeg, [
    "-y", "-i", basePath,
    "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "1080x604", "-framerate", "24", "-i", screenRaw,
    "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "1280x720", "-framerate", "24", "-i", mapRaw,
    "-filter_complex", filter, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p", "-t", "9", output,
  ]);
}

function fitEditToNarration(duration) {
  const result = [];
  let used = 0;
  for (const [key, requested] of EDIT) {
    if (used >= duration - 0.02) break;
    const remaining = duration - used;
    const actual = Math.min(requested, remaining);
    if (actual > 0.2) result.push({ key, duration: actual });
    used += actual;
  }
  return result;
}

export const AvantiqoInvestorFilmFinishedRuntime = {
  OUTPUT_PATH,

  async status() {
    return {
      ffmpeg_configured: Boolean(resolveCreativeFfmpegPath()),
      narration_ready: await storageExists(NARRATION_PATH),
      score_ready: await storageExists(SCORE_PATH),
      finished_video_ready: await storageExists(OUTPUT_PATH),
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

    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "avantiqo-investor-finished-"));
    try {
      const narration = path.join(directory, "narration.mp3");
      const score = path.join(directory, "score.mp3");
      await download(NARRATION_PATH, narration);
      await download(SCORE_PATH, score);
      const narrationDuration = await mediaDuration(ffmpeg, narration);

      const edit = fitEditToNarration(narrationDuration);
      const keys = [...new Set(edit.map((item) => item.key))];
      const local = new Map();
      for (const key of keys) {
        const target = path.join(directory, `${key}.mp4`);
        await download(SOURCES[key], target);
        local.set(key, target);
      }

      const logoRaw = await makeLogoRaw(directory);
      const screenRaw = await makeRawSvg(directory, "product-screen", productScreenSvg(), 1080, 604);
      const mapRaw = await makeRawSvg(directory, "business-system-map", businessSystemMapSvg(), 1280, 720);
      const intro = path.join(directory, "intro.mp4");
      const outro = path.join(directory, "outro.mp4");
      await renderLogoClip(ffmpeg, logoRaw, intro, 4.5, false);
      await renderLogoClip(ffmpeg, logoRaw, outro, 5.0, true);

      const screenRise = path.join(directory, "screen-rise.mp4");
      await renderScreenRise(ffmpeg, local.get("b03"), screenRaw, mapRaw, screenRise);
      local.set("b03", screenRise);

      const videoSegments = [
        { path: intro, duration: 4.5 },
        ...edit.map((item) => ({ path: local.get(item.key), duration: item.duration })),
        { path: outro, duration: 5.0 },
      ];

      const args = ["-y"];
      for (const item of videoSegments) args.push("-i", item.path);
      const narrationIndex = videoSegments.length;
      args.push("-i", narration);
      const scoreIndex = narrationIndex + 1;
      args.push("-stream_loop", "-1", "-i", score);

      const filters = [];
      const labels = [];
      videoSegments.forEach((item, index) => {
        filters.push(`[${index}:v]trim=duration=${item.duration.toFixed(3)},setpts=PTS-STARTPTS,scale=1280:720,fps=24,setsar=1,eq=contrast=1.025:saturation=0.96:brightness=-0.004,format=yuv420p[v${index}]`);
        labels.push(`[v${index}]`);
      });
      const totalDuration = 4.5 + narrationDuration + 5.0;
      filters.push(`${labels.join("")}concat=n=${videoSegments.length}:v=1:a=0,fade=t=out:st=${Math.max(0, totalDuration - 0.65).toFixed(3)}:d=0.6[vout]`);
      filters.push(`[${narrationIndex}:a]adelay=4500:all=1,volume=1.0,aresample=48000,apad=pad_dur=6[voice]`);
      filters.push(`[${scoreIndex}:a]volume=0.075,afade=t=in:st=0:d=2.5,afade=t=out:st=${Math.max(0, totalDuration - 4).toFixed(3)}:d=3.5,atrim=duration=${totalDuration.toFixed(3)},aresample=48000[music]`);
      filters.push(`[voice][music]amix=inputs=2:duration=longest:dropout_transition=2,atrim=duration=${totalDuration.toFixed(3)},alimiter=limit=0.94[aout]`);

      const output = path.join(directory, "avantiqo-investor-film-finished-v3-wow.mp4");
      await run(ffmpeg, [
        ...args,
        "-filter_complex", filters.join(";"),
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "18",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart",
        "-t", totalDuration.toFixed(3), output,
      ], 290000);

      const uploaded = await upload(OUTPUT_PATH, output);
      return {
        success: true,
        duration_seconds: Number(totalDuration.toFixed(3)),
        narration_duration_seconds: Number(narrationDuration.toFixed(3)),
        score_applied: true,
        review_master_quality: "H264_CRF18_AAC160K",
        screen_rise_applied: true,
        screen_rise_source: "ORGANIZATION_INTELLIGENCE_CONNECTED_BUSINESS_REVEAL_V1",
        screen_story: "DEVICE_TO_ORGANIZATION_INTELLIGENCE_TO_CONNECTED_DOMAINS_TO_END_TO_END_WORKFLOW",
        output: uploaded,
        signed_url: await signedUrl(OUTPUT_PATH, 86400),
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
};
