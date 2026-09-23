import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("all-rating auto-publish can coexist with critical recovery", () => {
  const runtime = source("lib/commercial/reputation/ReputationAutomationRuntime.js");
  assert.match(runtime, /auto_publish_min_rating \?\? 5/);
  assert.match(runtime, /critical_max_rating \?\? 2/);
  assert.match(runtime, /if \(critical\) await createRecoveryCase/);
  assert.doesNotMatch(runtime, /!critical && rating >=/);
  assert.match(runtime, /allowed_providers: \["avantiqo-intelligence"\]/);
  assert.doesNotMatch(runtime, /provider_id: "openai"/);
});

test("review sync only processes explicitly mapped Google locations", () => {
  const runtime = source("lib/commercial/reputation/ReputationAutomationRuntime.js");
  assert.match(runtime, /\.not\("entity_id", "is", null\)/);
  assert.match(runtime, /GOOGLE_LOCATION_MAPPING_REQUIRED/);
});

test("historical backfill can settle up to 500 reviews with bounded concurrency", () => {
  const runtime = source("lib/commercial/reputation/ReputationAutomationRuntime.js");
  assert.match(runtime, /Math\.min\(Math\.max\(Number\(limit\) \|\| 25, 1\), 500\)/);
  assert.match(runtime, /Math\.min\(8, reviews\.length\)/);
  assert.match(runtime, /limit: historicalBackfill \? 500 : 100/);
});

test("successful discovery clears stale Google approval state", () => {
  const profile = source("lib/commercial/reputation/googleBusinessProfile.js");
  assert.match(profile, /location_discovery_failures: 0/);
  assert.match(profile, /location_discovery_requires_project_approval: false/);
});

test("review autopilot runs every fifteen minutes", () => {
  const vercel = JSON.parse(source("vercel.json"));
  const job = vercel.crons.find(
    (row) => row.path === "/api/internal/reputation/google-reviews/process"
  );
  assert.equal(job?.schedule, "*/15 * * * *");
});

test("transient review infrastructure failures preserve retry budget for the next cron", () => {
  const runtime = source("lib/commercial/reputation/ReputationAutomationRuntime.js");
  assert.match(runtime, /function isTransientReviewInfrastructureError/);
  assert.match(runtime, /"pgrst203"/);
  assert.match(runtime, /"model_policy_rejected"/);
  assert.match(runtime, /"no priced executable provider"/);
  assert.match(runtime, /response_status: "NEEDS_REVIEW"/);
  assert.match(runtime, /response_attempts: attempts/);
  assert.match(runtime, /return deferInfrastructureRetry\(claimed, generationError\)/);
  assert.match(runtime, /return deferInfrastructureRetry\(claimed, error\)/);
  assert.match(runtime, /deferInfrastructureRetry\(review, processingError\)/);
});
