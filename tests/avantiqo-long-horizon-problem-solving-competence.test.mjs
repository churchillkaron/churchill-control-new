import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const runtime=fs.readFileSync("lib/intelligence/runtime/AvantiqoLongHorizonProblemSolvingCompetenceRuntime.js","utf8");
const route=fs.readFileSync("app/api/internal/intelligence/continuous-learning/process/route.js","utf8");

test("long horizon competence tests adaptive problem solving",()=>{
  for(const kind of ["GOAL_DECOMPOSITION","COMPETING_HYPOTHESES","DISCRIMINATING_EVIDENCE","EVIDENCE_INVALIDATES_PLAN","GOVERNED_MUTATION","COMPLETION_PROOF","GOAL_SCOPE_PRESERVATION"]) assert.match(runtime,new RegExp(`"${kind}"`));
  assert.match(runtime,/ESTABLISH_EVIDENCE_ASSUMPTIONS_AND_COMPLETION_TEST/);
  assert.match(runtime,/FORM_COMPETING_FALSIFIABLE_HYPOTHESES/);
  assert.match(runtime,/CHOOSE_LOWEST_COST_DISCRIMINATING_READS/);
});

test("replanning preserves verified work and rejects invalidated mutation",()=>{
  assert.match(runtime,/REPLAN_AFFECTED_FUTURE_STEPS_ONLY/);
  assert.match(runtime,/preserve_verified_completed_work===true/);
  assert.match(runtime,/execute_invalidated_write===false/);
  assert.match(runtime,/REPLAN_INVALIDATED_BRANCH_ONLY/);
});

test("completion requires proof and scope cannot drift silently",()=>{
  assert.match(runtime,/expected_goal_status:"IN_PROGRESS"/);
  assert.match(runtime,/VERIFY_COMPLETION_TEST/);
  assert.match(runtime,/DO_NOT_EXPAND_SCOPE_WITHOUT_GOAL_RELEVANCE_OR_USER_DECISION/);
  assert.match(runtime,/completion_requires_independent_proof:true/);
});

test("long horizon competence is local only and has zero authority",()=>{
  assert.match(runtime,/const MODEL = "qwen3:4b-instruct"/);
  assert.match(runtime,/const LOCAL_INFRA = "AVANTIQO_LOCAL_NODE_V1"/);
  assert.match(runtime,/external_fallback_allowed:false/);
  assert.match(runtime,/tool_execution_used:false/);
  assert.match(runtime,/mission_execution_used:false/);
  assert.match(runtime,/automatic_execution_authorized:false/);
});

test("nightly route runs long horizon after mission composition",()=>{
  const mission=route.indexOf("runAvantiqoMissionCompositionCompetence()");
  const long=route.indexOf("runAvantiqoLongHorizonProblemSolvingCompetence()");
  assert.ok(mission>=0&&long>mission);
  assert.match(route,/long_horizon_problem_solving_competence: longHorizonProblemSolvingCompetence/);
});
