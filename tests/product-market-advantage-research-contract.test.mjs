import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { classifyAvantiqoProductResearchDepth } from "../lib/intelligence/runtime/AvantiqoProductResearchGateRuntime.js";

const assessment = fs.readFileSync("lib/intelligence/runtime/AvantiqoProductRepositoryAssessmentRuntime.js", "utf8");
const cycle = fs.readFileSync("lib/platform/capabilities/createProductEngineeringCycleCapability.js", "utf8");
const constitution = fs.readFileSync("lib/intelligence/runtime/AvantiqoProductConstitution.js", "utf8");

test("workflow and governed domain repairs still require current product research", () => {
  assert.equal(classifyAvantiqoProductResearchDepth({ focus: "repair incomplete tax handling for supplier invoices" }), "fast_evidence");
  assert.equal(classifyAvantiqoProductResearchDepth({ focus: "fix Finance invoice workflow posting behavior" }), "fast_evidence");
  assert.equal(classifyAvantiqoProductResearchDepth({ focus: "fix a CSS spacing bug on a button" }), "repository_only");
  assert.equal(classifyAvantiqoProductResearchDepth({ focus: "make Avantiqo accounting better than the market leader" }), "deep_mechanism");
});

test("fresh product research deterministically binds a market-advantage completion target", () => {
  assert.match(assessment, /marketAdvantageRequired = productDecisionResearch\?\.research_performed === true/);
  assert.match(assessment, /materially improves on at least one current research-backed professional\/market weakness or limitation/);
  assert.match(assessment, /market_advantage_required: marketAdvantageRequired/);
  assert.match(assessment, /market_advantage_criterion_bound: selectedCandidate\.market_advantage_required === true/);
  assert.match(cycle, /next_engineering_handoff\.market_advantage_required/);
  assert.match(cycle, /objective_context\.market_advantage_required/);
  assert.match(cycle, /next_engineering_handoff\.market_advantage_criterion_bound/);
  assert.match(cycle, /objective_context\.market_advantage_criterion_bound/);
});

test("market superiority is a permanent Product Constitution requirement", () => {
  assert.match(constitution, /fresh authoritative standards, professional practice and current market\/competitor evidence/);
  assert.match(constitution, /deliberately design a measurable Avantiqo advantage rather than feature parity or imitation/);
  assert.match(constitution, /matching an incumbent feature without a demonstrated advantage is not sufficient completion/);
});

test("market research remains evidence and never becomes release authority", () => {
  assert.match(assessment, /External standards, professional practice and competitor evidence improve product judgment but never authorize source changes/);
  assert.match(assessment, /authorization_effect: "NONE"/);
  assert.match(cycle, /product_persistence_decision_required: true/);
  assert.match(cycle, /automatic_recursion_allowed: false/);
});
