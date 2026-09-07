import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("visit scanner requires a pest name when activity is observed", async () => {
  const scanner = await source("components/workspace/operations/pest-control/PestControlVisitMonitoringScanner.jsx");
  assert.match(scanner, /activityObserved = normalized\(form\.activityLevel\) !== "none"/);
  assert.match(scanner, /Identify the pest before saving observed activity/);
  assert.match(scanner, /required=\{activityObserved\}/);
});

test("visit monitoring API rejects anonymous pest activity", async () => {
  const route = await source("app/api/service-management/monitoring-round/check/route.js");
  assert.match(route, /activityLevel !== "none" && !pestName/);
  assert.match(route, /Identify the pest before recording observed activity/);
  assert.match(route, /pest_name: activityLevel === "none" \? null : pestName/);
});

test("Pest Control exposes People qualification authority as a governed cross-domain tool", async () => {
  const profile = await source("lib/operations/presentation/PestControlOperationsProfile.js");
  assert.match(profile, /id: "qualifications"/);
  assert.match(profile, /route: "\/people\/qualifications"/);
  assert.match(profile, /People owns workforce authority and qualification evidence/);
});
