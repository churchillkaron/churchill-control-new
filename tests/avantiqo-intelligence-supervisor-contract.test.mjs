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
  assert.match(supervisor, /AVANTIQO_INTELLIGENCE_SUPERVISOR_V2/);
  assert.match(supervisor, /FAST MODE:/);
  assert.match(supervisor, /DEEP MODE:/);
  assert.match(supervisor, /AvantiqoStructuredIntelligenceSupervisorRuntime\.run/);
});

test("supervisor repairs before completion claims in deep mode", () => {
  assert.match(supervisor, /incorrect completion claims/);
  assert.match(supervisor, /If the goal is not genuinely complete, do not mark it completed/);
  assert.match(supervisor, /repair_needed/);
  assert.match(supervisor, /needs_human/);
});

test("structured supervisor separates natural cognition from JSON boundary compilation", () => {
  assert.match(structuredSupervisor, /AVANTIQO_STRUCTURED_INTELLIGENCE_SUPERVISOR_V2/);
  assert.match(structuredSupervisor, /Do not force your reasoning into JSON or any schema/);
  assert.match(structuredSupervisor, /structured_boundary_compilation: false/);
  assert.match(structuredSupervisor, /structured_boundary_compilation: true/);
  assert.match(structuredSupervisor, /response_format: \{ type: "json_object" \}/);
  assert.match(structuredSupervisor, /contract_compile/);
  assert.match(structuredSupervisor, /Return a concise corrected decision brief, not JSON/);
  assert.match(structuredSupervisor, /INVALID_COMPILED_JSON/);
});

test("reasoning loop exposes JSON mode only as an optional machine-boundary control", () => {
  assert.match(reasoningLoop, /response_format = null/);
  assert.match(reasoningLoop, /response_format \? \{ response_format: object\(response_format\) \} : \{\}/);
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
