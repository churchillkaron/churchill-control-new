import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const provider = await readFile(
  "components/operator/CodeProgressFeedProvider.jsx",
  "utf8",
);
const businessPartnerWorkspace = await readFile(
  "components/operator/BusinessPartnerCodeMissionPanel.jsx",
  "utf8",
);
const activeMission = await readFile(
  "components/operator/BusinessPartnerActiveCodeMissionPanel.jsx",
  "utf8",
);
const intelligenceFeed = await readFile(
  "components/operator/CodeEngineeringIntelligenceLiveCard.jsx",
  "utf8",
);
const codeStudio = await readFile(
  "components/creative/code/CreativeCodeStudio.jsx",
  "utf8",
);
const codeStudioPage = await readFile(
  "app/(system)/workspace/[organizationId]/creative/code/page.jsx",
  "utf8",
);
const lifecycleReceipt = await readFile(
  "lib/code/runtime/CodeAIEngineeringSkillVisibleReceiptRuntime.js",
  "utf8",
);
const missionRuntime = await readFile(
  "lib/code/runtime/CodeAIMissionRuntime.js",
  "utf8",
);

function count(source, token) {
  return source.split(token).length - 1;
}

test("shared provider is the only Code progress poll owner on Home and Code Studio", () => {
  const progressEndpoint = "/api/operator/code/progress?organizationId=";
  assert.equal(count(provider, progressEndpoint), 1);
  assert.equal(count(activeMission, progressEndpoint), 0);
  assert.equal(count(intelligenceFeed, progressEndpoint), 0);
  assert.equal(count(codeStudio, progressEndpoint), 0);
  assert.match(provider, /AVANTIQO_CODE_PROGRESS_SHARED_FEED_V1/);
  assert.match(provider, /single_progress_poll_per_surface:\s*true/);
});

test("Home Business Partner does not mount a duplicate Code progress poll owner", () => {
  assert.match(businessPartnerWorkspace, /return null/);
  assert.doesNotMatch(businessPartnerWorkspace, /CodeProgressFeedProvider/);
  assert.match(activeMission, /useCodeProgressFeed/);
  assert.match(activeMission, /data-avantiqo-code-progress-consumer="shared-provider"/);
  assert.match(intelligenceFeed, /useCodeProgressFeed/);
  assert.match(intelligenceFeed, /data-avantiqo-code-progress-consumer="shared-provider"/);
});

test("Code Studio shares one progress provider between studio and roadmap intelligence", () => {
  assert.match(codeStudioPage, /CodeProgressFeedProvider/);
  assert.match(codeStudioPage, /data-avantiqo-code-progress-poll-owner="shared-provider"/);
  assert.match(codeStudio, /useCodeProgressFeed/);
  assert.match(codeStudio, /data-avantiqo-code-progress-consumer="shared-provider"/);
  assert.match(intelligenceFeed, /useCodeProgressFeed/);
});

test("Business Partner keeps intervention control separate from progress polling", () => {
  assert.match(activeMission, /\/api\/operator\/code\/intervention/);
  assert.match(activeMission, /ACTIVE_CONTROL_POLL_MS/);
  assert.match(activeMission, /IDLE_CONTROL_POLL_MS/);
  assert.doesNotMatch(activeMission, /AVANTIQO_BUSINESS_PARTNER_CODE_PROGRESS_FAILED/);
  assert.match(activeMission, /AVANTIQO_BUSINESS_PARTNER_CODE_CONTROL_FAILED/);
});

test("Code Studio Strict Mode mount guard resets true on setup and false on cleanup", () => {
  assert.match(codeStudio, /const mounted = useRef\(false\)/);
  assert.match(codeStudio, /mounted\.current = true/);
  assert.match(codeStudio, /return \(\) => \{\s*mounted\.current = false;/s);
  assert.doesNotMatch(codeStudio, /useEffect\(\(\) => \(\) => \{ mounted\.current = false;/);
});

test("mission activity explicitly refreshes the shared feed without adding a timer", () => {
  assert.match(codeStudio, /requestRefresh/);
  assert.doesNotMatch(codeStudio, /ACTIVE_POLL_MS/);
  assert.doesNotMatch(codeStudio, /PASSIVE_POLL_MS/);
  assert.doesNotMatch(codeStudio, /setTimeout\(poll/);
  assert.match(activeMission, /requestRefresh\(\)/);
});

test("engineering lifecycle receipt reads are hot-deduplicated by full security scope", () => {
  assert.match(lifecycleReceipt, /HOT_CACHE_TTL_MS = 4000/);
  assert.match(lifecycleReceipt, /HOT_CACHE_MAX_ENTRIES = 64/);
  assert.match(lifecycleReceipt, /const inFlightLoads = new Map\(\)/);
  assert.match(lifecycleReceipt, /orgId,\s*actor,\s*mission,/s);
  assert.match(lifecycleReceipt, /normalizedRepository\(repositoryUrl\)/);
  assert.match(lifecycleReceipt, /text\(ref, 160\)\.toLowerCase\(\)/);
  assert.match(lifecycleReceipt, /if \(existing\) return existing/);
  assert.match(lifecycleReceipt, /in_flight_load_deduplication:\s*true/);
  assert.match(lifecycleReceipt, /cache_scope:\s*"organization_actor_mission_repository_ref"/);
});

test("progress convergence does not add commit deploy or knowledge authority", () => {
  assert.match(lifecycleReceipt, /contains_raw_reasoning:\s*false/);
  assert.match(lifecycleReceipt, /contains_raw_source:\s*false/);
  assert.match(lifecycleReceipt, /contains_raw_patch:\s*false/);
  assert.match(lifecycleReceipt, /automatic_knowledge_promotion:\s*false/);
  assert.match(lifecycleReceipt, /authorization_effect:\s*"NONE"/);
  assert.match(codeStudio, /Governed engineering · commit and deploy gated/);
  assert.match(codeStudio, /governedDeliveryReady/);
  assert.match(codeStudio, /\/api\/operator\/code\/review/);
  assert.match(codeStudio, /\/api\/operator\/code\/commit/);
  assert.match(codeStudio, /\/api\/operator\/code\/release/);
});

const businessPartnerLiveRoute = await readFile(
  "app/api/operator/live-execution/route.js",
  "utf8",
);
const sharedLiveExecutionRuntime = await readFile(
  "lib/platform/runtime/AvantiqoLiveExecutionRuntime.js",
  "utf8",
);
const liveWorkPackage = await readFile(
  "lib/code/runtime/CodeAIWorkPackageRuntimeLive.js",
  "utf8",
);

test("Business Partner receives concrete Code event history through the shared live execution runtime", () => {
  assert.match(businessPartnerLiveRoute, /loadAvantiqoLiveExecution/);
  assert.match(businessPartnerLiveRoute, /\.\.\.sharedProgress/);
  assert.match(sharedLiveExecutionRuntime, /events: \[\.\.\.list\(previousState\.events\), compact\]\.slice\(-MAX_EVENTS\)/);
  assert.match(sharedLiveExecutionRuntime, /latest_event: compact/);
  assert.doesNotMatch(businessPartnerLiveRoute, /events: \[\],/);
});

test("Code live operations identify the actual file search or command being inspected", () => {
  assert.match(liveWorkPackage, /function operationProgressDescription/);
  assert.match(liveWorkPackage, /Reading.*\$\{filePath\}/s);
  assert.match(liveWorkPackage, /Searching repository code for/);
  assert.match(liveWorkPackage, /Running \$\{\[command, \.\.\.args\]\.join\(" "\)\}/);
  assert.match(liveWorkPackage, /description: operationProgressDescription\(operation, input\)/);
});

test("mission runtime publishes concrete repository activity from the first live-state inspection", () => {
  assert.match(missionRuntime, /function repositoryOperationProgress/);
  assert.match(missionRuntime, /REPOSITORY_OPERATION_RUNNING/);
  assert.match(missionRuntime, /REPOSITORY_OPERATION_COMPLETED/);
  assert.match(missionRuntime, /I’m checking the current repository head, project guidance, and verification setup/);
  assert.match(missionRuntime, /I’m opening/);
  assert.match(missionRuntime, /I’m searching the repository/);
  assert.match(missionRuntime, /I’m running/);
  assert.match(missionRuntime, /publishCodeAILiveProgress\(\{[\s\S]*repositoryOperationProgress\(operation, "running"\)/);
});
