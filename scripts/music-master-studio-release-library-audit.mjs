import fs from "node:fs";
import assert from "node:assert/strict";

const route = fs.readFileSync("app/api/creative/music/master-library/route.js", "utf8");
const panel = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicMasterStudioPanel.jsx", "utf8");
const workspace = fs.readFileSync("components/creative/ProductionStudio/workspaces/MusicStudioWorkspace.jsx", "utf8");

assert.match(route, /AVANTIQO_MUSIC_MASTER_LIBRARY_V2/);
assert.match(route, /CreativeAssetsRuntime\.list/);
assert.match(route, /MIX_RENDER/);
assert.match(route, /MASTER/);
assert.match(route, /TRACK_STEM_RENDER/);
assert.match(route, /GROUP_STEM_RENDER/);
assert.match(route, /INSTRUMENTAL/);
assert.match(route, /ACAPELLA/);
assert.match(route, /resolveCreativeProviderAssetUrl/);
assert.match(route, /current_revision: revision === currentRevision/);
assert.match(route, /technical_validation_available/);
assert.match(route, /technical_validation_passed/);
assert.match(route, /validation_current_revision/);
assert.match(route, /true_peak_certified/);
assert.match(route, /release_limiter_applied/);
assert.match(route, /provider_job_submitted: false/);
assert.match(route, /endpoint_mutation_performed: false/);

assert.match(panel, /Release masters & QC/);
assert.match(panel, /Current pre-master/);
assert.match(panel, /Current master/);
assert.match(panel, /RELEASE CANDIDATE/);
assert.match(panel, /HISTORICAL R/);
assert.match(panel, /LUFS/);
assert.match(panel, /True peak/);
assert.match(panel, /Waveform/);
assert.match(panel, /render_plan_fingerprint/);
assert.match(panel, /not certified/);

assert.match(workspace, /import MusicMasterStudioPanel/);
assert.match(workspace, /mode === "master"/);
assert.match(workspace, /<MusicMasterStudioPanel/);
assert.doesNotMatch(workspace, /MusicSpecialistStudioPanel mode="master"/);

console.log("AVANTIQO_MUSIC_MASTER_STUDIO_RELEASE_LIBRARY_AUDIT=PASS");
console.log("AVANTIQO_MUSIC_MASTER_LIBRARY=V2");
