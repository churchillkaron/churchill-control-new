import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  buildCreativeStillConversationContinuity,
} from "../lib/creative/stills/runtime/CreativeStillConversationContinuityRuntime.js";

const state = {
  objective: "Create a premium Churchill live-music poster",
  constraints: ["Use the real artist photo", "Keep the layout calm"],
  decisions: ["Artist stays in the center image"],
  progress_summary: "Three-image middle composition is the active direction",
};

test("image follow-ups preserve one creative continuity key", () => {
  const first = buildCreativeStillConversationContinuity({ request: "Move the artist left", project_state: state });
  const second = buildCreativeStillConversationContinuity({ request: "Give the headline more space", project_state: state });
  assert.equal(first.continuity_key, second.continuity_key);
  assert.equal(first.active, true);
  assert.notEqual(first.current_request, second.current_request);
});
test("continuity carries accepted creative constraints into working context", () => {
  const continuity = buildCreativeStillConversationContinuity({ request: "Make it calmer", project_state: state });
  assert.match(continuity.working_context, /Use the real artist photo/);
  assert.match(continuity.working_context, /Artist stays in the center image/);
  assert.match(continuity.working_context, /Make it calmer/);
});

test("fresh image request starts without false prior continuity", () => {
  const continuity = buildCreativeStillConversationContinuity({ request: "Create a square product poster" });
  assert.equal(continuity.active, false);
  assert.ok(continuity.continuity_key);
  assert.equal(continuity.objective, "Create a square product poster");
});

test("Business Partner passes durable project state through UBTE to Image Studio", () => {
  const operator = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntimeCore.js", "utf8");
  const capability = fs.readFileSync("lib/creative/stills/capabilities/planWorldClassImageStudio.js", "utf8");
  assert.match(operator, /operatorProjectState: normalizeOperatorProjectState\(projectState\)/);
  assert.match(operator, /conversationId,\n\s+projectState,/);
  assert.match(capability, /context\?\.metadata\?\.operatorProjectState/);
  assert.match(capability, /conversation_continuity: continuity/);
});
