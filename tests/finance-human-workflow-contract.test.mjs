import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const workflowPolicy = fs.readFileSync(
  new URL("../lib/finance/ui/FinanceHumanWorkflowPolicy.js", import.meta.url),
  "utf8",
);
const presentationPolicy = fs.readFileSync(
  new URL("../lib/finance/ui/FinanceCapabilityPresentation.js", import.meta.url),
  "utf8",
);
const areaHub = fs.readFileSync(
  new URL("../components/workspace/finance/FinanceAreaHub.jsx", import.meta.url),
  "utf8",
);
const runtimeManifest = JSON.parse(
  fs.readFileSync(
    new URL("../lib/finance/runtime/financeCapabilityRuntimeManifest.json", import.meta.url),
    "utf8",
  ),
);

test("Finance human workflow has explicit human handoffs from preparation through close", () => {
  for (const stage of ["prepare", "client", "review", "changes", "partner", "close"]) {
    assert.match(workflowPolicy, new RegExp(`id: \\"${stage}\\"`));
  }

  assert.match(workflowPolicy, /ownerRole: "PREPARER"/);
  assert.match(workflowPolicy, /ownerRole: "REVIEWER"/);
  assert.match(workflowPolicy, /ownerRole: "PARTNER"/);
  assert.match(workflowPolicy, /WAITING_ON_CLIENT/);
  assert.match(workflowPolicy, /READY_FOR_REVIEW/);
  assert.match(workflowPolicy, /CHANGES_REQUESTED/);
  assert.match(workflowPolicy, /reviewed_pending_partner/);
});

test("Finance priority policy protects human attention from waiting work", () => {
  const changesIndex = workflowPolicy.indexOf('status === "CHANGES_REQUESTED"');
  const blockedIndex = workflowPolicy.indexOf('status === "BLOCKED"');
  const inProgressIndex = workflowPolicy.indexOf('status === "IN_PROGRESS"');
  const waitingIndex = workflowPolicy.indexOf('status === "WAITING_ON_CLIENT"');

  assert.ok(changesIndex >= 0 && blockedIndex > changesIndex);
  assert.ok(inProgressIndex > blockedIndex);
  assert.ok(waitingIndex > inProgressIndex);
  assert.match(workflowPolicy, /do not let it displace work the team can execute now/);
});

test("Every declared Finance runtime capability can override stale planned presentation state", () => {
  assert.ok(Object.keys(runtimeManifest).length >= 60);
  assert.match(presentationPolicy, /runtimeBacked && declaredStatus\.toLowerCase\(\) === "planned"/);
  assert.match(presentationPolicy, /item\.status = readiness\.effectiveStatus/);
  assert.match(presentationPolicy, /runtime_backed: readiness\.runtimeBacked/);
  assert.match(presentationPolicy, /effective_status:/);
});

test("Finance UI still protects genuinely unavailable capabilities", () => {
  assert.match(areaHub, /"planned", "blocked", "disabled", "unavailable"/);
  assert.match(presentationPolicy, /declaredStatus\.toLowerCase\(\) === "planned"/);
  assert.doesNotMatch(presentationPolicy, /declaredStatus\.toLowerCase\(\) === "blocked"[\s\S]*effectiveStatus:\s*"active"/);
});
