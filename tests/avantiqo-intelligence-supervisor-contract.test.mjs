import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const supervisor = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoIntelligenceSupervisorRuntime.js", import.meta.url),
  "utf8",
);
const cognitionRouter = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoCognitionRouterRuntime.js", import.meta.url),
  "utf8",
);
const structuredSupervisor = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoStructuredIntelligenceSupervisorRuntime.js", import.meta.url),
  "utf8",
);
const productAssessmentCompactor = fs.readFileSync(
  new URL("../lib/intelligence/runtime/AvantiqoProductRepositoryAssessmentPromptCompactor.js", import.meta.url),
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

test("supervisor implements adaptive owned fast and deep brain modes", () => {
  assert.match(supervisor, /AVANTIQO_INTELLIGENCE_SUPERVISOR_V3/);
  assert.match(supervisor, /AUTO_MODE = "auto"/);
  assert.match(supervisor, /FAST MODE:/);
  assert.match(supervisor, /DEEP MODE:/);
  assert.match(supervisor, /AvantiqoCognitionRouterRuntime\.route/);
  assert.match(supervisor, /AvantiqoStructuredIntelligenceSupervisorRuntime\.run/);
});

test("cognition router is deterministic before model execution and has risk floors", () => {
  assert.match(cognitionRouter, /AVANTIQO_COGNITION_ROUTER_V1/);
  assert.match(cognitionRouter, /deterministic_pre_model_routing: true/);
  assert.match(cognitionRouter, /high_risk_safety_floor: true/);
  assert.match(cognitionRouter, /CURRENT_EXTERNAL_EVIDENCE/);
  assert.match(cognitionRouter, /MUTATING_TOOL_AVAILABLE/);
  assert.match(cognitionRouter, /CONFLICTING_EVIDENCE/);
  assert.match(cognitionRouter, /MEMORY_REQUIRES_LIVE_READ/);
  assert.match(cognitionRouter, /irreversible_intent/);
  assert.match(cognitionRouter, /verification_required/);
  assert.match(cognitionRouter, /research_required/);
  assert.match(cognitionRouter, /from_fast_to_deep_if/);
  assert.match(cognitionRouter, /never_downgrade_if/);
});

test("supervisor escalates weak fast cognition to deep instead of bluffing", () => {
  assert.match(supervisor, /shouldEscalateFastResult/);
  assert.match(supervisor, /confidence.*0\.72/s);
  assert.match(supervisor, /AVANTIQO_FAST_TO_DEEP_ESCALATION_CONTEXT/);
  assert.match(supervisor, /FAST_PASS_CONFIDENCE_OR_VERIFICATION_INSUFFICIENT/);
  assert.match(supervisor, /cognition_escalated_from/);
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

test("Product decisions use one non-thinking fast structured pass with benchmark-bounded compacted evidence", () => {
  assert.match(structuredSupervisor, /PRODUCT_REPOSITORY_ASSESSMENT/);
  assert.match(structuredSupervisor, /PRODUCT_PERSISTENCE_DECISION/);
  assert.match(structuredSupervisor, /structured_supervisor_mode: "product_single_pass"/);
  assert.match(structuredSupervisor, /execution_lane: "fast"/);
  assert.match(structuredSupervisor, /private_reasoning_transport_expected: false/);
  assert.match(structuredSupervisor, /bounded_non_thinking_fast_lane: true/);
  assert.match(structuredSupervisor, /raw_reasoning_persisted: false/);
  assert.match(structuredSupervisor, /single_pass_structured_reasoning: true/);
  assert.match(structuredSupervisor, /PRODUCT_REPOSITORY_ASSESSMENT"\s*\? 2200/);
  assert.match(structuredSupervisor, /PRODUCT_PERSISTENCE_DECISION"\s*\? 8192/);
  assert.match(structuredSupervisor, /compactProductRepositoryAssessmentConversation/);
  assert.match(structuredSupervisor, /conversation: productConversation/);
  assert.match(structuredSupervisor, /Math\.min\(16384/);

  assert.match(productAssessmentCompactor, /AVANTIQO_PRODUCT_REPOSITORY_ASSESSMENT_MODEL_INPUT_V2/);
  assert.match(productAssessmentCompactor, /OPERATION = "PRODUCT_REPOSITORY_ASSESSMENT"/);
  assert.match(productAssessmentCompactor, /MAX_FIXED_EVIDENCE_CHARS = 1600/);
  assert.match(productAssessmentCompactor, /MAX_DYNAMIC_EVIDENCE_CHARS = 2400/);
  assert.match(productAssessmentCompactor, /MAX_MODEL_DYNAMIC_EVIDENCE_FILES = 6/);
  assert.match(productAssessmentCompactor, /MAX_SEARCH_MATCHES = 3/);
  assert.match(productAssessmentCompactor, /MAX_SEARCH_MATCH_CHARS = 260/);
  assert.match(productAssessmentCompactor, /MAX_TRACKED_FILE_SAMPLE = 30/);
  assert.match(productAssessmentCompactor, /MAX_INVENTORY_ARRAY = 30/);
  assert.match(productAssessmentCompactor, /full_runtime_snapshot_preserved: true/);
  assert.match(productAssessmentCompactor, /exact_evidence_paths_preserved: true/);
  assert.match(productAssessmentCompactor, /repository_head_preserved: true/);
  assert.match(productAssessmentCompactor, /authorization_effect: "NONE"/);
});

test("reasoning loop exposes JSON mode only as an optional machine-boundary control", () => {
  assert.match(reasoningLoop, /response_format = null/);
  assert.match(reasoningLoop, /response_format \? \{ response_format: object\(response_format\) \} : \{\}/);
});

test("reasoning loop is locked to owned Avantiqo Intelligence with explicit fast or deep lanes", () => {
  assert.match(reasoningLoop, /const OWNED_PROVIDER = "avantiqo-intelligence"/);
  assert.match(reasoningLoop, /EXECUTION_LANES = new Set\(\["fast", "deep"\]\)/);
  assert.match(reasoningLoop, /allowed_providers:\s*\[OWNED_PROVIDER\]/);
  assert.match(reasoningLoop, /execution_lane: executionLane/);
  assert.match(reasoningLoop, /AVANTIQO_INTELLIGENCE_TOOL_CALL_REPLAY_DETECTED/);
  assert.match(reasoningLoop, /AVANTIQO_INTELLIGENCE_TOOL_CALL_LIMIT_EXCEEDED/);
});

test("business intelligence agent uses supervisor and read-only tools", () => {
  assert.match(businessAgent, /AvantiqoIntelligenceSupervisorRuntime\.run/);
  assert.match(businessAgent, /allow_mutating_tools:\s*false/);
  assert.match(businessAgent, /business_roi_read/);
  assert.match(businessAgent, /business_channel_analysis_read/);
});
