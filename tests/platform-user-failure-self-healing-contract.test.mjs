import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");

function source(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

test("user failure capture authenticates scope, sanitizes evidence and deduplicates without entering business-event backlog", () => {
  const runtime = source("lib/platform/self-healing/PlatformUserFailureCaptureRuntime.js");

  assert.match(runtime, /PLATFORM_USER_FAILURE_CAPTURED/);
  assert.match(runtime, /requireOrganizationAccess/);
  assert.match(runtime, /derived_unambiguous_membership/);
  assert.match(runtime, /ambiguous_or_missing/);
  assert.match(runtime, /\.select\("id,active_organization_id,active"\)/);
  assert.match(runtime, /\.select\("organization_id,status"\)/);
  assert.doesNotMatch(runtime, /\.select\("id,organization_id,active_organization_id/);
  assert.match(runtime, /Bearer \[REDACTED\]/);
  assert.match(runtime, /raw_stack_stored:\s*false/);
  assert.match(runtime, /raw_request_body_stored:\s*false/);
  assert.match(runtime, /organization_client_claim_trusted:\s*false/);
  assert.match(runtime, /processed:\s*true/);
  assert.match(runtime, /error\.code !== "23505"/);
  assert.match(runtime, /deterministicUuid/);
});

test("browser capture beacon sends bounded semantic failure evidence and never sends organization or stack authority", () => {
  const beacon = source("components/platform/self-healing/PlatformFailureCaptureBeacon.js");

  assert.match(beacon, /\/api\/platform\/self-healing\/capture/);
  assert.match(beacon, /credentials:\s*"same-origin"/);
  assert.match(beacon, /keepalive:\s*true/);
  assert.match(beacon, /window\.location\.pathname/);
  assert.doesNotMatch(beacon, /organizationId/);
  assert.doesNotMatch(beacon, /organization_id/);
  assert.doesNotMatch(beacon, /error\.stack/);
});

test("Next error and not-found boundaries emit governed failure beacons", () => {
  const routedError = source("app/error.js");
  const globalError = source("app/global-error.js");
  const notFound = source("app/not-found.js");

  assert.match(routedError, /PlatformFailureCaptureBeacon/);
  assert.match(routedError, /category="runtime_exception"/);
  assert.match(globalError, /PlatformFailureCaptureBeacon/);
  assert.match(globalError, /category="runtime_exception"/);
  assert.match(notFound, /PlatformFailureCaptureBeacon/);
  assert.match(notFound, /category="route_not_found"/);
  assert.match(notFound, /statusCode=\{404\}/);
});

test("self-healing admin re-reads the exact captured event and fails closed before Code preparation", () => {
  const route = source("app/api/platform/admin/self-healing/route.js");

  assert.match(route, /USER_FAILURE_PREFIX = "user-failure:"/);
  assert.match(route, /\.eq\("id", eventId\)/);
  assert.match(route, /\.eq\("type", PLATFORM_USER_FAILURE_EVENT_TYPE\)/);
  assert.match(route, /maybeSingle\(\)/);
  assert.match(route, /classifyCapturedFailure\(stored\)/);
  assert.match(route, /ORGANIZATION_SCOPE_REQUIRED/);
  assert.match(route, /NON_CODE_CONFIGURATION/);
  assert.match(route, /PRODUCT_DECISION_REQUIRED/);
  assert.match(route, /browser_evidence_authoritative:\s*false/);
  assert.match(route, /original_browser_payload_authoritative:\s*false/);
  assert.match(route, /verification_requires_original_action_replay:\s*true/);
  assert.match(route, /preparePlatformSelfHealingCodeMission/);

  const reread = route.indexOf("loadCapturedUserFailure(signalKey)");
  const prepare = route.lastIndexOf("preparePlatformSelfHealingCodeMission({");
  assert.ok(reread >= 0);
  assert.ok(prepare > reread);
});

test("404 alone remains a product-intent question while known incomplete capabilities can auto-complete", () => {
  const route = source("app/api/platform/admin/self-healing/route.js");

  assert.match(route, /category === "capability_unimplemented" \|\| category === "workspace_unfinished"/);
  assert.match(route, /return "AUTO_COMPLETE"/);
  assert.match(route, /return "PRODUCT_DECISION_REQUIRED"/);
  assert.match(route, /The captured evidence does not establish a registered implementation contract strongly enough/);
});
