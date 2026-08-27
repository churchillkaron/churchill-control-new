import fs from "node:fs";

const files = {
  runtime: "lib/creative/music/runtime/CreativeMusicVocalTuningPlanRuntime.js",
  route: "app/api/creative/music/vocal-tuning-plan/route.js",
  panel: "components/creative/ProductionStudio/workspaces/MusicVocalTuningPlanPanel.jsx",
  pitchPanel: "components/creative/ProductionStudio/workspaces/MusicVocalPitchAnalysisPanel.jsx",
};
for (const [name, file] of Object.entries(files)) if (!fs.existsSync(file)) throw new Error(`MUSIC_VOCAL_TUNING_PLAN_AUDIT_MISSING:${name}:${file}`);
const runtime = fs.readFileSync(files.runtime, "utf8");
const route = fs.readFileSync(files.route, "utf8");
const panel = fs.readFileSync(files.panel, "utf8");
const pitchPanel = fs.readFileSync(files.pitchPanel, "utf8");
const checks = [
  [runtime.includes("AVANTIQO_MUSIC_VOCAL_TUNING_PLAN_V1"), "tuning plan contract"],
  [runtime.includes("nearestScaleMidi"), "key-aware target selection"],
  [runtime.includes("proposed_correction_cents"), "cents correction proposal"],
  [runtime.includes("correction_strength"), "correction strength"],
  [runtime.includes("preserve_within_cents"), "in-tune tolerance"],
  [runtime.includes("max_correction_cents"), "max correction guard"],
  [runtime.includes("musician_approval_required: true"), "musician approval"],
  [runtime.includes("auto_apply_forbidden: true"), "no auto apply"],
  [runtime.includes("render_ready: false"), "render locked"],
  [runtime.includes("FORMANT_PRESERVING_TUNING_ENGINE_NOT_CERTIFIED"), "DSP certification blocker"],
  [route.includes("CREATIVE_MUSIC_VOCAL_TUNING_PLAN_CURRENT_PITCH_ANALYSIS_REQUIRED"), "current pitch evidence guard"],
  [route.includes("CREATIVE_MUSIC_VOCAL_TUNING_PLAN_PROJECT_KEY_REQUIRED"), "project key requirement"],
  [route.includes("CREATIVE_MUSIC_VOCAL_TUNING_PLAN_REVISION_CONFLICT"), "revision guard"],
  [route.includes("audio_changed: false"), "audio unchanged"],
  [panel.includes("Build tuning plan"), "plan UI"],
  [panel.includes("Approve"), "note approval UI"],
  [panel.includes("Audio render locked"), "render gate UI"],
  [pitchPanel.includes("MusicVocalTuningPlanPanel"), "pitch workflow integration"],
];
for (const [passed, label] of checks) if (!passed) throw new Error(`MUSIC_VOCAL_TUNING_PLAN_AUDIT_FAILED:${label}`);
console.log("MUSIC_VOCAL_TUNING_PLAN_RUNTIME_AUDIT=PASS");
