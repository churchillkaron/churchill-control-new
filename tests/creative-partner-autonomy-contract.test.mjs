import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [
  scheduler,
  cronRoute,
  partner,
  repair,
  stateRepository,
] = await Promise.all([
  readFile("lib/creative/partner/runtime/CreativePartnerSchedulerRuntime.js", "utf8"),
  readFile("app/api/creative/execution/process/route.js", "utf8"),
  readFile("lib/creative/partner/runtime/CreativePartnerMissionRuntime.js", "utf8"),
  readFile("lib/creative/quality/runtime/CreativeAutonomousRepairDirectorRuntime.js", "utf8"),
  readFile("lib/creative/state/CreativeStateRepository.js", "utf8"),
]);

test("existing protected Creative worker wakes Partner missions", () => {
  assert.match(cronRoute, /CreativePartnerSchedulerRuntime/);
  assert.match(cronRoute, /CreativePartnerSchedulerRuntime\.process/);
  assert.match(cronRoute, /CRON_SECRET/);
  assert.match(cronRoute, /CREATIVE_EXECUTION_WORKER_SECRET/);
});

test("scheduler only scans active production states", () => {
  assert.match(stateRepository, /PRODUCING/);
  assert.match(stateRepository, /RENDERING/);
  assert.match(stateRepository, /REVIEWING/);
  assert.match(stateRepository, /MONITORING/);
  assert.match(stateRepository, /execution_lock/);
  assert.match(scheduler, /listActiveProduction/);
});

test("active Partner ticks resume production without replaying planning", () => {
  assert.match(partner, /ACTIVE_PRODUCTION_STAGES/);
  assert.match(partner, /resumeExistingProduction/);
  assert.match(partner, /ProductionRuntime\.runProduction/);
  assert.match(partner, /planning_replayed:\s*false/);
});

test("autonomous repair is structured and promptless", () => {
  assert.match(repair, /CREATIVE_STRUCTURED_AUTONOMOUS_REPAIR_V1/);
  assert.match(repair, /repair_specification/);
  assert.match(repair, /promptless_source_of_truth:\s*true/);
  assert.match(repair, /function promptlessInput/);
  assert.doesNotMatch(repair, /prompt:\s*\[/);
  assert.doesNotMatch(repair, /provider_prompt\s*\|\|/);
});

test("mission-facing scheduler never exposes provider selection or reasoning", () => {
  assert.match(scheduler, /provider_selection_exposed:\s*false/);
  assert.match(scheduler, /raw_reasoning_persisted:\s*false/);
  assert.match(cronRoute, /provider_selection_exposed:\s*false/);
  assert.match(cronRoute, /raw_reasoning_persisted:\s*false/);
});
