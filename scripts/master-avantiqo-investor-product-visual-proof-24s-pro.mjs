import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import sharp from "sharp";

const CONTRACT = "AVANTIQO_INVESTOR_PRODUCT_VISUAL_MASTER_24S_PRO_V1";
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 24;
const SHOT_SECONDS = 6;
const TARGET_SECONDS = 24;
const SCREEN_X = 760;
const SCREEN_Y = 168;
const SCREEN_W = 1040;
const SCREEN_H = 585;
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

function txt(x, y, value, size, color = C.text, weight = 500, anchor = "start", tracking = 0) {
  return `<text x="${x}" y="${y}" fill="${color}" font-family="Manrope,Inter,Arial,sans-serif" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" letter-spacing="${tracking}">${esc(value)}</text>`;
}

function pill(x, y, label, width) {
  return `<g><rect x="${x}" y="${y}" width="${width}" height="32" rx="16" fill="#FFFFFF" stroke="${C.border}"/>${txt(x + width / 2, y + 21, label, 12, C.secondary, 550, "middle")}</g>`;
}

function status(x, y, label, tone = "bronze") {
  const bg = tone === "green" ? "#EFF4ED" : tone === "amber" ? "#FAF1E6" : "#F7F0E8";
  const fg = tone === "green" ? C.green : tone === "amber" ? C.amber : C.bronze;
  const width = Math.max(118, label.length * 7.8 + 32);
  return `<g><rect x="${x}" y="${y}" width="${width}" height="30" rx="15" fill="${bg}"/><text x="${x + width / 2}" y="${y + 20}" fill="${fg}" font-family="Manrope,Inter,Arial,sans-serif" font-size="11" font-weight="700" text-anchor="middle" letter-spacing=".6">${esc(label.toUpperCase())}</text></g>`;
}

function productUi(stage) {
  const evidenceOpacity = stage >= 1 ? 1 : .22;
  const impactOpacity = stage >= 2 ? 1 : .22;
  const actionOpacity = stage >= 3 ? 1 : .22;
  const evidenceTop = stage === 1 ? C.accent : C.border;
  const impactTop = stage === 2 ? C.accent : C.border;
  const actionTop = stage === 3 ? C.accent : C.border;
  return Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
    <defs>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="8" stdDeviation="14" flood-color="#6B6257" flood-opacity=".08"/></filter>
      <linearGradient id="warm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F7F6F3"/><stop offset="1" stop-color="#F1EEE8"/></linearGradient>
    </defs>
    <rect width="1200" height="675" rx="22" fill="url(#warm)"/>
    <rect width="1200" height="54" rx="22" fill="#FBFAF8"/>
    <rect y="34" width="1200" height="20" fill="#FBFAF8"/>
    <line x1="0" y1="54" x2="1200" y2="54" stroke="#E7E3DC"/>
    ${txt(34, 34, "AVANTIQO", 18, C.heading, 760, "start", 2)}
    ${txt(146, 34, "Business Operating Intelligence", 12, C.muted, 520)}
    ${pill(790, 11, "Avantiqo Platform", 170)}
    ${pill(970, 11, "Current period", 150)}

    ${txt(42, 96, "MY BUSINESS", 11, C.bronze, 730, "start", 2)}
    ${txt(42, 132, "One event. Shared business context.", 29, C.heading, 650)}
    ${txt(42, 161, "Evidence, consequence and governed human action in one operating view.", 14, C.secondary, 500)}

    <g filter="url(#shadow)">
      <rect x="42" y="200" width="352" height="354" rx="18" fill="#FFFFFF" stroke="${C.border}"/>
      <rect x="42" y="200" width="352" height="4" rx="2" fill="${evidenceTop}"/>
      ${txt(66, 238, "NEEDS ATTENTION", 11, C.tertiary, 730, "start", 1.6)}
      ${status(215, 218, "Decision required", "amber")}
      ${txt(66, 283, "Supplier short-shipment", 22, C.heading, 650)}
      ${txt(66, 312, "Critical item missing from confirmed delivery.", 13, C.secondary, 500)}
      <line x1="66" y1="340" x2="370" y2="340" stroke="${C.border}"/>
      ${txt(66, 376, "Evidence", 11, C.tertiary, 720, "start", 1.2)}
      ${txt(66, 407, "Packing slip + receiving check", 14, C.text, 570)}
      ${txt(66, 446, "Why it matters", 11, C.muted, 520)}
      ${txt(66, 476, "Service and margin are now at risk.", 13, C.secondary, 520)}
      ${status(66, 504, "Evidence attached", "green")}

      <rect x="424" y="200" width="318" height="354" rx="18" fill="#FFFFFF" stroke="${C.border}"/>
      <rect x="424" y="200" width="318" height="4" rx="2" fill="${impactTop}"/>
      ${txt(448, 238, "BUSINESS IMPACT", 11, C.tertiary, 730, "start", 1.6)}
      ${txt(448, 284, "Operations", 16, C.heading, 650)}
      ${txt(448, 308, "Service promise at risk", 12.5, C.secondary, 500)}
      <line x1="448" y1="332" x2="718" y2="332" stroke="${C.border}"/>
      ${txt(448, 374, "Finance", 16, C.heading, 650)}
      ${txt(448, 398, "Margin pressure identified", 12.5, C.secondary, 500)}
      <line x1="448" y1="422" x2="718" y2="422" stroke="${C.border}"/>
      ${txt(448, 464, "Customer", 16, C.heading, 650)}
      ${txt(448, 488, "Commitment needs protection", 12.5, C.secondary, 500)}
      ${status(448, 512, "Shared context", "green")}

      <rect x="772" y="200" width="386" height="354" rx="18" fill="#FFFFFF" stroke="${C.border}"/>
      <rect x="772" y="200" width="386" height="4" rx="2" fill="${actionTop}"/>
      ${txt(796, 238, "GOVERNED ACTION", 11, C.tertiary, 730, "start", 1.6)}
      ${status(985, 218, "Human control", "green")}
      ${txt(796, 283, "Review substitution plan", 21, C.heading, 650)}
      ${txt(796, 312, "Protect service, margin and traceability.", 13, C.secondary, 500)}
      <rect x="796" y="342" width="338" height="94" rx="14" fill="#FAF8F4" stroke="${C.border}"/>
      ${txt(816, 371, "Business Partner", 11, C.bronze, 730, "start", 1.1)}
      ${txt(816, 399, "I linked the exception to service and margin.", 12.5, C.text, 560)}
      ${txt(816, 421, "Evidence is attached for your decision.", 12.5, C.text, 560)}
      ${txt(796, 471, "Decision owner · Operations Manager", 12, C.muted, 520)}
      <rect x="796" y="496" width="118" height="40" rx="11" fill="#1B1A18"/>
      ${txt(855, 522, "Approve", 13, "#FFFFFF", 680, "middle")}
      <rect x="926" y="496" width="108" height="40" rx="11" fill="#FFFFFF" stroke="${C.border}"/>
      ${txt(980, 522, "Change", 13, C.heading, 620, "middle")}
    </g>

    <g fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M394 375 C408 375 412 375 424 375" stroke="${C.accent}" stroke-opacity="${evidenceOpacity}" stroke-width="4"/>
      <path d="M742 375 C756 375 760 375 772 375" stroke="${C.accent}" stroke-opacity="${impactOpacity}" stroke-width="4"/>
      <circle cx="394" cy="375" r="5" fill="${C.accent}" fill-opacity="${evidenceOpacity}" stroke="none"/>
      <circle cx="424" cy="375" r="5" fill="${C.accent}" fill-opacity="${evidenceOpacity}" stroke="none"/>
      <circle cx="742" cy="375" r="5" fill="${C.accent}" fill-opacity="${impactOpacity}" stroke="none"/>
      <circle cx="772" cy="375" r="5" fill="${C.accent}" fill-opacity="${actionOpacity}" stroke="none"/>
    </g>

    <rect x="42" y="586" width="1116" height="54" rx="16" fill="#FFFFFF" stroke="${C.border}"/>
    ${txt(68, 619, "Supply Chain", 13, C.heading, 640)}
    ${txt(246, 619, "→", 16, C.accent, 700)}
    ${txt(284, 619, "Operations", 13, C.heading, 640)}
    ${txt(466, 619, "→", 16, C.accent, 700)}
    ${txt(504, 619, "Finance", 13, C.heading, 640)}
    ${txt(654, 619, "→", 16, C.accent, 700)}
    ${txt(692, 619, "Customer", 13, C.heading, 640)}
    ${txt(858, 619, "→", 16, C.accent, 700)}
    ${txt(896, 619, "Governance", 13, C.heading, 640)}
  </svg>`);
}

function glassOverlay() {
  return Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="${SCREEN_W}" height="${SCREEN_H}" viewBox="0 0 ${SCREEN_W} ${SCREEN_H}">
    <defs>
      <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity=".22"/>
        <stop offset=".19" stop-color="#FFFFFF" stop-opacity=".065"/>
        <stop offset=".38" stop-color="#FFFFFF" stop-opacity="0"/>
        <stop offset="1" stop-color="#D6A66A" stop-opacity=".035"/>
      </linearGradient>
      <linearGradient id="edge" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#FFFFFF" stop-opacity=".5"/>
        <stop offset=".55" stop-color="#E9E4DB" stop-opacity=".18"/>
        <stop offset="1" stop-color="#D6A66A" stop-opacity=".22"/>
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="${SCREEN_W - 4}" height="${SCREEN_H - 4}" rx="18" fill="url(#shine)" stroke="url(#edge)" stroke-width="2"/>
    <path d="M52 12 L420 12 L210 ${SCREEN_H - 12} L0 ${SCREEN_H - 12} Z" fill="#FFFFFF" fill-opacity=".035"/>
    <rect x="10" y="10" width="${SCREEN_W - 20}" height="${SCREEN_H - 20}" rx="13" fill="none" stroke="#FFFFFF" stroke-opacity=".16"/>
  </svg>`);
}

function outroScene() {
  return Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" width="720" height="238" viewBox="0 0 720 238">
    <defs><filter id="s"><feDropShadow dx="0" dy="10" stdDeviation="20" flood-color="#111111" flood-opacity=".16"/></filter></defs>
    <g filter="url(#s)">
      <rect x="2" y="2" width="716" height="234" rx="24" fill="#F7F6F3" fill-opacity=".965" stroke="#E5E1DA"/>
      <rect x="30" y="30" width="5" height="78" rx="2.5" fill="${C.accent}"/>
      ${txt(58, 61, "AVANTIQO", 15, C.bronze, 760, "start", 2.1)}
      ${txt(58, 99, "Business operating intelligence", 27, C.heading, 650)}
      ${txt(58, 132, "Evidence → consequence → governed action", 14, C.secondary, 520)}
      <line x1="58" y1="160" x2="660" y2="160" stroke="${C.border}"/>
      ${txt(58, 197, "Human judgment stays in control.", 14, C.text, 590)}
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
  const vf = `crop=1920:1080:0:4,fps=${FPS},setsar=1,eq=contrast=1.025:saturation=.95:brightness=.003:gamma=1.005,colorbalance=rs=.018:gs=.006:bs=-.012,format=yuv420p`;
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", source];
  if (!hasAudio) args.push("-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo");
  args.push("-t", String(SHOT_SECONDS), "-vf", vf);
  if (hasAudio) args.push("-af", "aresample=48000,aformat=channel_layouts=stereo,apad=pad_dur=6,atrim=duration=6,asetpts=PTS-STARTPTS");
  args.push("-c:v", "libx264", "-preset", "fast", "-crf", "15", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-shortest", target);
  execFileSync("ffmpeg", args);
}

function finishProductShot(source, ui1, ui2, ui3, glass, target) {
  const warp = `scale=${SCREEN_W}:${SCREEN_H}:flags=lanczos,perspective=x0=10:y0=10:x1=${SCREEN_W - 12}:y1=2:x2=0:y2=${SCREEN_H - 13}:x3=${SCREEN_W}:y3=${SCREEN_H - 2}:sense=destination,format=rgba`;
  const filter = [
    `[1:v]${warp},fade=t=in:st=.62:d=.30:alpha=1,fade=t=out:st=2.10:d=.24:alpha=1[u1]`,
    `[2:v]${warp},fade=t=in:st=1.98:d=.25:alpha=1,fade=t=out:st=3.58:d=.24:alpha=1[u2]`,
    `[3:v]${warp},fade=t=in:st=3.46:d=.25:alpha=1,fade=t=out:st=5.48:d=.36:alpha=1,split=2[u3][spillbase]`,
    `[spillbase]gblur=sigma=18,colorchannelmixer=aa=.13[spill]`,
    `[4:v]${warp},fade=t=in:st=.50:d=.32:alpha=1,fade=t=out:st=5.62:d=.30:alpha=1[g]`,
    `[0:v][spill]overlay=x=${SCREEN_X - 7}:y=${SCREEN_Y - 5}:shortest=0[a0]`,
    `[a0][u1]overlay=x=${SCREEN_X}:y=${SCREEN_Y}:shortest=0[a1]`,
    `[a1][u2]overlay=x=${SCREEN_X}:y=${SCREEN_Y}:shortest=0[a2]`,
    `[a2][u3]overlay=x=${SCREEN_X}:y=${SCREEN_Y}:shortest=0[a3]`,
    `[a3][g]overlay=x=${SCREEN_X}:y=${SCREEN_Y}:shortest=0,eq=contrast=1.01:saturation=.985,format=yuv420p[v]`,
  ].join(";");
  execFileSync("ffmpeg", [
    "-y", "-hide_banner", "-loglevel", "error",
    "-i", source,
    "-loop", "1", "-framerate", String(FPS), "-i", ui1,
    "-loop", "1", "-framerate", String(FPS), "-i", ui2,
    "-loop", "1", "-framerate", String(FPS), "-i", ui3,
    "-loop", "1", "-framerate", String(FPS), "-i", glass,
    "-filter_complex", filter,
    "-map", "[v]", "-map", "0:a?", "-t", String(SHOT_SECONDS),
    "-c:v", "libx264", "-preset", "fast", "-crf", "14", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "256k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", target,
  ]);
}

function finishOutroShot(source, overlay, target) {
  const filter = [
    `[1:v]format=rgba,scale=720:238,fade=t=in:st=3.46:d=.38:alpha=1,fade=t=out:st=5.72:d=.25:alpha=1[o]`,
    `[0:v][o]overlay=x=1120:y=730:shortest=0,eq=contrast=1.015:saturation=.965,format=yuv420p[v]`,
  ].join(";");
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
    `[0:a]aresample=48000,volume=.94[base]`,
    `sine=frequency=86:sample_rate=48000:duration=.22,volume=.05,afade=t=out:st=.07:d=.15,adelay=11920|11920[p0]`,
    `anoisesrc=color=pink:sample_rate=48000:duration=.16:amplitude=.014,highpass=f=1400,lowpass=f=5200,afade=t=out:st=.035:d=.125,adelay=12010|12010[air]`,
    `sine=frequency=1520:sample_rate=48000:duration=.028,volume=.018,adelay=13320|13320[t1]`,
    `sine=frequency=1240:sample_rate=48000:duration=.032,volume=.017,adelay=14800|14800[t2]`,
    `sine=frequency=980:sample_rate=48000:duration=.038,volume=.016,adelay=16280|16280[t3]`,
    `[base][p0][air][t1][t2][t3]amix=inputs=6:normalize=0,alimiter=limit=.94[a]`,
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

  const [ui1, ui2, ui3, glass, outro] = await Promise.all([
    renderSvg("avantiqo-ui-stage-1.png", productUi(1)),
    renderSvg("avantiqo-ui-stage-2.png", productUi(2)),
    renderSvg("avantiqo-ui-stage-3.png", productUi(3)),
    renderSvg("avantiqo-screen-glass.png", glassOverlay()),
    renderSvg("avantiqo-outro-panel.png", outroScene()),
  ]);

  const productFinished = path.join(ROOT, "03-avantiqo-finished.mp4");
  const outroFinished = path.join(ROOT, "04-human-control-finished.mp4");
  finishProductShot(normalized[2], ui1, ui2, ui3, glass, productFinished);
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
    product_ui_physically_integrated_into_display: true,
    product_ui_screen_perspective_used: true,
    product_ui_screen_glass_reflection_used: true,
    product_ui_light_spill_used: true,
    product_ui_full_frame_overlay_used: false,
    signature_device: "bronze_decision_thread_evidence_to_consequence_to_governed_action",
    finishing_layers: [
      "purpose_generated_live_action",
      "deterministic_avantiqo_product_plate",
      "film_safe_product_typography",
      "display_perspective_transform",
      "screen_bezel_and_glass_reflection",
      "subtle_screen_light_spill",
      "staged_product_state_animation",
      "bronze_decision_thread",
      "editorial_brand_panel",
      "warm_neutral_cinematic_grade",
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
      "full-frame-product-overlay",
      "screenshot-or-browser-capture",
      "reused-visual-asset",
    ],
    master_sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    master_bytes: bytes.length,
  };
  await fs.writeFile(path.join(ROOT, "proof-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log("AVANTIQO_INVESTOR_PRODUCT_VISUAL_24S_PRO=PASS");
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
