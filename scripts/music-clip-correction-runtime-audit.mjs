import fs from "node:fs";

const files = {
  runtime: "lib/creative/music/runtime/CreativeMusicClipCorrectionRuntime.js",
  route: "app/api/creative/music/clip-correction/route.js",
  panel: "components/creative/ProductionStudio/workspaces/MusicClipCorrectionPanel.jsx",
  workstation: "components/creative/ProductionStudio/workspaces/MusicMultitrackStudioPanelV2.jsx",
};

for (const [name, file] of Object.entries(files)) {
  if (!fs.existsSync(file)) throw new Error(`MUSIC_CLIP_CORRECTION_AUDIT_MISSING:${name}:${file}`);
}

const runtime = fs.readFileSync(files.runtime, "utf8");
const route = fs.readFileSync(files.route, "utf8");
const panel = fs.readFileSync(files.panel, "utf8");
const workstation = fs.readFileSync(files.workstation, "utf8");

const checks = [
  [runtime.includes("AVANTIQO_MUSIC_CLIP_CORRECTION_RENDER_V1"), "runtime contract"],
  [runtime.includes("asetrate="), "pitch shift"],
  [runtime.includes("atempoFilters(1 / normalized.pitch_ratio)"), "pitch duration compensation"],
  [runtime.includes("atempoFilters(1 / normalized.timing_ratio)"), "timing correction"],
  [runtime.includes('"pcm_s24le"'), "24-bit output"],
  [runtime.includes("formant_preservation: false"), "formant limitation explicit"],
  [runtime.includes("note_level_tuning: false"), "note tuning limitation explicit"],
  [runtime.includes("transient_aware_warp: false"), "warp limitation explicit"],
  [route.includes("CREATIVE_MUSIC_CLIP_CORRECTION_REVISION_CONFLICT"), "revision guard"],
  [route.includes("source_asset_history"), "source history"],
  [route.includes('music_asset_kind: "CLIP_CORRECTION_RENDER"'), "derived asset kind"],
  [route.includes("original_source_preserved: true"), "original source preserved"],
  [route.includes("provider_job_submitted: false"), "no provider generation"],
  [panel.includes("Pitch & timing correction"), "correction UI"],
  [panel.includes("Render corrected clip"), "correction action"],
  [workstation.includes('import MusicClipCorrectionPanel from "./MusicClipCorrectionPanel"'), "workstation import"],
  [workstation.includes("sessionRevision={session.revision || 0}"), "workstation revision binding"],
  [workstation.includes("disabled={recording || dirty || busy}"), "save-first guard"],
];

for (const [passed, label] of checks) {
  if (!passed) throw new Error(`MUSIC_CLIP_CORRECTION_AUDIT_FAILED:${label}`);
}

console.log("MUSIC_CLIP_CORRECTION_RUNTIME_AUDIT=PASS");
