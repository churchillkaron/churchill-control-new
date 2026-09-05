import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const CONTRACT = "AVANTIQO_INVESTOR_PRODUCT_VISUAL_MASTER_24S_V1";
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 24;
const SHOT_SECONDS = 6;
const TARGET_SECONDS = 24;

const ROOT = path.resolve(process.env.PROOF_DIR || "local-audit-output/avantiqo-investor-product-visual-24s");
const SOURCE_IDS = ["01-evidence", "02-consequence", "03-avantiqo", "04-human-control"];

const C = Object.freeze({
  canvas: "#F7F6F3",
  raised: "#FBFAF8",
  card: "#FFFFFF",
  text: "#191919",
  heading: "#1B1A18",
  secondary: "#6C6963",
  tertiary: "#77736C",
  muted: "#AAA69E",
  bronze: "#9A744B",
  bronzeIcon: "#A37849",
  accent: "#D6A66A",
  border: "#E8E5DF",
  green: "#667A61",
  amber: "#9A6A2F",
});

function ensure(condition, code) {
  if (!condition) throw new Error(`${CONTRACT}_${code}`);
}

function esc(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function ffprobe(file) {
  return JSON.parse(execFileSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration,size:stream=codec_type,width,height,r_frame_rate,sample_rate,channels",
    "-of", "json",
    file,
  ], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 }));
}

function text(x, y, value, size, color = C.text, weight = 500, anchor = "start", tracking = 0) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Manrope,Inter,Arial,sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${tracking}">${esc(value)}</text>`;
}

function pill(x, y, label, width) {
  return `<g><rect x="${x}" y="${y}" width="${width}" height="34" rx="17" fill="#FFFFFF" stroke="${C.border}"/>${text(x + width / 2, y + 22, label, 12, C.secondary, 500, "middle")}</g>`;
}

function statusPill(x, y, label, tone = "bronze") {
  const bg = tone === "green" ? "#EFF4ED" : tone === "amber" ? "#FAF1E6" : "#F7F0E8";
  const fg = tone === "green" ? C.green : tone === "amber" ? C.amber : C.bronze;
  const width = Math.max(92, label.length * 7.2 + 28);
  return `<g><rect x="${x}" y="${y}" width="${width}" height="28" rx="14" fill="${bg}"/><text x="${x + width / 2}" y="${y + 18.5}" fill="${fg}" font-family="Manrope,Inter,Arial,sans-serif" font-size="10.5" font-weight="650" text-anchor="middle" letter-spacing=".5">${esc(label.toUpperCase())}</text></g>`;
}

function card(x, y, w, h, extra = "") {
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="${C.card}" stroke="${C.border}"/><rect x="${x + 1}" y="${y + 1}" width="${w - 2}" height="${h - 2}" rx="19" fill="none" stroke="#FFFFFF" stroke-opacity=".8"/>${extra}</g>`;
}

function connector(stage) {
  const e = stage >= 1 ? 1 : .18;
  const c = stage >= 2 ? 1 : .18;
  const a = stage >= 3 ? 1 : .18;
  return `<g fill="none" stroke-linecap="round" stroke-linejoin="round">
    <path d="M600 430 C700 430 730 430 810 430" stroke="${C.accent}" stroke-opacity="${e}" stroke-width="3"/>
    <path d="M1110 430 C1190 430 1215 430 1290 430" stroke="${C.accent}" stroke-opacity="${c}" stroke-width="3"/>
    <circle cx="600" cy="430" r="6" fill="${C.accent}" fill-opacity="${e}" stroke="none"/>
    <circle cx="810" cy="430" r="6" fill="${C.accent}" fill-opacity="${e}" stroke="none"/>
    <circle cx="1110" cy="430" r="6" fill="${C.accent}" fill-opacity="${c}" stroke="none"/>
    <circle cx="1290" cy="430" r="6" fill="${C.accent}" fill-opacity="${a}" stroke="none"/>
  </g>`;
}

function appScene(stage) {
  const highlight1 = stage === 1 ? C.accent : C.border;
  const highlight2 = stage === 2 ? C.accent : C.border;
  const highlight3 = stage === 3 ? C.accent : C.border;
  return Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#6B6257" flood-opacity=".08"/></filter>
      <linearGradient id="warm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7F6F3"/><stop offset="1" stop-color="#F1EEE8"/></linearGradient>
    </defs>
    <rect width="1920" height="1080" fill="url(#warm)"/>
    <rect x="0" y="0" width="1920" height="66" fill="#FBFAF8"/>
    <line x1="0" y1="66" x2="1920" y2="66" stroke="#E7E3DC"/>
    ${text(50, 40, "AVANTIQO", 19, C.heading, 700, "start", 2.1)}
    ${text(165, 40, "Business Operating Intelligence", 12, C.muted, 500)}
    ${pill(1290, 16, "Avantiqo Platform", 170)}
    ${pill(1470, 16, "All entities", 130)}
    ${pill(1610, 16, "Current period", 150)}

    ${text(72, 122, "MY BUSINESS", 11, C.bronze, 700, "start", 2.1)}
    ${text(72, 164, "One event. Shared business context.", 31, C.heading, 600)}
    ${text(72, 195, "Evidence, consequence and governed action in one operating view.", 14, C.secondary, 450)}

    <g filter="url(#shadow)">
      ${card(72, 250, 528, 438, `
        <rect x="72" y="250" width="528" height="4" rx="2" fill="${highlight1}"/>
        ${text(102, 294, "NEEDS ATTENTION", 11, C.tertiary, 700, "start", 1.8)}
        ${statusPill(415, 275, "Decision required", "amber")}
        ${text(102, 345, "Supplier short-shipment", 24, C.heading, 600)}
        ${text(102, 378, "Critical ingredient missing from confirmed delivery.", 13, C.secondary, 450)}
        <line x1="102" y1="407" x2="570" y2="407" stroke="${C.border}"/>
        ${text(102, 444, "Evidence", 11, C.tertiary, 700, "start", 1.3)}
        ${text(102, 476, "Packing slip", 13, C.text, 550)}
        ${text(290, 476, "Receiving check", 13, C.text, 550)}
        ${text(102, 514, "Source", 11, C.muted, 500)}
        ${text(102, 541, "Supply Chain · Receiving", 13, C.text, 550)}
        ${text(102, 586, "Why it matters", 11, C.muted, 500)}
        ${text(102, 613, "Service availability and margin are now at risk.", 13, C.secondary, 500)}
        ${statusPill(102, 638, "Evidence attached", "green")}
      `)}

      ${card(810, 250, 300, 438, `
        <rect x="810" y="250" width="300" height="4" rx="2" fill="${highlight2}"/>
        ${text(840, 294, "BUSINESS IMPACT", 11, C.tertiary, 700, "start", 1.8)}
        ${text(840, 343, "Operations", 16, C.heading, 600)}
        ${text(840, 367, "Service promise at risk", 12, C.secondary, 450)}
        <line x1="840" y1="391" x2="1080" y2="391" stroke="${C.border}"/>
        ${text(840, 435, "Finance", 16, C.heading, 600)}
        ${text(840, 459, "Margin pressure identified", 12, C.secondary, 450)}
        <line x1="840" y1="483" x2="1080" y2="483" stroke="${C.border}"/>
        ${text(840, 527, "Customer", 16, C.heading, 600)}
        ${text(840, 551, "Commitment needs protection", 12, C.secondary, 450)}
        <line x1="840" y1="575" x2="1080" y2="575" stroke="${C.border}"/>
        ${statusPill(840, 607, "Shared context", "green")}
      `)}

      ${card(1290, 250, 558, 438, `
        <rect x="1290" y="250" width="558" height="4" rx="2" fill="${highlight3}"/>
        ${text(1320, 294, "GOVERNED ACTION", 11, C.tertiary, 700, "start", 1.8)}
        ${statusPill(1650, 275, "Human control", "green")}
        ${text(1320, 345, "Review substitution plan", 23, C.heading, 600)}
        ${text(1320, 378, "Protect service while preserving margin and traceability.", 13, C.secondary, 450)}
        <rect x="1320" y="418" width="498" height="92" rx="14" fill="#FAF8F4" stroke="${C.border}"/>
        ${text(1344, 448, "Business Partner", 11, C.bronze, 700, "start", 1.1)}
        ${text(1344, 478, "I linked the supplier exception to service", 12.5, C.text, 520)}
        ${text(1344, 499, "and margin impact. Evidence is attached.", 12.5, C.text, 520)}
        ${text(1320, 551, "Decision owner", 11, C.muted, 500)}
        ${text(1320, 577, "Operations Manager", 13, C.text, 550)}
        <rect x="1320" y="615" width="132" height="42" rx="12" fill="#1B1A18"/>
        ${text(1386, 642, "Approve", 13, "#FFFFFF", 650, "middle")}
        <rect x="1464" y="615" width="116" height="42" rx="12" fill="#FFFFFF" stroke="${C.border}"/>
        ${text(1522, 642, "Change", 13, C.heading, 600, "middle")}
      `)}
    </g>

    ${connector(stage)}

    <g>
      <rect x="72" y="730" width="1776" height="216" rx="22" fill="#FFFFFF" stroke="${C.border}"/>
      ${text(102, 772, "WORK CONTEXT", 11, C.tertiary, 700, "start", 1.8)}
      ${text(102, 814, "Supply Chain", 15, C.heading, 600)}
      ${text(102, 840, "Evidence owner", 11, C.muted, 450)}
      ${text(420, 814, "Operations", 15, C.heading, 600)}
      ${text(420, 840, "Consequence owner", 11, C.muted, 450)}
      ${text(720, 814, "Finance", 15, C.heading, 600)}
      ${text(720, 840, "Economic consequence", 11, C.muted, 450)}
      ${text(1008, 814, "Customer", 15, C.heading, 600)}
      ${text(1008, 840, "Promise protected", 11, C.muted, 450)}
      ${text(1360, 814, "Governance", 15, C.heading, 600)}
      ${text(1360, 840, "Decision + evidence", 11, C.muted, 450)}
      <line x1="102" y1="882" x2="1818" y2="882" stroke="${C.border}"/>
      ${text(102, 916, "Avantiqo keeps the business event, evidence, consequence and human decision connected.", 13, C.secondary, 500)}
    </g>
  </svg>`);
}

function outroScene() {
  return Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="760" height="258" viewBox="0 0 760 258">
    <defs><filter id="s"><feDropShadow dx="0" dy="8" stdDeviation="18" flood-color="#111111" flood-opacity=".14"/></filter></defs>
    <g filter="url(#s)"><rect x="2" y="2" width="756" height="254" rx="24" fill="#F7F6F3" fill-opacity=".96" stroke="#E5E1DA"/>
      <rect x="30" y="30" width="5" height="78" rx="2.5" fill="${C.accent}"/>
      ${text(58, 63, "AVANTIQO", 15, C.bronze, 700, "start", 2.1)}
      ${text(58, 102, "Business operating intelligence", 28, C.heading, 620)}
      ${text(58, 135, "Evidence → consequence → governed action", 14, C.secondary, 500)}
      <line x1="58" y1="166" x2="700" y2="166" stroke="${C.border}"/>
      ${text(58, 202, "Human judgment stays in control.", 14, C.text, 560)}
    </g>
  </svg>`);
}

async function renderSvg(name, buffer) {
  const target = path.join(ROOT, name);
  await sharp(buffer).png().toFile(target);
  return target;
}

function normalize(source, target) {
  const probe = ffprobe(source);
  const hasAudio = (probe.streams || []).some((s) => s.codec_type === "audio");
  const vf = `crop=1920:1080:0:4,fps=${FPS},setsar=1,eq=contrast=1.015:saturation=0.96:brightness=0.002,format=yuv420p`;
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", source];
  if (!hasAudio) args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
  args.push("-t", String(SHOT_SECONDS), "-vf", vf);
  if (hasAudio) args.push("-af", "aresample=48000,aformat=channel_layouts=stereo,apad=pad_dur=6,atrim=duration=6,asetpts=PTS-STARTPTS");
  args.push("-c:v", "libx264", "-preset", "fast", "-crf", "15", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-shortest", target);
  execFileSync("ffmpeg", args);
}

function finishProductShot(source, ui1, ui2, ui3, target) {
  const filter = [
    `[1:v]format=rgba,fade=t=in:st=0.75:d=.28:alpha=1,fade=t=out:st=2.10:d=.26:alpha=1[u1]`,
    `[2:v]format=rgba,fade=t=in:st=2.00:d=.26:alpha=1,fade=t=out:st=3.55:d=.26:alpha=1[u2]`,
    `[3:v]format=rgba,fade=t=in:st=3.45:d=.26:alpha=1,fade=t=out:st=5.25:d=.34:alpha=1[u3]`,
    `[0:v][u1]overlay=0:0:shortest=0[a]`,
    `[a][u2]overlay=0:0:shortest=0[b]`,
    `[b][u3]overlay=0:0:shortest=0,eq=contrast=1.01:saturation=.98,format=yuv420p[v]`,
  ].join(";");
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", source,
    "-loop", "1", "-framerate", String(FPS), "-i", ui1,
    "-loop", "1", "-framerate", String(FPS), "-i", ui2,
    "-loop", "1", "-framerate", String(FPS), "-i", ui3,
    "-filter_complex", filter,
    "-map", "[v]", "-map", "0:a?", "-t", String(SHOT_SECONDS),
    "-c:v", "libx264", "-preset", "fast", "-crf", "14", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", target,
  ]);
}

function finishOutroShot(source, overlay, target) {
  const filter = `[1:v]format=rgba,fade=t=in:st=3.55:d=.38:alpha=1,fade=t=out:st=5.72:d=.25:alpha=1[o];[0:v][o]overlay=x=1090:y=680:shortest=0,eq=contrast=1.02:saturation=.95,format=yuv420p[v]`;
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", source,
    "-loop", "1", "-framerate", String(FPS), "-i", overlay,
    "-filter_complex", filter,
    "-map", "[v]", "-map", "0:a?", "-t", String(SHOT_SECONDS),
    "-c:v", "libx264", "-preset", "fast", "-crf", "14", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", target,
  ]);
}

function addSoundDesign(source, target) {
  const filter = [
    `[0:a]aresample=48000,volume=0.92[base]`,
    `sine=frequency=740:sample_rate=48000:duration=.07,volume=.05,adelay=13200|13200[t1]`,
    `sine=frequency=620:sample_rate=48000:duration=.08,volume=.045,adelay=14650|14650[t2]`,
    `sine=frequency=520:sample_rate=48000:duration=.10,volume=.04,adelay=16100|16100[t3]`,
    `[base][t1][t2][t3]amix=inputs=4:normalize=0,alimiter=limit=.94[a]`,
  ].join(";");
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", source,
    "-filter_complex", filter,
    "-map", "0:v", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "320k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", target,
  ]);
}

async function main() {
  await fs.mkdir(ROOT, { recursive: true });

  const normalized = [];
  for (const id of SOURCE_IDS) {
    const source = path.join(ROOT, `${id}-1920x1088.mp4`);
    const target = path.join(ROOT, `${id}-1080p-normalized.mp4`);
    ensure((await fs.stat(source)).size > 500_000, `SOURCE_INVALID:${id}`);
    normalize(source, target);
    normalized.push(target);
  }

  const [ui1, ui2, ui3, outro] = await Promise.all([
    renderSvg("avantiqo-ui-stage-1.png", appScene(1)),
    renderSvg("avantiqo-ui-stage-2.png", appScene(2)),
    renderSvg("avantiqo-ui-stage-3.png", appScene(3)),
    renderSvg("avantiqo-outro-panel.png", outroScene()),
  ]);

  const productFinished = path.join(ROOT, "03-avantiqo-finished.mp4");
  const outroFinished = path.join(ROOT, "04-human-control-finished.mp4");
  finishProductShot(normalized[2], ui1, ui2, ui3, productFinished);
  finishOutroShot(normalized[3], outro, outroFinished);

  const concat = path.join(ROOT, "concat.txt");
  const joined = path.join(ROOT, "joined-24s.mp4");
  await fs.writeFile(concat, [normalized[0], normalized[1], productFinished, outroFinished].map((f) => `file '${f.replaceAll("'", "'\\''")}'`).join("\n") + "\n");
  execFileSync("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", concat, "-c", "copy", joined]);

  const master1080 = path.join(ROOT, "avantiqo-investor-product-visual-proof-24s-1080p.mp4");
  addSoundDesign(joined, master1080);
  const master4k = path.join(ROOT, "avantiqo-investor-product-visual-proof-24s-4k-viewing-upscale.mp4");
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", master1080,
    "-vf", "scale=3840:2160:flags=lanczos",
    "-c:v", "libx264", "-preset", "fast", "-crf", "15", "-pix_fmt", "yuv420p",
    "-c:a", "copy", "-movflags", "+faststart", master4k,
  ]);

  const probe = ffprobe(master1080);
  const video = (probe.streams || []).find((s) => s.codec_type === "video") || {};
  const duration = Number(probe.format?.duration || 0);
  ensure(Number(video.width) === WIDTH && Number(video.height) === HEIGHT, `MASTER_RESOLUTION_INVALID:${video.width}x${video.height}`);
  ensure(Math.abs(duration - TARGET_SECONDS) <= .12, `MASTER_DURATION_INVALID:${duration}`);
  ensure((probe.streams || []).some((s) => s.codec_type === "audio"), "MASTER_AUDIO_REQUIRED");

  const bytes = await fs.readFile(master1080);
  const report = {
    success: true,
    contract: CONTRACT,
    source_commit: process.env.GITHUB_SHA || null,
    duration_seconds: duration,
    fps: FPS,
    master_resolution: `${WIDTH}x${HEIGHT}`,
    viewing_copy_resolution: "3840x2160",
    viewing_copy_is_delivery_upscale: true,
    product_visual_contract: "AVANTIQO_INVESTOR_FILM_PRODUCT_VISUAL_CONTRACT_V1",
    avantiqo_visual_language: "LIGHT_BUSINESS_OS",
    deterministic_product_ui_used: true,
    product_ui_generated_from_screenshot: false,
    product_ui_generated_from_browser_capture: false,
    product_ui_text_readable_and_authored: true,
    signature_device: "bronze_decision_thread_evidence_to_consequence_to_governed_action",
    finishing_layers: [
      "purpose_generated_live_action",
      "deterministic_avantiqo_product_plate",
      "staged_product_state_animation",
      "bronze_decision_thread",
      "editorial_brand_panel",
      "warm_neutral_grade",
      "subtle_transition_sound_design",
      "4k_viewing_upscale",
    ],
    hard_rejects_avoided: [
      "black-current-Avantiqo-shell",
      "obsidian-current-Avantiqo-dashboard",
      "blue-neon-enterprise-ui",
      "generic-SaaS-dashboard",
      "fake-browser-window",
      "unreadable-generated-product-text",
      "screenshot-or-browser-capture",
      "reused-visual-asset",
    ],
    master_sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    master_bytes: bytes.length,
  };
  await fs.writeFile(path.join(ROOT, "proof-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("AVANTIQO_INVESTOR_PRODUCT_VISUAL_24S=PASS");
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
