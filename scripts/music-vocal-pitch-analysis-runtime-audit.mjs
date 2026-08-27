import fs from "node:fs";

const files = {
  runtime: "lib/creative/music/runtime/CreativeMusicVocalPitchAnalysisRuntime.js",
  route: "app/api/creative/music/clip-vocal-pitch-analysis/route.js",
  panel: "components/creative/ProductionStudio/workspaces/MusicVocalPitchAnalysisPanel.jsx",
  correction: "components/creative/ProductionStudio/workspaces/MusicClipCorrectionPanel.jsx",
};
for (const [name, file] of Object.entries(files)) if (!fs.existsSync(file)) throw new Error(`MUSIC_VOCAL_PITCH_AUDIT_MISSING:${name}:${file}`);
const runtime = fs.readFileSync(files.runtime, "utf8");
const route = fs.readFileSync(files.route, "utf8");
const panel = fs.readFileSync(files.panel, "utf8");
const correction = fs.readFileSync(files.correction, "utf8");
const checks = [
  [runtime.includes("AVANTIQO_MUSIC_VOCAL_PITCH_ANALYSIS_V1"), "runtime contract"],
  [runtime.includes("estimateFramePitch"), "frame pitch estimation"],
  [runtime.includes("cents_deviation"), "cents evidence"],
  [runtime.includes("buildNoteSegments"), "stable note segments"],
  [runtime.includes("MAX_SECONDS = 120"), "bounded analysis"],
  [runtime.includes("correction_applied: false"), "analysis-only correction flag"],
  [runtime.includes("formant_processing_applied: false"), "formant limitation"],
  [runtime.includes("auto_tune_applied: false"), "autotune limitation"],
  [route.includes("CREATIVE_MUSIC_VOCAL_PITCH_VOCAL_TRACK_REQUIRED"), "vocal track restriction"],
  [route.includes("CREATIVE_MUSIC_VOCAL_PITCH_REVISION_CONFLICT"), "revision guard"],
  [route.includes("vocal_pitch_analysis"), "clip persistence"],
  [panel.includes("Vocal pitch map"), "pitch-map UI"],
  [panel.includes("mean_cents_deviation"), "cents UI"],
  [panel.includes("sourceMatches"), "stale-source UI guard"],
  [correction.includes("MusicVocalPitchAnalysisPanel"), "clip tools integration"],
];
for (const [passed, label] of checks) if (!passed) throw new Error(`MUSIC_VOCAL_PITCH_AUDIT_FAILED:${label}`);
console.log("MUSIC_VOCAL_PITCH_ANALYSIS_RUNTIME_AUDIT=PASS");
