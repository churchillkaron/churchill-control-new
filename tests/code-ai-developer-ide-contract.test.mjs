import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const agent = await readFile(new URL("../scripts/code-device-agent.mjs", import.meta.url), "utf8");
const deviceRuntime = await readFile(new URL("../lib/code/runtime/CodeWorkspaceDeviceRuntime.js", import.meta.url), "utf8");
const workspaceRuntime = await readFile(new URL("../lib/code/runtime/CodeWorkspaceRuntime.js", import.meta.url), "utf8");
const mission = await readFile(new URL("../lib/code/runtime/CodeAIMissionRuntime.js", import.meta.url), "utf8");
const capability = await readFile(new URL("../lib/platform/capabilities/createCodeAIAutonomousCapability.js", import.meta.url), "utf8");
const ideRoute = await readFile(new URL("../app/api/operator/code/ide/route.js", import.meta.url), "utf8");
const imageProvider = await readFile(new URL("../lib/platform/service-runtime/providers/avantiqo-image/AvantiqoImageGenerateLocalQueueProvider.js", import.meta.url), "utf8");
const imageRoute = await readFile(new URL("../app/api/operator/code/image/route.js", import.meta.url), "utf8");
const nodeWorker = await readFile(new URL("../scripts/local-node/avantiqo-node01-worker.ps1", import.meta.url), "utf8");
const missionRoute = await readFile(new URL("../app/api/operator/code/mission/route.js", import.meta.url), "utf8");
const ide = await readFile(new URL("../components/creative/code/AvantiqoCodeIDE.jsx", import.meta.url), "utf8");
const studio = await readFile(new URL("../components/creative/code/CreativeCodeStudio.jsx", import.meta.url), "utf8");
const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

const propagationFiles = [
  "CodeAIEmployeeFastStartRuntime.js",
  "CodeAIEmployeeZeroIdleFastStartRuntime.js",
  "CodeAIAutonomousRuntime.js",
  "CodeAIWorkPackageDeterministicConvergenceRuntime.js",
  "CodeAIWorkPackageRuntimeV2.js",
  "CodeAIWorkPackageRuntimeLive.js",
];
const propagation = Object.fromEntries(await Promise.all(propagationFiles.map(async (name) => [name, await readFile(new URL(`../lib/code/runtime/${name}`, import.meta.url), "utf8")])));

test("device agent persists IDE session revision and edit lease state", () => {
  assert.match(agent, /revision:0,edit_owner:null,lease_expires_at:null/);
  assert.match(agent, /workspace\.attach/);
  assert.match(agent, /workspace\.ide_state/);
  assert.match(agent, /workspace\.ide_lease/);
  assert.match(agent, /workspace\.ide_write/);
  assert.match(agent, /CODE_DEVICE_IDE_REVISION_CONFLICT/);
  assert.match(agent, /CODE_DEVICE_EDIT_LEASE_HELD/);
});

test("device runtime can attach and exposes bounded IDE operations", () => {
  assert.match(deviceRuntime, /attachDeviceCodeWorkspace/);
  assert.match(deviceRuntime, /fileTree:/);
  assert.match(deviceRuntime, /acquireEditLease:/);
  assert.match(deviceRuntime, /releaseEditLease:/);
  assert.match(deviceRuntime, /ideWrite:/);
  assert.match(deviceRuntime, /actor: "CODE"/);
  assert.match(workspaceRuntime, /input\.session_id/);
  assert.match(workspaceRuntime, /runtime\.attach/);
});

test("attached missions hold CODE lease and preserve developer session after mission", () => {
  assert.match(mission, /device_session_id = null/);
  assert.match(mission, /owner: "CODE"/);
  assert.match(mission, /ide_edit_lease/);
  assert.match(mission, /if \(!device_session_id\) await workspace\.stop/);
});

test("device_session_id is a governed autonomous capability input", () => {
  assert.match(capability, /device_session_id: \{/);
  assert.match(capability, /const requestedDeviceSessionId/);
  assert.match(capability, /device_session_id: requestedDeviceSessionId/);
});

test("every employee and work-package runtime preserves the exact developer session", () => {
  for (const [name, source] of Object.entries(propagation)) {
    assert.match(source, /device_session_id:/, name);
  }
});

test("IDE API exposes only bounded governed workspace operations", () => {
  assert.match(ideRoute, /platform\.code\.ai\.execute/);
  for (const action of ["open", "attach", "state", "tree", "read", "lease", "write", "run", "diff", "browser", "close"]) {
    assert.match(ideRoute, new RegExp(`"${action}"`), action);
  }
  assert.match(ideRoute, /workspace\.ideWrite/);
  assert.match(ideRoute, /expected_revision/);
});

test("Developer Mode uses real Monaco xterm shared progress and exact session mission handoff", () => {
  assert.match(ide, /@monaco-editor\/react/);
  assert.match(ide, /@xterm\/xterm/);
  assert.match(ide, /useCodeProgressFeed/);
  assert.match(ide, /device_session_id: activeSession\.session_id/);
  assert.match(ide, /Code AI · Live/);
  assert.match(ide, /\/api\/operator\/code\/conversation/);
  assert.match(ide, /\/api\/operator\/code\/intervention/);
  assert.match(ide, /Send to running Code/);
  assert.match(ide, /CODE.*editing|leaseOwner/);
  assert.match(ide, /expected_revision: revision/);
  assert.match(ide, /\/api\/operator\/code\/ide/);
  assert.match(studio, /Developer Mode/);
});

test("Code Studio keeps Talk Code Preview and Changes in one shared project session", () => {
  assert.match(studio, /\{ id: "talk", label: "Talk"/);
  assert.match(studio, /\{ id: "code", label: "Code"/);
  assert.match(studio, /\{ id: "preview", label: "Preview"/);
  assert.match(studio, /\{ id: "changes", label: "Changes"/);
  assert.match(studio, /One project session · one active Code mission/);
  assert.match(studio, /onStudioViewChange=\{setStudioView\}/);
  assert.match(studio, /onPreviewUrlChange/);
  assert.match(studio, /Same project session · refresh after Code or manual edits/);
  assert.match(studio, /Back to Code/);
  assert.match(ide, /missionObjectiveFromConversation/);
  assert.match(ide, /explicitBuildFollowUp/);
  assert.match(ide, /do it\|build it\|build this/);
  assert.match(ide, /Conversation and approved visual context/);
  assert.match(ide, /Build this/);
  assert.match(ide, /Open in Code/);
  assert.match(ide, /Conversation context/);
  assert.match(ide, /Open full Talk/);
  assert.match(ide, /openStudioPreview/);
  assert.match(ide, /Code is working behind this conversation, and I’ll come back here with the verified result/);
});

test("editor and terminal dependencies are pinned in package metadata", () => {
  for (const name of ["monaco-editor", "@monaco-editor/react", "@xterm/xterm", "@xterm/addon-fit"]) {
    assert.ok(packageJson.dependencies?.[name] || packageJson.devDependencies?.[name], name);
  }
});

test("developer terminal mutations obey HUMAN lease and advance shared revision", () => {
  assert.match(ideRoute, /acquireEditLease\(\{ owner: "HUMAN"/);
  assert.match(ideRoute, /actor: "HUMAN"/);
  assert.match(deviceRuntime, /actor = "CODE"/);
  assert.match(agent, /workspace_mutated:mutated/);
  assert.match(agent, /if\(mutated\)\{s\.revision=Number\(s\.revision\|\|0\)\+1/);
});

test("read-only verification instructions are not polluted by implementation wrapper text", () => {
  assert.match(ide, /const explicitReadOnlyVerification = \/\\bnode\\s\+--check/);
  assert.match(ide, /if \(explicitReadOnlyVerification\) return latestInstruction\.slice\(0, 24000\)/);
});

test("Developer Mode visibly follows Code files while it reads checks edits and reviews", () => {
  assert.match(ide, /const latestObservedEvent = activityEvents\.find/);
  assert.match(ide, /latestObservedEvent\?\.file_path/);
  assert.match(ide, /return "Reading"/);
  assert.match(ide, /return "Checking"/);
  assert.match(ide, /return "Editing"/);
  assert.match(ide, /return "Reviewing changes"/);
  assert.match(ide, /latestFileAction/);
  assert.match(ide, /ideRequest\("read", \{ file_path: latestTouchedFile \}\)/);
  assert.match(ide, /event\?\.file_path \|\| event\?\.files_changed\?\.\[0\]/);
  assert.match(ide, /following Code live/);
  assert.match(ide, /onMount=\{\(editor\) => \{ editorRef\.current = editor; \}\}/);
  assert.match(ide, /editor\.revealLineInCenter\(startLine\)/);
  assert.match(ide, /editor\.setSelection/);
  assert.match(ide, /const \[learnMode, setLearnMode\] = useState\(true\)/);
  assert.match(ide, /Learn \{learnMode \? "on" : "off"\}/);
  assert.match(ide, /Why this step:/);
  assert.match(ide, /observableLearningNote/);
});

test("Talk remains available without an IDE session and attaches Code behind the conversation when repository work begins", () => {
  assert.match(ide, /if \(!message\) return/);
  assert.match(ide, /!session && !talkOnly/);
  assert.match(ide, /repository_url: session\?\.repository_url \|\| repositoryUrl\.trim\(\) \|\| null/);
  assert.match(ide, /device_session_id: session\?\.session_id \|\| null/);
  assert.match(ide, /missionSession = await openWorkspace\(\)/);
  assert.match(ide, /sessionOverride: missionSession/);
  assert.match(ide, /const activeSession = sessionOverride \|\| session/);
  assert.match(ide, /ideRequestWithSession\(activeSession/);
});

test("Talk history belongs to the project conversation instead of an IDE session", () => {
  assert.match(ide, /const key = `avantiqo:code-talk:\$\{organizationId\}`/);
  assert.doesNotMatch(ide, /avantiqo:code-talk:\$\{organizationId\}:\$\{session\.session_id\}/);
  const closeWorkspace = ide.match(/async function closeWorkspace\(\) \{[\s\S]*?\n  \}/)?.[0] || "";
  assert.doesNotMatch(closeWorkspace, /setChatTurns\(\[\]\)/);
});

test("Talk stays conversational while Code works behind the screen", () => {
  assert.match(ide, /session && codeOnly/);
  assert.match(ide, /<span>Thinking…<\/span>/);
  assert.match(ide, /<span>Working in Code…<\/span>/);
  assert.match(ide, /View live work/);
  assert.match(ide, /runCodeMission\(missionObjective, \{ reportToTalk: true, sessionOverride: missionSession \}\)/);
  assert.match(ide, /Done\. I checked it in the shared Code workspace/);
  assert.match(ide, /Done\. I finished the Code work and verified it/);
  assert.match(ide, /I hit a blocker while Code was working/);
  assert.match(ide, /codeOnly \? "border-b border-white\/\[0\.06\] p-3" : "hidden"/);
  assert.match(ide, /embedded && studioView !== "code"/);
  assert.match(ide, /studioView === "code" \? 3500 : 10000/);
});

test("Developer Mode can follow Code without overriding dirty human buffers", () => {
  assert.match(ide, /const \[followCode, setFollowCode\] = useState\(true\)/);
  assert.match(ide, /Follow Code \{followCode \? "on" : "off"\}/);
  assert.match(ide, /Object\.values\(dirty\)\.some\(Boolean\)/);
  assert.match(ide, /latestTouchedFile/);
  assert.match(ide, /setActivePath\(latestTouchedFile\)/);
});


test("Explorer index covers large repositories with hierarchical client-side navigation", () => {
  assert.match(agent, /sort\(\)\.slice\(0,20000\)/);
  assert.match(ide, /function buildExplorerTree/);
  assert.match(ide, /const \[expandedFolders, setExpandedFolders\] = useState/);
  assert.match(ide, /files\.filter\(\(file\) => file\.toLowerCase\(\)\.includes\(q\)\)/);
  assert.match(ide, /renderExplorerNodes\(explorerTree\)/);
  assert.match(ide, /Expand all/);
  assert.match(ide, /Collapse all/);
});


test("Strategic Code reasoning inspects the repository before research and specialist review", async () => {
  const strategic = await readFile(new URL("../lib/code/runtime/CodeAIStrategicReasoningRuntime.js", import.meta.url), "utf8");
  const inspectIndex = strategic.indexOf("strategic_initial_inspect");
  const researchIndex = strategic.indexOf("const research = await resolveStrategicResearch");
  const specialistIndex = strategic.indexOf("const specialistReview = await resolveParallelSpecialistCouncil");
  assert.ok(inspectIndex > 0);
  assert.ok(researchIndex > inspectIndex);
  assert.ok(specialistIndex > researchIndex);
  assert.match(strategic, /mission_id: text\(objectiveContext\.mission_id/);
});

test("Developer Mode publishes an authoritative mission identity before heavy planning", () => {
  assert.match(missionRoute, /const resumeStateMissionId = text\(resumeState\?\.mission_id/);
  assert.match(missionRoute, /const missionId = resumeStateMissionId \|\| resumeMissionId \|\| requestedMissionId/);
  assert.match(missionRoute, /publishCodeAILiveProgress/);
  assert.match(missionRoute, /phase: "MISSION_ACCEPTED"/);
  assert.match(missionRoute, /mission_id: missionId/);
  assert.match(missionRoute, /objective_context: \{[\s\S]*mission_id: missionId/);
  assert.match(mission, /mission_id = null/);
  assert.match(mission, /resume_state \|\| \(text\(mission_id\)/);
  assert.match(capability, /mission_id: text\(payload\.objective_context\?\.mission_id/);
});

test("IDE actions bind directly to a validated device session without enqueueing attach first", () => {
  assert.match(deviceRuntime, /bindDeviceCodeWorkspace/);
  assert.match(deviceRuntime, /bind: bindDeviceCodeWorkspace/);
  assert.match(ideRoute, /CodeWorkspaceRuntime\.bind/);
  assert.match(agent, /p_limit:4/);
  assert.match(agent, /handled\?75:350/);
});


test("Developer Mode uses a progress-aware watchdog instead of a fixed wall-clock cutoff", () => {
  assert.match(ide, /const MAX_RESUMES = 120/);
  assert.match(ide, /const MISSION_IDLE_DEADLINE_MS = 8 \* 60 \* 1000/);
  assert.match(ide, /const MISSION_ABSOLUTE_DEADLINE_MS = 30 \* 60 \* 1000/);
  assert.match(ide, /progressFingerprint/);
  assert.match(ide, /missionIdleDeadline = Date\.now\(\) \+ MISSION_IDLE_DEADLINE_MS/);
  assert.match(ide, /Code mission stalled without progress/);
  assert.match(ide, /Code mission absolute deadline exceeded/);
  assert.match(ide, /Code mission resume limit exceeded/);
});


test("Developer Mode exposes a real governed Stop mission control", () => {
  assert.match(ide, /const stopLiveMission = useCallback/);
  assert.match(ide, /action: "STOP"/);
  assert.match(ide, /next governed safe boundary/);
  assert.match(ide, /const \[localMissionId, setLocalMissionId\] = useState/);
  assert.match(ide, /const stopMissionId = currentActiveMissionId \|\| \(missionRunning \? localMissionId : ""\)/);
  assert.match(ide, /mission_id: missionId/);
  assert.match(ide, /for \(let attempt = 0; attempt < 20; attempt \+= 1\)/);
  assert.match(ide, /Stop mission/);
});

test("Developer Mode scopes live mission activity to its exact device session", () => {
  assert.match(ide, /const progressSessionId = text\(progress\?\.device_session_id\)/);
  assert.match(ide, /const sessionAgentActive = Boolean/);
  assert.match(ide, /progressSessionId === session\.session_id/);
  assert.match(ide, /const currentActiveMissionId = activeMissionProgress/);
  assert.match(ide, /pendingSteerRef/);
  assert.match(ide, /submitLiveSteer\(currentActiveMissionId/);
  assert.match(ide, /action: "STEER"/);
  assert.doesNotMatch(ide, /disabled=\{missionRunning \|\| sessionAgentActive/);
  assert.doesNotMatch(ide, /disabled=\{missionRunning \|\| agentActive/);
});


test("Follow Code opens the actual changed file from shared Git diff on revision change", () => {
  assert.match(ide, /const diff = await ideRequest\("diff"\)/);
  assert.match(ide, /const changedPath = \(Array\.isArray\(diff\.status\)/);
  assert.match(ide, /setActivePath\(changedPath\)/);
  assert.match(ide, /setTabs\(\(current\) => current\.includes\(changedPath\)/);
});


test("Developer Mode resumes from nested mission state even when envelope flag disagrees", () => {
  assert.match(ide, /const responseState = body\.resume_state \|\| body\.state \|\| null/);
  assert.match(ide, /responseState\?\.planner_pending/);
  assert.match(ide, /\["planner_pending", "repair_required", "verification_required"\]\.includes\(responseStatus\)/);
});

test("Talk feed follows live work without fighting intentional history scroll", () => {
  assert.match(ide, /const talkFeedRef = useRef\(null\)/);
  assert.match(ide, /const talkFeedPinnedRef = useRef\(true\)/);
  assert.match(ide, /feed\.scrollTo\(\{ top: feed\.scrollHeight/);
  assert.match(ide, /element\.scrollHeight - element\.scrollTop - element\.clientHeight < 72/);
});

test("Talk mode stays conversational while every reasoning request remains visibly active", () => {
  assert.match(ide, /role: "assistant_pending"/);
  assert.match(ide, /<span>Thinking…<\/span>/);
  assert.match(ide, /settlePendingReply/);
  assert.match(ide, /removePendingReply/);
  assert.doesNotMatch(ide, /Code working live/);
  assert.doesNotMatch(ide, /repository unchanged unless Code enters a governed mission/);
});

test("Node01 image generation exposes governed end-to-end cancellation", () => {
  assert.match(imageProvider, /async cancel\(input = \{\}\)/);
  assert.match(imageProvider, /CANCELLED_BY_CALLER/);
  assert.match(imageProvider, /AVANTIQO_LOCAL_IMAGE_GENERATE_STATUS_SCOPE_REQUIRED/);
  assert.match(imageProvider, /\.eq\("organization_id", organizationId\)/);
  assert.match(imageProvider, /status: "cancelled"/);
  assert.match(imageRoute, /export async function DELETE/);
  assert.match(imageRoute, /AvantiqoImageProvider\.cancel/);
  assert.match(nodeWorker, /EnsureImageServer\(\$Job\)/);
  assert.match(nodeWorker, /phase='IMAGE_SERVER_START'/);
  assert.match(nodeWorker, /sdcpp\/v1\/jobs\/\$warmJobId\/cancel/);
  assert.match(nodeWorker, /AVANTIQO_LOCAL_IMAGE_GENERATE_CANCELLED/);
  assert.match(nodeWorker, /StopImageServerForExclusiveGpu/);
  assert.match(ide, /cancelImageGeneration/);
  assert.match(ide, /cancelDesignPreviewAsset/);
  assert.match(ide, /direction_image_job_ids/);
  assert.match(ide, /direction_image_cancel_requested/);
  assert.match(ide, /onQueued: setDirectionJob/);
  assert.match(ide, /Stop image/);
  assert.match(ide, /statusBody\.status === "cancelled"/);
  assert.match(ide, /body\.status === "cancelled"/);
  assert.match(ide, /method: "DELETE"/);
  assert.match(ide, /Stopping…/);
});

test("Node01 image progress preserves real queue state underneath the conversational Talk UI", () => {
  assert.match(imageProvider, /node_id: row\.node_id \|\| null/);
  assert.match(imageProvider, /metrics: object\(row\.metrics\)/);
  assert.match(ide, /compute_status: computeStatus/);
  assert.match(ide, /compute_node_id: statusBody\?\.node_id \|\| null/);
  assert.match(ide, /compute_status === "processing"/);
  assert.match(ide, /Generating image\.\.\./);
  assert.match(ide, /Preparing image\.\.\./);
});

test("Talk mode keeps visual and image work visibly active without developer telemetry", () => {
  assert.match(ide, /role: "visual_pending"/);
  assert.match(ide, /role: "image_pending"/);
  assert.match(ide, /Preparing visual\.\.\./);
  assert.match(ide, /Generating image\.\.\./);
  assert.match(ide, /Stopping\.\.\./);
  assert.doesNotMatch(ide, /Live visual sketch/);
  assert.doesNotMatch(ide, /Node01 image render/);
  assert.doesNotMatch(ide, /local GPU active/);
});
