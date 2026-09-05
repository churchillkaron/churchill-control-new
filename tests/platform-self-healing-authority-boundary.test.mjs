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

test("browser failure capture is evidence-only and cannot authorize Code execution", () => {
  const capture = source(
    "lib/platform/self-healing/PlatformUserFailureCaptureRuntime.js",
  );

  assert.match(capture, /PLATFORM_USER_FAILURE_SCHEMA_VERSION = 2/);
  assert.match(capture, /classification_candidate:\s*"EVIDENCE_ONLY"/);
  assert.match(capture, /autonomous_repair_eligible:\s*false/);
  assert.match(capture, /classification_requires_authoritative_reread:\s*true/);
  assert.match(capture, /autonomous_repair_requires_authoritative_reread:\s*true/);
  assert.doesNotMatch(capture, /classification_candidate:\s*classification/);
  assert.doesNotMatch(capture, /function recommendationFor/);
});

test("AUTO_COMPLETE requires an exact canonical ERP registry match with an explicit incomplete status", () => {
  const route = source("app/api/platform/admin/self-healing/route.js");

  assert.match(route, /getWorkspaceItemByRoute/);
  assert.match(route, /getWorkspaceItemByWorkspace/);
  assert.match(route, /AUTHORITATIVE_INCOMPLETE_STATUSES/);
  assert.match(route, /"planned"/);
  assert.match(route, /"incomplete"/);
  assert.match(route, /"unfinished"/);
  assert.match(route, /"unimplemented"/);
  assert.match(route, /if \(classification === "AUTO_COMPLETE"\)/);
  assert.match(route, /authoritativeIncompleteRegistryTarget/);
  assert.match(route, /if \(!registryProof\.proven\)/);
  assert.match(route, /classification:\s*"REGISTRY_PROOF_REQUIRED"/);
  assert.match(route, /authoritative_registry_proof:\s*registryProof\?\.evidence \|\| null/);
  assert.match(route, /classification_candidate_ignored/);
  assert.match(route, /browser_evidence_authoritative:\s*false/);
});

test("AUTO_REPAIR is only granted after canonical route authority is proven server-side", () => {
  const route = source("app/api/platform/admin/self-healing/route.js");

  assert.match(route, /category === "route_not_found"/);
  assert.match(route, /category === "runtime_exception"[\s\S]{0,300}return "AUTO_REPAIR_CANDIDATE"/);
  assert.match(route, /function authoritativeRepairRegistryTarget/);
  assert.match(route, /AUTO_REPAIR requires an exact browser-observed route/);
  assert.match(route, /getWorkspaceItemByRoute\(routeHint\)/);
  assert.match(route, /registered_route:\s*true/);
  assert.match(route, /if \(AUTHORITATIVE_INCOMPLETE_STATUSES\.has\(status\)\)/);
  assert.match(route, /cannot reclassify an unfinished product surface as AUTO_REPAIR/);
  assert.match(route, /if \(classification === "AUTO_REPAIR_CANDIDATE"\)/);
  assert.match(route, /classification:\s*"REPAIR_AUTHORITY_REQUIRED"/);
  assert.match(route, /classification = "AUTO_REPAIR"/);
  assert.match(route, /capability = registryProof\.evidence\.capability/);
  assert.match(route, /workspace = registryProof\.evidence\.workspace_id/);
  assert.match(route, /resolvedRoute = registryProof\.evidence\.route \|\| route/);
  assert.match(route, /browser_reported_route:\s*route/);
});

test("global observer captures uncaught errors and promise rejections without intercepting fetch", () => {
  const observer = source(
    "components/platform/self-healing/PlatformGlobalFailureObserver.js",
  );
  const layout = source("app/layout.jsx");

  assert.match(observer, /window\.addEventListener\("error", onWindowError\)/);
  assert.match(observer, /window\.addEventListener\("unhandledrejection", onUnhandledRejection\)/);
  assert.match(observer, /window\.removeEventListener\("error", onWindowError\)/);
  assert.match(observer, /window\.removeEventListener\("unhandledrejection", onUnhandledRejection\)/);
  assert.match(observer, /\/api\/platform\/self-healing\/capture/);
  assert.match(observer, /organizationId:\s*organizationId \|\| null/);
  assert.doesNotMatch(observer, /window\.fetch\s*=/);
  assert.doesNotMatch(observer, /globalThis\.fetch\s*=/);
  assert.doesNotMatch(observer, /XMLHttpRequest\.prototype/);
  assert.match(layout, /PlatformGlobalFailureObserver/);
  assert.match(layout, /<PlatformGlobalFailureObserver \/>/);
});