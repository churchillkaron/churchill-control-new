import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  getVercelRollingReleasePolicy,
  verifyVercelRollingReleasePolicy,
  configureVercelRollingReleasePolicy,
  getVercelRollingRelease,
  approveVercelRollingReleaseStage,
  completeVercelRollingRelease,
  deployVerifiedMainCommit,
} from "../lib/platform/runtime/AvantiqoProductionReleaseRuntime.js";

const env = {
  VERCEL_TOKEN: "test-token",
  VERCEL_PROJECT_ID: "prj_test",
  VERCEL_TEAM_ID: "team_test",
  AVANTIQO_CODE_GITHUB_REPOSITORY_ID: "1210794056",
};
function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function rolling({ canary = "dpl_canary", percentage = 5, active = 0, next = 1, state = "ACTIVE" } = {}) {
  return {
    rollingRelease: {
      state,
      substate: "PAUSED",
      currentDeployment: { id: "dpl_previous" },
      canaryDeployment: { id: canary },
      currentCanaryPercentage: percentage,
      activeStage: active == null ? null : { index: active, targetPercentage: percentage },
      nextStage: next == null ? null : { index: next, targetPercentage: next === 1 ? 25 : 100 },
    },
  };
}
const policyProject = { rollingRelease: {
  target: "production",
  stages: [
    { targetPercentage: 5, requireApproval: false },
    { targetPercentage: 25, requireApproval: true },
    { targetPercentage: 100, requireApproval: true },
  ],
  gate: { enabled: true, checks: [{ type: "error-rate-5xx", minSampleSize: 100 }], failureThreshold: 3, windowSize: 5, action: "rollback", dryRun: false },
} };

test("rolling release policy requires exact 5 25 100 production stages", async () => {
  const ok = await verifyVercelRollingReleasePolicy({ env, fetch_impl: async () => reply(policyProject) });
  assert.deepEqual(ok.stages, [5, 25, 100]);
  await assert.rejects(() => verifyVercelRollingReleasePolicy({ env, fetch_impl: async () => reply({ rollingRelease: { target: "production", stages: [{ targetPercentage: 10, requireApproval: false }, { targetPercentage: 100, requireApproval: true }], gate: policyProject.rollingRelease.gate } }) }), /STAGE_POLICY_MISMATCH/);
});

test("rolling release policy fails closed without active automatic rollback health gate", async () => {
  const noGate = { rollingRelease: { ...policyProject.rollingRelease, gate: { enabled: false, checks: [], action: "pause", dryRun: false } } };
  await assert.rejects(() => verifyVercelRollingReleasePolicy({ env, fetch_impl: async () => reply(noGate) }), /AUTOMATIC_GATE_REQUIRED/);
  const dryRun = { rollingRelease: { ...policyProject.rollingRelease, gate: { ...policyProject.rollingRelease.gate, dryRun: true } } };
  await assert.rejects(() => verifyVercelRollingReleasePolicy({ env, fetch_impl: async () => reply(dryRun) }), /ROLLBACK_DRY_RUN_FORBIDDEN/);
});

test("rolling release policy configure writes exact safe stages and automatic rollback gate then re-verifies", async () => {
  const calls = [];
  const fetch_impl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", body: init.body || null });
    if ((init.method || "GET") === "PATCH") return reply({ rollingRelease: policyProject.rollingRelease });
    return reply(policyProject);
  };
  const configured = await configureVercelRollingReleasePolicy({ env, fetch_impl });
  assert.equal(configured.configured, true);
  assert.equal(configured.verified.automatic_rollback, true);
  const patch = calls.find((call) => call.method === "PATCH");
  assert.ok(patch.url.includes("/rolling-release/config"));
  const body = JSON.parse(patch.body);
  assert.deepEqual(body.stages.map((stage) => stage.targetPercentage), [5,25,100]);
  assert.equal(body.stages[1].requireApproval, true);
  assert.equal(body.stages[2].requireApproval, true);
  assert.equal(body.gate.enabled, true);
  assert.equal(body.gate.action, "rollback");
  assert.equal(body.gate.dryRun, false);
  assert.ok(body.gate.checks.length > 0);
});

test("rolling release status normalizes canary percentage and next stage", async () => {
  const state = await getVercelRollingRelease({ env, fetch_impl: async () => reply(rolling({ percentage: 5 }).rollingRelease ? rolling({ percentage: 5 }) : {}) });
  assert.equal(state.state, "ACTIVE");
  assert.equal(state.canary_deployment_id, "dpl_canary");
  assert.equal(state.current_canary_percentage, 5);
  assert.equal(state.next_stage_index, 1);
});

test("advance validates current canary and next stage before POST approve-stage", async () => {
  const calls = [];
  const fetch_impl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", body: init.body || null });
    if (String(url).includes("/rolling-release/config")) return reply(policyProject);
    if (String(url).endsWith("/rolling-release?teamId=team_test")) return reply(rolling({ percentage: 5, active: 0, next: 1 }));
    if (String(url).includes("/approve-stage")) return reply(rolling({ percentage: 25, active: 1, next: 2 }));
    throw new Error(`unexpected ${url}`);
  };
  const result = await approveVercelRollingReleaseStage({ canary_deployment_id: "dpl_canary", next_stage_index: 1, env, fetch_impl });
  assert.equal(result.approved_stage_index, 1);
  const post = calls.find((call) => call.url.includes("/approve-stage"));
  assert.equal(post.method, "POST");
  assert.deepEqual(JSON.parse(post.body), { nextStageIndex: 1, canaryDeploymentId: "dpl_canary" });
});

test("rolling release cannot skip the governed 5 to 25 to 100 sequence", async () => {
  const atFive = async (url, init = {}) => {
    if (String(url).includes("/rolling-release/config")) return reply(policyProject);
    if ((init.method || "GET") === "GET") return reply(rolling({ percentage: 5, active: 0, next: 1 }));
    throw new Error(`unexpected ${url}`);
  };
  await assert.rejects(() => completeVercelRollingRelease({ canary_deployment_id: "dpl_canary", env, fetch_impl: atFive }), /COMPLETE_SEQUENCE_INVALID/);
  const atTwentyFive = async (url, init = {}) => {
    if (String(url).includes("/rolling-release/config")) return reply(policyProject);
    if ((init.method || "GET") === "GET") return reply(rolling({ percentage: 25, active: 1, next: 2 }));
    throw new Error(`unexpected ${url}`);
  };
  await assert.rejects(() => approveVercelRollingReleaseStage({ canary_deployment_id: "dpl_canary", next_stage_index: 2, env, fetch_impl: atTwentyFive }), /FINAL_STAGE_REQUIRES_COMPLETE/);
});

test("complete validates active exact canary before 100 percent completion", async () => {
  const calls = [];
  const fetch_impl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method || "GET", body: init.body || null });
    if (String(url).includes("/rolling-release/config")) return reply(policyProject);
    if (String(url).endsWith("/rolling-release?teamId=team_test")) return reply(rolling({ percentage: 25, active: 1, next: 2 }));
    if (String(url).includes("/complete")) return reply(rolling({ percentage: 100, active: 2, next: null, state: "COMPLETED" }));
    throw new Error(`unexpected ${url}`);
  };
  const result = await completeVercelRollingRelease({ canary_deployment_id: "dpl_canary", env, fetch_impl });
  assert.equal(result.completed, true);
  assert.ok(calls.some((call) => call.url.includes("/complete") && call.method === "POST"));
});

test("production deployment reports active 5 percent canary as staged not fully deployed", async () => {
  const sha = "a".repeat(40);
  const fetch_impl = async (url, init = {}) => {
    const target = String(url);
    if (target.includes("/rolling-release/config")) return reply(policyProject);
    if (target.includes("/v13/deployments") && (init.method || "GET") === "POST") {
      return reply({ id: "dpl_canary", url: "canary.vercel.app", readyState: "READY", target: "production", meta: { githubCommitSha: sha } });
    }
    if (target.includes("/v1/projects/") && target.includes("/rolling-release")) return reply(rolling({ canary: "dpl_canary", percentage: 5, active: 0, next: 1 }));
    throw new Error(`unexpected ${target}`);
  };
  const result = await deployVerifiedMainCommit({ commit_sha: sha, env, fetch_impl });
  assert.equal(result.rolling_release_active, true);
  assert.equal(result.rolling_release_percentage, 5);
  assert.equal(result.production_deployed, false);
});

const capability = await readFile(new URL("../lib/platform/capabilities/createCodeAIRollingReleaseCapability.js", import.meta.url), "utf8");
const policyCapability = await readFile(new URL("../lib/platform/capabilities/createCodeAIRollingReleasePolicyCapability.js", import.meta.url), "utf8");
const route = await readFile(new URL("../app/api/operator/code/rolling-release/route.js", import.meta.url), "utf8");
const policyRoute = await readFile(new URL("../app/api/operator/code/rolling-release-policy/route.js", import.meta.url), "utf8");
const studio = await readFile(new URL("../components/creative/code/CreativeCodeStudio.jsx", import.meta.url), "utf8");

test("rolling release control is separate deploy-authorized operator capability", () => {
  assert.match(capability, /platform\.deploy\.production/);
  assert.match(capability, /aiEnabled: false/);
  assert.match(capability, /operatorRequiresConfirmation: true/);
  assert.match(capability, /RELEASE_CERTIFICATION_REQUIRED/);
  assert.match(capability, /verifyExistingVercelDeployment/);
  assert.match(route, /explicit_rolling_release_request: true/);
  assert.match(studio, /Production rolling release · 5 → 25 → 100/);
  assert.match(studio, /\/api\/operator\/code\/rolling-release/);
  assert.match(policyCapability, /aiEnabled: false/);
  assert.match(policyCapability, /operatorRequiresConfirmation: true/);
  assert.match(policyCapability, /configureVercelRollingReleasePolicy/);
  assert.match(policyRoute, /explicit_rolling_policy_request: true/);
  assert.match(studio, /Configure safe rollout policy/);
});
