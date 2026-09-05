import assert from "node:assert/strict";
import fs from "node:fs";

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const orchestration = read("lib/creative/studio/runtime/CreativeVideoStudioOrchestrationRuntime.js");
const route = read("app/api/creative/studio/orchestration/route.js");
const shell = read("components/creative/ProductionStudio/ProductionStudio.jsx");
const header = read("components/creative/ProductionStudio/layout/Header.jsx");
const sidebar = read("components/creative/ProductionStudio/layout/Sidebar.jsx");
const canvas = read("components/creative/ProductionStudio/layout/Canvas.jsx");

assert.match(orchestration, /CREATIVE_VIDEO_STUDIO_ORCHESTRATION_V1/);
assert.match(orchestration, /production/);
assert.match(orchestration, /timeline/);
assert.match(orchestration, /FINAL_RENDER/);
assert.match(orchestration, /RELEASE_READINESS_REPORT/);
assert.match(orchestration, /PUBLISH_COMMAND/);
assert.match(orchestration, /PUBLISH_EXECUTION/);
assert.match(orchestration, /external_publication_id/);
assert.match(orchestration, /external_publication_url/);
assert.match(orchestration, /scope.*FINAL_RENDER|"FINAL_RENDER"/s);
assert.match(orchestration, /scope.*PUBLISH_RELEASE|"PUBLISH_RELEASE"/s);
assert.match(orchestration, /release\.status === "COMPLETE"/);
assert.match(orchestration, /next_action/);

assert.match(route, /force-dynamic/);
assert.match(route, /runtime = "nodejs"/);
assert.match(route, /requireOrganizationAccess/);
assert.match(route, /creative\.quality\.evaluate/);
assert.match(route, /CreativeVideoStudioOrchestrationRuntime\.inspect/);

assert.match(shell, /useCreativeOrchestration/);
assert.match(shell, /orchestrationRuntime: orchestration/);
assert.match(shell, /orchestration\.refresh/);

assert.match(header, /nextAction\.workspace/);
assert.match(header, /editor\.setActiveWorkspace\(nextAction\.workspace\)/);
assert.match(header, /film flow complete/);
assert.match(header, /currentPhase\.detail/);

assert.match(sidebar, /timeline: \{ label: "Edit"/);
assert.match(sidebar, /render: \{ label: "Mastering"/);
assert.match(sidebar, /publishing: \{ label: "Release"/);
assert.match(sidebar, /orchestration\?\.phases/);
assert.match(sidebar, /Evidence complete/);
assert.match(sidebar, /Approval required/);
assert.match(sidebar, /Needs attention/);

assert.match(canvas, /timeline: "Edit"/);
assert.match(canvas, /render: "Mastering"/);
assert.match(canvas, /publishing: "Release"/);
assert.match(canvas, /currentPhase\.status/);

console.log("AVANTIQO_VIDEO_STUDIO_ORCHESTRATION_CONTRACT=PASS");
