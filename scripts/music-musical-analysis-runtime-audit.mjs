import fs from "node:fs";

const files = {
  runtime: "lib/creative/music/runtime/CreativeMusicMusicalAnalysisRuntime.js",
  route: "app/api/creative/music/clip-musical-analysis/route.js",
  panel: "components/creative/ProductionStudio/workspaces/MusicClipMusicalAnalysisPanel.jsx",
  correction: "components/creative/ProductionStudio/workspaces/MusicClipCorrectionPanel.jsx",
};
for (const [name, file] of Object.entries(files)) if (!fs.existsSync(file)) throw new Error(`MUSIC_MUSICAL_ANALYSIS_AUDIT_MISSING:${name}:${file}`);
const runtime = fs.readFileSync(files.runtime, "utf8");
const route = fs.readFileSync(files.route, "utf8");
const panel = fs.readFileSync(files.panel, "utf8");
const correction = fs.readFileSync(files.correction, "utf8");
const checks = [
  [runtime.includes("AVANTIQO_MUSIC_MUSICAL_ANALYSIS_V1"), "analysis contract"],
  [runtime.includes("MAX_ANALYSIS_SECONDS = 240"), "bounded analysis duration"],
  [runtime.includes("tempoEstimate"), "tempo analysis"],
  [runtime.includes("goertzelEnergy"), "audio-frequency measurement"],
  [runtime.includes("MAJOR_PROFILE") && runtime.includes("MINOR_PROFILE"), "key profile analysis"],
  [runtime.includes("confidence_threshold: 0.42"), "confidence gate"],
  [runtime.includes("metadata_guessing_forbidden: true"), "no metadata guessing"],
  [runtime.includes("chord_analysis_ready: false"), "chord limitation explicit"],
  [runtime.includes("section_analysis_ready: false"), "section limitation explicit"],
  [route.includes("CREATIVE_MUSIC_MUSICAL_ANALYSIS_REVISION_CONFLICT"), "revision guard"],
  [route.includes("session_values_changed: false"), "analysis does not silently apply"],
  [route.includes("explicit_musician_apply: true"), "explicit apply"],
  [route.includes("CREATIVE_MUSIC_MUSICAL_ANALYSIS_STALE_OR_MISSING"), "stale analysis guard"],
  [panel.includes("Use BPM") && panel.includes("Use Key"), "musician apply controls"],
  [panel.includes("analysisMatchesCurrentSource"), "UI stale-source guard"],
  [correction.includes("MusicClipMusicalAnalysisPanel"), "workstation clip-tools integration"],
];
for (const [passed, label] of checks) if (!passed) throw new Error(`MUSIC_MUSICAL_ANALYSIS_AUDIT_FAILED:${label}`);
console.log("MUSIC_MUSICAL_ANALYSIS_RUNTIME_AUDIT=PASS");
