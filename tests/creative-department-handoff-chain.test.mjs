import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { buildDepartmentHandoffChain } from "../lib/creative/quality/runtime/CreativeDepartmentHandoffChainRuntime.js";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

const previs = {
  contract: "CREATIVE_SHOT_PREVISUALIZATION_BLUEPRINT_V1",
  passed: true,
  blueprint_digest: "a".repeat(64),
};

function role(status = "ACTIVE", decision = "Concrete evidence-backed specialist decision for this shot.") {
  return { status, decision, evidence: ["shot-a"], risks: [], repair_instructions: [] };
}

test("department handoff hashes one authoritative shot truth through active specialists", () => {
  const chain = buildDepartmentHandoffChain({
    previsualization: previs,
    role_decisions: {
      previsualization_supervisor: role(), production_designer: role(),
      director_of_photography: role(), post_production_supervisor: role(), quality_director: role(),
    },
  });
  assert.equal(chain.passed, true);
  assert.equal(chain.root_previsualization_digest, previs.blueprint_digest);
  assert.equal(chain.active_department_count, 5);
  assert.match(chain.final_chain_digest, /^[a-f0-9]{64}$/);
  for (let i = 1; i < chain.stages.length; i += 1) {
    assert.equal(chain.stages[i].input_digest, chain.stages[i - 1].stage_digest);
  }
});
test("complex handoff cannot omit post-production supervision", () => {
  const chain = buildDepartmentHandoffChain({
    previsualization: previs,
    role_decisions: {
      previsualization_supervisor: role(), production_designer: role(),
      director_of_photography: role(), compositing_supervisor: role(), quality_director: role(),
    },
  });
  assert.equal(chain.passed, false);
  assert.ok(chain.failures.includes("DEPARTMENT_HANDOFF_POST_SUPERVISION_REQUIRED"));
});

test("visual execution requires handoff root to match sealed previs digest", () => {
  const task = read("lib/operations/tasks/runtime/ProductionTaskRuntime.js");
  const planner = read("lib/creative/production-graph/planner/ProductionGraphPlanner.js");
  assert.match(planner, /department_handoff_chain: departmentHandoff/);
  assert.match(task, /STUDIO_VISUAL_GENERATION_DEPARTMENT_HANDOFF_REQUIRED/);
  assert.match(task, /handoff\.root_previsualization_digest === previsualization\.blueprint_digest/);
});
