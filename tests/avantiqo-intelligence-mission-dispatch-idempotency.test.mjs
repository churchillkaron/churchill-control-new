import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const executionEngine = fs.readFileSync(
  path.join(root, "lib/ubte/runtime/ExecutionEngine.js"),
  "utf8",
);
const dispatchRuntime = fs.readFileSync(
  path.join(root, "lib/operator/runtime/OperatorMissionDispatchRuntime.js"),
  "utf8",
);
const migration = fs.readFileSync(
  path.join(
    root,
    "supabase/migrations/20260902053633_operator_mission_dispatch_journal.sql",
  ),
  "utf8",
);

test("mission mutation journal is claimed before capability dispatch", () => {
  const claim = executionEngine.indexOf("await claimOperatorMissionDispatch");
  const recovery = executionEngine.indexOf("dispatchClaim.recovery_only");
  const dispatch = executionEngine.indexOf("await invokeLoadedCapability()");

  assert.ok(claim >= 0, "dispatch claim must exist");
  assert.ok(recovery > claim, "duplicate claim must be checked after claim");
  assert.ok(dispatch > recovery, "business mutation must occur only after claim and replay guard");
});

test("duplicate dispatch claims can only enter recovery, never replay", () => {
  assert.match(dispatchRuntime, /recovery_only:\s*true/);
  assert.match(dispatchRuntime, /OPERATOR_MISSION_DISPATCH_RECOVERY_REQUIRED/);
  assert.match(dispatchRuntime, /operatorMissionReplayAllowed\s*=\s*false/);
  assert.match(executionEngine, /throw missionDispatchRecoveryError\(dispatchClaim\)/);
});

test("successful registered verification closes the dispatch journal", () => {
  assert.match(executionEngine, /shouldVerifyOperatorMissionDispatch/);
  assert.match(executionEngine, /await markOperatorMissionStepVerified/);
  assert.match(dispatchRuntime, /state:\s*"verified"/);
});

test("uncertain mutation errors stay non-replayable", () => {
  assert.match(executionEngine, /state:\s*"uncertain"/);
  assert.match(dispatchRuntime, /replay_policy:\s*"verification_only"/);
});

test("database contract provides one claim per organization and dispatch key", () => {
  assert.match(
    migration,
    /unique \(organization_id, dispatch_key\)/,
  );
  assert.match(migration, /enable row level security/);
  assert.match(
    migration,
    /revoke all on table public\.operator_mission_dispatches from anon, authenticated/,
  );
});
