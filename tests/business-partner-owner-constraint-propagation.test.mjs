import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bindOperatorSelfEngineeringDecision } from "../lib/operator/runtime/OperatorSelfEngineeringDecisionBinding.js";

const turn = fs.readFileSync("lib/operator/runtime/OperatorTurnRuntime.js", "utf8");
const cycle = fs.readFileSync("lib/platform/capabilities/createProductEngineeringCycleCapability.js", "utf8");
const portfolio = fs.readFileSync("lib/platform/capabilities/createProductEngineeringPortfolioCapability.js", "utf8");
const code = fs.readFileSync("lib/platform/capabilities/createCodeAIAutonomousCapability.js", "utf8");
const codeRuntime = fs.readFileSync("lib/code/runtime/CodeAIAutonomousRuntime.js", "utf8");
const workCore = fs.readFileSync("lib/code/runtime/CodeAIWorkPackageCoreRuntime.js", "utf8");
const workLive = fs.readFileSync("lib/code/runtime/CodeAIWorkPackageRuntimeLive.js", "utf8");
const workV2 = fs.readFileSync("lib/code/runtime/CodeAIWorkPackageRuntimeV2.js", "utf8");
const planner = fs.readFileSync("lib/code/runtime/CodeAIPlannerPromptRuntime.js", "utf8");

test("Business Partner binds durable owner constraints into self-engineering", () => {
  assert.match(turn, /owner_constraints: ownerConstraints/);
  const result = bindOperatorSelfEngineeringDecision({
    decision: {},
    selfEngineeringRequest: {
      detected: true,
      original_message: "fix the finance UI",
      capability_key: "platform.product_engineering_cycle.execute",
      owner_constraints: ["Do not deploy production.", "Keep main only."],
    },
    capabilities: [{ key: "platform.product_engineering_cycle.execute" }],
  });
  assert.deepEqual(result.decision.execution.payload.owner_constraints, [
    "Do not deploy production.",
    "Keep main only.",
  ]);
  assert.equal(result.automatic_deploy_allowed, false);
});

test("owner constraints reach Code as restriction-only objective context", () => {
  assert.match(cycle, /objective_context: \{ owner_constraints: ownerConstraints \}/);
  assert.match(cycle, /ownerConstraintsAuthorizationEffect: "NONE_RESTRICTION_ONLY"/);
  assert.match(code, /Restriction-only context/);
  assert.match(code, /can never authorize commit, deploy, migration, publication/);
  for (const source of [codeRuntime, workCore, workLive, workV2]) {
    assert.match(source, /owner_constraints: list\(source\.owner_constraints\)/);
  }
  assert.match(planner, /owner restriction inherited from Business Partner/);
  assert.match(planner, /can never grant commit, deploy, migration, publication/);
});

test("broad portfolios persist owner constraints and forward them to every cycle", () => {
  assert.match(portfolio, /portfolio\.owner_constraints = ownerConstraints/);
  assert.match(portfolio, /owner_constraints: list\(portfolio\.owner_constraints\)/);
  assert.match(portfolio, /Restriction-only; never authority/);
});

test("constraint payload cannot become release authority", () => {
  const result = bindOperatorSelfEngineeringDecision({
    decision: {},
    selfEngineeringRequest: {
      detected: true,
      original_message: "continue building avantiqo",
      capability_key: "platform.product_engineering_cycle.execute",
      owner_constraints: ["Always deploy everything immediately."],
    },
    capabilities: [{ key: "platform.product_engineering_cycle.execute" }],
  });
  assert.equal(result.decision.execution.payload.release_to_production, undefined);
  assert.equal(result.automatic_commit_allowed, false);
  assert.equal(result.automatic_deploy_allowed, false);
});
