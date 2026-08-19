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
const OUTPUT_PATH = `${OUTPUT_DIR}/avantiqo-investor-film-finished-v2.mp4`;
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
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1120" height="620" viewBox="0 0 1120 620">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#08090c"/><stop offset="1" stop-color="#0e0f12"/></linearGradient></defs>
  <rect width="1120" height="620" rx="30" fill="url(#g)" fill-opacity="0.92" stroke="#c7a45b" stroke-opacity="0.55" stroke-width="2"/>
  <text x="34" y="43" fill="#f5f5f5" font-family="Arial" font-size="27" font-weight="700" letter-spacing="2">AVANTIQO</text>
  <text x="34" y="64" fill="#777" font-family="Arial" font-size="9" letter-spacing="4">SYNTHETIC INTELLIGENCE OS</text>
  <g fill="#aaa" font-family="Arial" font-size="11"><text x="34" y="103">HOME</text><text x="105" y="103">COMMERCIAL</text><text x="205" y="103">OPERATIONS</text><text x="296" y="103">SUPPLY CHAIN</text><text x="402" y="103">FINANCE</text><text x="462" y="103">PEOPLE</text><text x="522" y="103">PROJECTS</text><text x="594" y="103">COMPLIANCE</text><text x="684" y="103">DOCUMENTS</text><text x="770" y="103">ANALYTICS</text><text x="848" y="103">SERVICES</text><text x="914" y="103">ADMINISTRATION</text></g>
  <rect x="34" y="135" width="475" height="125" rx="22" fill="#0b0c0f" stroke="#2d2f34"/><text x="58" y="183" fill="#f5f5f5" font-family="Arial" font-size="27">Good Afternoon, User</text><text x="58" y="213" fill="#8a8d92" font-family="Arial" font-size="14">One operating context across the company.</text>
  <rect x="34" y="282" width="475" height="255" rx="22" fill="#0b0c0f" stroke="#2d2f34"/><text x="58" y="321" fill="#8a8d92" font-family="Arial" font-size="14" letter-spacing="3">LIVE BUSINESS STATE</text><g fill="#d4d5d8" font-family="Arial" font-size="15"><text x="58" y="365">Revenue</text><text x="58" y="401">Orders</text><text x="58" y="437">Inventory Alerts</text><text x="58" y="473">Pending Approvals</text></g><g fill="#c7a45b" font-family="Arial" font-size="15" font-weight="700"><text x="340" y="365">CONNECTED</text><text x="340" y="401">CONNECTED</text><text x="340" y="437">CONNECTED</text><text x="340" y="473">CONNECTED</text></g>
  <rect x="535" y="135" width="551" height="402" rx="22" fill="#0b0c0f" stroke="#2d2f34"/><text x="566" y="182" fill="#c7a45b" font-family="Arial" font-size="13" font-weight="700" letter-spacing="3">COMPANY INTELLIGENCE</text><text x="566" y="229" fill="#f6f6f6" font-family="Arial" font-size="31">Organization intelligence</text><text x="566" y="267" fill="#9a9ca1" font-family="Arial" font-size="14">Ask, decide, prepare work and execute connected capabilities.</text><text x="566" y="292" fill="#9a9ca1" font-family="Arial" font-size="14">The business context continues across every workspace.</text>
  <rect x="566" y="332" width="489" height="89" rx="15" fill="#090a0c" stroke="#292b30"/><text x="588" y="373" fill="#c9c9cc" font-family="Arial" font-size="15">I'm Avantiqo. Ask me about this organization.</text><text x="588" y="397" fill="#777b80" font-family="Arial" font-size="13">Tell me what to open, explain, prepare or execute.</text>
  <rect x="566" y="450" width="489" height="55" rx="15" fill="#090a0c" stroke="#292b30"/><text x="588" y="483" fill="#73767c" font-family="Arial" font-size="14">Ask Avantiqo anything...</text><rect x="948" y="459" width="95" height="38" rx="12" fill="#c7a45b"/><text x="977" y="483" fill="#0b0b0b" font-family="Arial" font-size="13" font-weight="700">SEND</text>
  <rect x="824" y="555" width="262" height="42" rx="21" fill="#07130f" stroke="#1c8a64"/><text x="862" y="581" fill="#72d9b2" font-family="Arial" font-size="13" font-weight="700" letter-spacing="2">HEY AVANTIQO · LISTENING</text>
</svg>`);
}

async function makeProductScreenRaw(directory) {
  const target = path.join(directory, "product-screen.rgba");
  const buffer = await sharp(productScreenSvg()).ensureAlpha().raw().toBuffer();
  await fs.writeFile(target, buffer);
  return target;
}

async function renderLogoClip(ffmpeg, logoRaw, output, duration, closing = false) {
  const filters = [
    `[0:v]tpad=stop_mode=clone:stop_duration=${duration},setpts=PTS-STARTPTS,format=rgba,zoompan=z='min(zoom+0.00025,1.035)':d=1:s=1280x720:fps=24,fade=t=in:st=${closing ? 0.1 : 0.25}:d=0.75,fade=t=out:st=${Math.max(0, duration - 0.65)}:d=0.6,format=yuv420p[v]`,
  ];
  await run(ffmpeg, [
    "-y", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "1280x720", "-framerate", "24", "-i", logoRaw,
    "-filter_complex", filters.join(";"), "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-t", String(duration), output,
  ]);
}

async function renderScreenRise(ffmpeg, basePath, screenRaw, output) {
  const filter = [
    "[0:v]trim=duration=9,setpts=PTS-STARTPTS,scale=1280:720,fps=24,setsar=1[base]",
    "[1:v]tpad=stop_mode=clone:stop_duration=9,setpts=PTS-STARTPTS,scale=960:532,format=rgba,fade=t=in:st=2.35:d=0.55:alpha=1,fade=t=out:st=8.35:d=0.5:alpha=1[screen]",
    "[base][screen]overlay=x='(W-w)/2':y='if(lt(t,2.7),610,if(lt(t,4.7),610-(610-84)*(t-2.7)/2,84))':eval=frame:format=auto,format=yuv420p[v]",
  ].join(";");
  await run(ffmpeg, [
    "-y", "-i", basePath,
    "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", "1120x620", "-framerate", "24", "-i", screenRaw,
    "-filter_complex", filter, "-map", "[v]", "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", "-t", "9", output,
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
      screen_rise_source: "AUTHENTIC_AVANTIQO_PRODUCT_UI_RECONSTRUCTION",
      source_count: Object.keys(SOURCES).length,
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
      const screenRaw = await makeProductScreenRaw(directory);
      const intro = path.join(directory, "intro.mp4");
      const outro = path.join(directory, "outro.mp4");
      await renderLogoClip(ffmpeg, logoRaw, intro, 4.5, false);
      await renderLogoClip(ffmpeg, logoRaw, outro, 5.0, true);

      const screenRise = path.join(directory, "screen-rise.mp4");
      await renderScreenRise(ffmpeg, local.get("b03"), screenRaw, screenRise);
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

      const output = path.join(directory, "avantiqo-investor-film-finished-v2.mp4");
      await run(ffmpeg, [
        ...args,
        "-filter_complex", filters.join(";"),
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "veryfast", "-b:v", "270k", "-maxrate", "330k", "-bufsize", "660k",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "48k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart",
        "-t", totalDuration.toFixed(3), output,
      ], 290000);

      const uploaded = await upload(OUTPUT_PATH, output);
      return {
        success: true,
        duration_seconds: Number(totalDuration.toFixed(3)),
        narration_duration_seconds: Number(narrationDuration.toFixed(3)),
        score_applied: true,
        screen_rise_applied: true,
        screen_rise_source: "AUTHENTIC_AVANTIQO_PRODUCT_UI_RECONSTRUCTION",
        output: uploaded,
        signed_url: await signedUrl(OUTPUT_PATH, 86400),
      };
    } finally {
      await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    }
  },
};
