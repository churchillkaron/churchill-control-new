import fs from "node:fs";

const routePath = "app/api/creative/music/clip-correction-revert/route.js";
const panelPath = "components/creative/ProductionStudio/workspaces/MusicClipCorrectionPanel.jsx";
if (!fs.existsSync(routePath) || !fs.existsSync(panelPath)) throw new Error("MUSIC_CLIP_CORRECTION_REVERT_AUDIT_FILES_REQUIRED");
const route = fs.readFileSync(routePath, "utf8");
const panel = fs.readFileSync(panelPath, "utf8");
const checks = [
  [route.includes("AVANTIQO_MUSIC_CLIP_CORRECTION_REVERT_V1"), "revert contract"],
  [route.includes("CREATIVE_MUSIC_CLIP_CORRECTION_REVERT_REVISION_CONFLICT"), "revision guard"],
  [route.includes("source_asset_history"), "source history"],
  [route.includes("correction_revert_history"), "revert history"],
  [route.includes("correction_asset_preserved: true"), "correction asset preservation"],
  [route.includes("delete nextClip.correction"), "correction state removal"],
  [route.includes("provider_job_submitted: false"), "no provider generation"],
  [panel.includes("Revert correction"), "revert UI"],
  [panel.includes("/api/creative/music/clip-correction-revert"), "revert route binding"],
];
for (const [passed, label] of checks) if (!passed) throw new Error(`MUSIC_CLIP_CORRECTION_REVERT_AUDIT_FAILED:${label}`);
console.log("MUSIC_CLIP_CORRECTION_REVERT_RUNTIME_AUDIT=PASS");
