import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import {
  projectCodeAIEngineeringHotspotPreflight,
  formatCodeAIEngineeringHotspotPreflightForObjective,
} from "../lib/code/runtime/CodeAIEngineeringHotspotPreflightRuntime.js";

test("recurring engineering hotspots become bounded first-pass advisory evidence", () => {
  const preflight = projectCodeAIEngineeringHotspotPreflight({ items: [
    { priority: "P1", area: "caller_fanout", occurrence_count: 4, max_score: 88, recommendation: "Inspect shared boundary", affected_paths: ["lib/shared.js", "app/a.js"] },
    { priority: "P0", area: "verification_failure", occurrence_count: 1, max_score: 100, recommendation: "Run verifier before mutation", affected_paths: [] },
    { priority: "P2", area: "one_off", occurrence_count: 1, max_score: 25, recommendation: "Ignore one-off noise" },
  ] });

  assert.equal(preflight.contract, "AVANTIQO_CODE_AI_ENGINEERING_HOTSPOT_PREFLIGHT_V1");
  assert.equal(preflight.active, true);
  assert.equal(preflight.hotspot_count, 2);
  assert.equal(preflight.items[0].area, "verification_failure");
  assert.ok(preflight.items.some((item) => item.area === "caller_fanout"));
  assert.ok(!preflight.items.some((item) => item.area === "one_off"));
  assert.equal(preflight.repository_evidence_remains_authoritative, true);
  assert.equal(preflight.historical_patch_replay_allowed, false);
  assert.equal(preflight.automatic_source_mutation_authority, false);
  assert.equal(preflight.commit_authority, false);
  assert.equal(preflight.production_deploy_authority, false);
});

test("hotspot preflight objective demands current-head validation and preserves authority boundaries", () => {
  const preflight = projectCodeAIEngineeringHotspotPreflight({ items: [
    { priority: "P0", area: "caller_fanout", occurrence_count: 3, max_score: 95, recommendation: "Inspect all observed consumers", affected_paths: ["lib/shared.js", "app/a.js"] },
  ] });
  const formatted = formatCodeAIEngineeringHotspotPreflightForObjective(preflight);
  assert.match(formatted, /RECURRING ENGINEERING HOTSPOT PREFLIGHT/);
  assert.match(formatted, /Revalidate every historical signal against the current repository head/);
  assert.match(formatted, /Repository evidence is authoritative/);
  assert.match(formatted, /caller_fanout/);
  assert.match(formatted, /lib\/shared\.js/);
  assert.match(formatted, /no source-mutation, commit, deployment/);
});

test("canonical work package binds recurring hotspots before strategic execution", async () => {
  const runtime = await readFile("lib/code/runtime/CodeAIWorkPackageRuntime.js", "utf8");
  assert.match(runtime, /resolveEngineeringHotspotPreflight/);
  assert.match(runtime, /listCodeAIMissionHistory/);
  assert.match(runtime, /verifiedOnly: true/);
  assert.match(runtime, /repositoryUrl: input\.repository_url/);
  assert.match(runtime, /stateWithEngineeringHotspotPreflight/);
  assert.match(runtime, /objectiveWithEngineeringHotspotPreflight/);
  assert.match(runtime, /engineering_hotspot_preflight/);
  assert.match(runtime, /recurring_hotspots_inform_first_pass_strategy: true/);
  assert.match(runtime, /engineering_hotspot_mutation_authority: false/);
});
