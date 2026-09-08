import assert from "node:assert/strict";
import fs from "node:fs";

const research = fs.readFileSync("lib/creative/research/runtime/ResearchEvidenceContractRuntime.js", "utf8");
const director = fs.readFileSync("lib/creative/research/runtime/AutonomousResearchDirectorV4Runtime.js", "utf8");
const direction = fs.readFileSync("lib/creative/director/runtime/CreativeProjectDirectionRuntime.js", "utf8");
const council = fs.readFileSync("lib/creative/director/runtime/CreativeConceptCouncilRuntime.js", "utf8");
const intelligence = fs.readFileSync("lib/creative/intelligence/runtime/CreativeIntelligenceRuntime.js", "utf8");

assert.ok(research.includes("CREATIVE_EVIDENCE_BOUND_STRATEGIC_SYNTHESIS_V1"));
for (const boundary of [
  "STRATEGIC_SYNTHESIS_REQUIRED",
  "STRATEGIC_PROBLEM_REQUIRED",
  "STRATEGIC_OPPORTUNITY_REQUIRED",
  "CREATIVE_MANDATE_REQUIRED",
  "HUMAN_TRUTH_REQUIRED",
  "CATEGORY_CONVENTION_ANALYSIS_REQUIRED",
  "STRATEGIC_SYNTHESIS_EVIDENCE_REQUIRED",
]) assert.ok(research.includes(boundary), `missing ${boundary}`);

for (const field of [
  "human_truths",
  "category_conventions",
  "breakable_conventions",
  "competitor_patterns",
  "distinctive_brand_assets",
  "cultural_context",
  "attention_opportunities",
  "contradictions",
  "must_not_do",
]) assert.ok(director.includes(field), `research prompt missing ${field}`);

assert.ok(direction.includes("report.metadata?.company_truth"));
assert.ok(direction.includes("report.metadata?.brand_intelligence"));
assert.ok(direction.includes("report.metadata?.sources"));
assert.ok(direction.includes("strategic_synthesis: report.metadata?.strategic_synthesis"));

assert.ok(council.includes("Treat EVIDENCE.research.strategic_synthesis as the strategic authority"));
assert.ok(council.includes("INDEPENDENT_CONCEPT_STRATEGIC_EVIDENCE_INVALID"));
assert.ok(intelligence.includes("CREATIVE_INTELLIGENCE_VALIDATED_RESEARCH_REQUIRED"));
assert.ok(intelligence.includes("CREATIVE_INTELLIGENCE_EVIDENCE_DECISION_TRACE_REQUIRED"));
assert.ok(intelligence.includes("CREATIVE_INTELLIGENCE_RESEARCH_BOUND_REASONING_FAILED"));
assert.ok(intelligence.includes("research_bound: Object.keys(researchPacket).length > 0"));

console.log("AVANTIQO_CREATIVE_RESEARCH_STRATEGIC_UNDERSTANDING=PASS");
