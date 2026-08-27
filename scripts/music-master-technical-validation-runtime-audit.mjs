import fs from "node:fs";

const files = {
  runtime: "lib/creative/music/runtime/CreativeMusicMasterValidationRuntime.js",
  route: "app/api/creative/music/master-validate/route.js",
  library: "app/api/creative/music/master-library/route.js",
  panel: "components/creative/ProductionStudio/workspaces/MusicMasterStudioPanel.jsx",
};

for (const [name, path] of Object.entries(files)) {
  if (!fs.existsSync(path)) throw new Error(`MUSIC_MASTER_TECHNICAL_VALIDATION_AUDIT_MISSING:${name}:${path}`);
}

const runtime = fs.readFileSync(files.runtime, "utf8");
const route = fs.readFileSync(files.route, "utf8");
const library = fs.readFileSync(files.library, "utf8");
const panel = fs.readFileSync(files.panel, "utf8");

const checks = [
  [runtime.includes("AVANTIQO_MUSIC_MASTER_TECHNICAL_VALIDATION_V1"), "runtime contract"],
  [runtime.includes("MUSIC_MASTER_CHECKSUM_MISMATCH"), "checksum validation"],
  [runtime.includes("MUSIC_MASTER_LOUDNESS_TARGET_MISSED"), "loudness validation"],
  [runtime.includes("MUSIC_MASTER_TRUE_PEAK_EXCEEDED"), "true peak validation"],
  [runtime.includes("MUSIC_MASTER_SAMPLE_RATE_MISMATCH"), "sample rate validation"],
  [runtime.includes("MUSIC_MASTER_CHANNEL_COUNT_MISMATCH"), "channel validation"],
  [runtime.includes("remastering_performed: false"), "no remastering"],
  [runtime.includes("provider_job_submitted: false"), "no provider execution"],
  [route.includes("music_finish_task_id"), "immutable finish task evidence"],
  [route.includes("technical_validation"), "validation persistence"],
  [library.includes("AVANTIQO_MUSIC_MASTER_LIBRARY_V2"), "library v2"],
  [library.includes("technical_validation_passed"), "library validation evidence"],
  [panel.includes("Revalidate technical QC"), "master studio revalidation control"],
  [panel.includes("Stored master independently revalidated"), "master studio validation evidence"],
];

for (const [passed, label] of checks) {
  if (!passed) throw new Error(`MUSIC_MASTER_TECHNICAL_VALIDATION_AUDIT_FAILED:${label}`);
}

console.log("MUSIC_MASTER_TECHNICAL_VALIDATION_RUNTIME_AUDIT=PASS");
