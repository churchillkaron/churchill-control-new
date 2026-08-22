import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const supervisor = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoIntelligenceSupervisorRuntime.js", import.meta.url),
  "utf8",
);
const structuredSupervisor = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime.js", import.meta.url),
  "utf8",
);
const reasoningLoop = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoIntelligenceReasoningRuntime.js", import.meta.url),
  "utf8",
);
const businessAgent = fs.readFileSync(
  new URL("../lib/intelligence/runtime/BusinessIntelligenceAgentRuntime.js", import.meta.url),
  "utf8",
);

test("supervisor implements shared fast and deep owned brain modes", () => {
  assert.match(supervisor, /AVANTIQO_INTELLIGENCE_SUPERVISOR_V1/);
  assert.match(supervisor, /FAST MODE:/);
  assert.match(supervisor, /DEEP MODE:/);
  assert.match(supervisor, /reason_act_observe/);
  assert.match(supervisor, /critique_repair/);
});

test("supervisor repairs before completion claims in deep mode", () => {
  assert.match(supervisor, /incorrect completion claims/);
  assert.match(supervisor, /If the goal is not genuinely complete, do not mark it completed/);
  assert.match(supervisor, /repair_needed/);
  assert.match(supervisor, /needs_human/);
});

test("structured supervisor can wrap existing governed decision contracts", () => {
  assert.match(structuredSupervisor, /AVANTIQO_STRUCTURED_INTELLIGENCE_SUPERVISOR_V1/);
  assert.match(structuredSupervisor, /reason_act_observe/);
  assert.match(structuredSupervisor, /critique_repair/);
  assert.match(structuredSupervisor, /Do not change the required JSON schema/);
  assert.match(structuredSupervisor, /INVALID_REPAIR_JSON/);
});

test("reasoning loop is locked to owned Avantiqo Intelligence", () => {
  assert.match(reasoningLoop, /const OWNED_PROVIDER = "avantiqo-intelligence"/);
  assert.match(reasoningLoop, /allowed_providers:\s*\[OWNED_PROVIDER\]/);
  assert.match(reasoningLoop, /AVANTIQO_INTELLIGENCE_TOOL_CALL_REPLAY_DETECTED/);
  assert.match(reasoningLoop, /AVANTIQO_INTELLIGENCE_TOOL_CALL_LIMIT_EXCEEDED/);
});

test("business intelligence agent uses supervisor and read-only tools", () => {
  assert.match(businessAgent, /AvantiqoIntelligenceSupervisorRuntime\.run/);
  assert.match(businessAgent, /allow_mutating_tools:\s*false/);
  assert.match(businessAgent, /business_roi_read/);
  assert.match(businessAgent, /business_channel_analysis_read/);
});
