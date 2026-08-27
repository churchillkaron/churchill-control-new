import assert from "node:assert/strict";
import test from "node:test";
import {
  AvantiqoResearchEvidencePayloadRuntime,
  resolveAvantiqoResearchEvidencePayload,
} from "../lib/intelligence/runtime/AvantiqoResearchEvidencePayloadRuntime.mjs";
import {
  createAvantiqoResearchMarginalUtilityTracker,
} from "../lib/intelligence/runtime/AvantiqoResearchMarginalUtilityRuntime.mjs";

const BRIDGE_CONTRACT = "AVANTIQO_OPERATOR_INTELLIGENCE_READ_TOOL_BRIDGE_V1";

function researchPayload() {
  return {
    sources: [
      { url: "https://a.example/one" },
      { url: "https://b.example/two" },
    ],
    claims: [
      {
        claim: "claim one",
        verification_status: "SOURCE_BACKED",
        source_urls: ["https://a.example/one"],
      },
    ],
    uncertainty: [],
    follow_up_queries: [],
    evidence: {
      provider_source_count: 2,
      returned_source_count: 2,
    },
    evidence_graph: {
      conflicted_claim_count: 0,
      relevant_conflict_count: 0,
    },
  };
}

function canonicalBridgeResult(payload = researchPayload()) {
  return {
    ok: true,
    blocked: false,
    tool: "operator_live_read",
    result: {
      contract: BRIDGE_CONTRACT,
      status: "completed",
      capability_key: "platform.research.search",
      organization_id: "org-1",
      entity_id: null,
      result: payload,
    },
  };
}

test("research evidence payload resolver exposes the canonical contract", () => {
  assert.equal(
    AvantiqoResearchEvidencePayloadRuntime.contract,
    "AVANTIQO_RESEARCH_EVIDENCE_PAYLOAD_V1",
  );
  assert.equal(
    AvantiqoResearchEvidencePayloadRuntime.governance.authorization_effect,
    "NONE",
  );
  assert.equal(
    AvantiqoResearchEvidencePayloadRuntime.governance.arbitrary_nested_result_unwrap_allowed,
    false,
  );
});

test("canonical governed research bridge results unwrap exactly one level", () => {
  const payload = researchPayload();
  assert.equal(resolveAvantiqoResearchEvidencePayload(canonicalBridgeResult(payload)), payload);
});

test("arbitrary nested results do not gain canonical research unwrapping", () => {
  const nested = researchPayload();
  const outer = {
    ok: true,
    result: {
      contract: "SPOOFED_BRIDGE",
      status: "completed",
      capability_key: "platform.research.search",
      result: nested,
    },
  };

  const resolved = resolveAvantiqoResearchEvidencePayload(outer);
  assert.equal(resolved, outer.result);
  assert.notEqual(resolved, nested);
});

test("non-research bridge capabilities cannot unwrap nested research-shaped payloads", () => {
  const nested = researchPayload();
  const outer = {
    ok: true,
    result: {
      contract: BRIDGE_CONTRACT,
      status: "completed",
      capability_key: "finance.general_ledger.read",
      result: nested,
    },
  };

  const resolved = resolveAvantiqoResearchEvidencePayload(outer);
  assert.equal(resolved, outer.result);
  assert.notEqual(resolved, nested);
});

test("marginal utility compares canonical bridge-shaped research rounds safely", () => {
  const tracker = createAvantiqoResearchMarginalUtilityTracker();
  const first = tracker.observe(canonicalBridgeResult());
  const second = tracker.observe(canonicalBridgeResult());

  assert.equal(first.research_round, 1);
  assert.equal(first.marginal_comparison_available, false);
  assert.equal(second.research_round, 2);
  assert.equal(second.marginal_comparison_available, true);
  assert.equal(second.marginal_new_source_count, 0);
  assert.equal(second.marginal_new_independent_source_count, 0);
  assert.equal(second.marginal_new_source_backed_claim_count, 0);
  assert.equal(JSON.stringify(second).includes("a.example"), false);
  assert.equal(JSON.stringify(second).includes("claim one"), false);
  assert.equal(second.raw_research_persisted, false);
});
