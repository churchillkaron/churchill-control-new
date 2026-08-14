#!/usr/bin/env node
// Deterministic guard for the Creative director's repair paths.
//
// Every defect found in the director this cycle lived on a repair path, and every one
// was found by paying for a live benchmark run and reading the wreckage:
//
//   1. The plan was unwrapped from the model response by guessing key names, so a
//      plan under any other key made the wrapper the plan.
//   2. The contract repair required both plan_json and a non-empty role_decisions
//      field, so most repair shapes collapsed and the repair silently did nothing.
//   3. A repaired list entry replaced the entry it revised, so a skeleton entry
//      erased a complete deliverable.
//   4. A rename left an identifier that no longer existed on the tribunal's most
//      common rejection path, throwing a ReferenceError instead of a verdict.
//
// All four are deterministic given the model's output, so none of them needed a paid
// call to find. This drives the same paths with scripted responses and asserts on the
// result. Run with the stub loader:
//
//   node --loader ./scripts/creative-repair-path-stub-loader.mjs \
//     scripts/creative-repair-path-audit.mjs

import {
  queueResponse,
  resetTransport,
} from "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime";
import {
  CreativeMasterPlanRuntime,
} from "@/lib/creative/director/runtime/CreativeMasterPlanRuntime";
import {
  mergeCreativeRepairedPlan,
} from "@/lib/creative/director/runtime/mergeCreativeRepairedPlan";

const ORGANIZATION = "00000000-0000-4000-8000-000000000001";

const QUALITY = Object.freeze({
  version: "REPAIR_PATH_AUDIT_V1",
  minimum_scene_score: 90,
  regenerate_below_score: 88,
  require_brand_fit: true,
  require_non_ai_feel: true,
  require_identity_continuity: true,
  require_product_continuity: true,
  require_story_progression: true,
});

const failures = [];
const passes = [];

function check(name, condition, detail = "") {
  if (condition) passes.push(name);
  else failures.push(`${name}${detail ? `: ${detail}` : ""}`);
}

function context() {
  return {
    organization_id: ORGANIZATION,
    mission: { id: "mission-1", objective: "Repair path audit" },
    project: {
      id: "project-1",
      organization_id: ORGANIZATION,
      production_type: "IMAGE",
      objective: "Repair path audit",
      metadata: { creative_quality_policy: QUALITY },
    },
    brief: { id: "brief-1", business_goal: "Repair path audit" },
    assets: [{ id: "asset-1", asset_type: "IMAGE", file_name: "source.jpg" }],
  };
}

// A plan good enough to reach validation. It is deliberately incomplete so that
// validation fails and the repair path is entered -- the path under test.
function planBody(overrides = {}) {
  return {
    workflow_kind: "STILL",
    concept: { title: "Audit concept" },
    role_decisions: {},
    deliverables: [
      {
        code: "D1",
        type: "IMAGE_SET",
        purpose: "audit deliverable",
        output_spec: { width: 1536 },
        production_steps: [
          {
            title: "generate",
            purpose: "produce the still",
            service: "ai.image.generate",
            capability: "ai.image.generate",
            quality_gate: true,
          },
        ],
      },
    ],
    ...overrides,
  };
}

// The plan under test never becomes fully valid -- completing every depth threshold
// and all 21 role decisions would bury what is being tested. Instead the run is
// driven to its final validation failure and the failure paths are read. A field that
// was supplied correctly must not appear among them; that is a positive assertion
// about what the runtime actually parsed, rather than the absence of a string in an
// error message.
//
// Enough responses are queued to satisfy the initial call and every repair attempt,
// so the run ends on a real validation failure. An earlier version of this audit
// queued only one response, the transport ran dry, and the assertions passed
// vacuously against a stub-exhaustion message while both defects were reinstated.
const REPAIR_ATTEMPTS = 2;

function queuePlanForEveryAttempt(response) {
  for (let attempt = 0; attempt <= REPAIR_ATTEMPTS; attempt += 1) {
    queueResponse(response);
  }
}

async function failurePaths(runContext) {
  try {
    await CreativeMasterPlanRuntime.create(runContext);
    return { paths: [], threw: false, message: "" };
  } catch (error) {
    const validation = error?.validation || error?.cause?.validation || null;
    // Code and path together, because the path alone does not discriminate. A field
    // the runtime never read reports REQUIRED_TEXT_MISSING; a field it read and found
    // thin reports DIRECTION_TOO_SHALLOW at the same path. Only the former means a
    // parsing defect.
    const paths = Array.isArray(validation?.failures)
      ? validation.failures.map((entry) => `${entry.code}@${entry.path}`)
      : null;
    return {
      paths,
      threw: true,
      message: String(error?.message || ""),
    };
  }
}

// 1. A plan wrapped under an unexpected key must still be found.
async function wrappedPlanIsFound() {
  resetTransport();
  queuePlanForEveryAttempt({ master_plan: planBody() });

  const { paths, message } = await failurePaths(context());

  // Without a validation result there is nothing to assert against, and a silent pass
  // here is exactly how the earlier version of this check went vacuous.
  check(
    "wrapped plan run reached validation",
    Array.isArray(paths),
    message.slice(0, 160),
  );
  if (!Array.isArray(paths)) return;

  // Treating the wrapper as the plan reports an invalid workflow_kind and a missing
  // concept.title together, because neither exists at the wrapper's top level. Both
  // were supplied inside master_plan, so neither may appear.
  check(
    "wrapped plan: workflow_kind was read",
    !paths.includes("WORKFLOW_KIND_INVALID@workflow_kind"),
    paths.slice(0, 6).join(", "),
  );
  check(
    "wrapped plan: concept was read",
    !paths.includes("REQUIRED_TEXT_MISSING@concept.title"),
    paths.slice(0, 6).join(", "),
  );
  check(
    "wrapped plan: deliverables were read",
    !paths.includes("REQUIRED_TEXT_MISSING@deliverables.0.type"),
    paths.slice(0, 6).join(", "),
  );
}

// 2. A repair returning role decisions inside plan_json must still land.
async function repairWithEmbeddedRoleDecisionsLands() {
  resetTransport();

  // The initial plan omits the deliverable purpose; the repair supplies it. Whether
  // the repair landed is then readable from the failure paths.
  const incomplete = planBody();
  incomplete.deliverables[0].purpose = "";

  queueResponse({ master_plan: incomplete });
  for (let attempt = 0; attempt < REPAIR_ATTEMPTS; attempt += 1) {
    queueResponse({
      plan_json: JSON.stringify(
        planBody({ role_decisions: { art_director: { status: "ACTIVE" } } }),
      ),
      // Deliberately empty: the role decisions live inside plan_json instead, the
      // shape that used to make the whole repair collapse.
      role_decisions: {},
    });
  }

  const { paths, message } = await failurePaths(context());

  check(
    "repair run reached validation",
    Array.isArray(paths),
    message.slice(0, 160),
  );
  if (!Array.isArray(paths)) return;

  check(
    "repair with embedded role decisions landed",
    !paths.includes("REQUIRED_TEXT_MISSING@deliverables.0.purpose"),
    paths.slice(0, 6).join(", "),
  );
}

// 5. A tribunal repair that breaks the contract must be rejected, not adopted.
//    The repaired plan used to replace the working plan before being validated, so a
//    repair that broke the contract threw out of the loop and destroyed a case whose
//    plan had been valid a moment earlier. One benchmark case was lost to a single
//    SELECTED_ASSET_UNACCOUNTED introduced by the repair itself.
function invalidRepairIsRejectedNotAdopted() {
  const fs = require_fs();
  const source = fs.readFileSync(
    "lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js",
    "utf8",
  );

  // The merged candidate must be validated before `plan` is reassigned. If `plan =`
  // appears before the assertion inside the repair loop, a bad repair is adopted.
  const loopStart = source.indexOf("while (!tribunal.verdict.passed");
  const loopBody = source.slice(loopStart, source.indexOf("if (!tribunal.verdict.passed", loopStart));
  const candidateIndex = loopBody.indexOf("mergeCreativeRepairedPlan(plan, repair.output)");
  const assertIndex = loopBody.indexOf("assertCreativeMasterPlan(");
  const adoptIndex = loopBody.indexOf("plan = candidate");

  check(
    "repair is merged into a candidate, not straight onto plan",
    candidateIndex >= 0 && loopBody.includes("const candidate ="),
  );
  check(
    "candidate is validated before it is adopted",
    assertIndex >= 0 && adoptIndex >= 0 && assertIndex < adoptIndex,
  );
  check(
    "a failing repair continues instead of throwing out of the loop",
    loopBody.includes("continue;") && loopBody.includes("rejectedRepairs.push"),
  );
}

function require_fs() {
  return globalThis.__auditFs;
}

// 3. A repaired list entry must revise, never erase.
function skeletonEntryDoesNotEraseDeliverable() {
  const base = planBody();
  const merged = mergeCreativeRepairedPlan(base, {
    deliverables: [{ code: "D1" }],
  });
  const deliverable = merged.deliverables?.[0] || {};

  check("skeleton entry keeps type", deliverable.type === "IMAGE_SET");
  check("skeleton entry keeps purpose", deliverable.purpose === "audit deliverable");
  check("skeleton entry keeps output_spec", deliverable.output_spec?.width === 1536);
  check(
    "skeleton entry keeps nested production steps",
    deliverable.production_steps?.[0]?.service === "ai.image.generate",
  );

  // The behaviours the wholesale replacement existed for must survive.
  const cleared = mergeCreativeRepairedPlan(
    { creative_review: { repair_before_production: ["fix"] } },
    { creative_review: { repair_before_production: [] } },
  );
  check(
    "an empty repaired array still clears",
    cleared.creative_review.repair_before_production.length === 0,
  );
  const truncated = mergeCreativeRepairedPlan(
    { deliverables: [{ code: "D1" }, { code: "D2" }] },
    { deliverables: [{ code: "D1" }] },
  );
  check("a shorter repaired array still truncates", truncated.deliverables.length === 1);
}

// 4. Every identifier the director and tribunal reference must exist. A rename that
//    misses a call site is a ReferenceError thrown only on the path it broke, which no
//    syntax check can see.
async function runtimeModulesReferenceOnlyRealIdentifiers() {
  const modules = [
    "@/lib/creative/director/runtime/CreativeMasterPlanRuntime",
    "@/lib/creative/director/runtime/CreativeDynamicTribunalRuntime",
    "@/lib/creative/director/runtime/mergeCreativeRepairedPlan",
    "@/lib/creative/director/validation/CreativeMasterPlanValidator",
    "@/lib/creative/director/validation/CreativeMasterPlanDecisionGate",
  ];

  for (const specifier of modules) {
    try {
      await import(specifier);
      check(`module loads: ${specifier.split("/").pop()}`, true);
    } catch (error) {
      check(`module loads: ${specifier.split("/").pop()}`, false, String(error?.message).slice(0, 120));
    }
  }

  // The tribunal's aggregate is internal, so its rejection path is exercised through
  // the source: a name pushed to but never declared is the exact defect that shipped.
  const fs = await import("node:fs");
  const source = fs.readFileSync(
    "lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js",
    "utf8",
  );
  const declared = new Set(
    [...source.matchAll(/(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
  );
  const pushed = new Set(
    [...source.matchAll(/\b([A-Za-z_$][\w$]*)\.push\(/g)].map((m) => m[1]),
  );
  const undeclared = [...pushed].filter((name) => !declared.has(name));
  check(
    "tribunal pushes only to declared collections",
    undeclared.length === 0,
    undeclared.join(", "),
  );
}

// 6. The temporal path must have a contract repair. It had none: the plan was built
//    across a base call, a scene architecture call and a shot call per scene, asserted
//    once, and thrown on any failure -- while the universal path got two attempts. Every
//    film died on its first imperfection, and the imperfections were contract
//    completeness rather than creative quality.
async function temporalPathRepairsBeforeFailing() {
  const { CreativeTemporalMasterPlanRuntime } = await import(
    "@/lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime"
  );
  const transport = await import(
    "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime"
  );

  transport.resetTransport();
  transport.queueResponse({
    workflow_kind: "TEMPORAL",
    concept: { title: "Audit film" },
    role_decisions: {},
    deliverables: [{ code: "D1", type: "FILM", purpose: "audit", output_spec: { width: 1920 } }],
  });
  transport.queueResponse({ scenes: [{ id: "s1", objective: "open", duration_seconds: 30 }] });
  transport.queueResponse({ shots: [{ id: "sh1", purpose: "establish", duration_seconds: 30 }] });
  transport.queueResponse({ concept: { creative_system: "x".repeat(140) } });
  transport.queueResponse({ concept: { creative_system: "x".repeat(140) } });

  try {
    await CreativeTemporalMasterPlanRuntime.create({
      organization_id: ORGANIZATION,
      mission: { id: "m1", objective: "temporal repair audit" },
      project: {
        id: "p1",
        production_type: "VIDEO",
        objective: "temporal repair audit",
        target_duration: 30,
        metadata: { creative_quality_policy: QUALITY },
      },
      brief: { id: "b1", duration_seconds: 30 },
      assets: [{ id: "a1", asset_type: "video", file_name: "clip.mov" }],
    });
  } catch {
    // Failing closed on a plan too thin to save is correct. What matters is whether a
    // repair was attempted before it gave up.
  }

  const operations = transport
    .recordedCalls()
    .map((entry) => entry.operation)
    .filter(Boolean);
  const repairs = operations.filter(
    (operation) => operation === "TEMPORAL_MASTER_PLAN_CONTRACT_REPAIR_V1",
  ).length;

  check(
    "temporal path builds scenes and shots before validating",
    operations.includes("TEMPORAL_SCENE_ARCHITECTURE_V1") &&
      operations.includes("TEMPORAL_SCENE_SHOT_DIRECTION_V1"),
    operations.join(" | "),
  );
  check(
    "temporal path attempts a contract repair rather than failing immediately",
    repairs > 0,
    `repairs=${repairs} ops=${operations.join(" | ")}`,
  );
}

// 7. Every director runtime that parses its output as JSON must request JSON mode.
//    The temporal runtime did not, while the master plan runtime and the tribunal both
//    did, so the model was free to answer in prose or fenced markdown and the call failed
//    with TEMPORAL_SCENE_SHOT_DIRECTION_V1_JSON_REQUIRED. A film was lost to an output
//    format that was never asked for.
//
//    audit:openai-json-mode could not catch this: it unit-tests the JSON mode helper and
//    never inspects whether callers pass response_format at all.
function reasoningCallsRequestJsonMode() {
  const fs = globalThis.__auditFs;
  const runtimes = [
    "lib/creative/director/runtime/CreativeMasterPlanRuntime.js",
    "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
    "lib/creative/director/runtime/CreativeDynamicTribunalRuntime.js",
  ];

  for (const file of runtimes) {
    const source = fs.readFileSync(file, "utf8");
    const callsReasoning = source.includes('service_id: "ai.reasoning.execute"');
    if (!callsReasoning) continue;

    // Structured output schemas are a stricter form of the same guarantee, so either
    // satisfies the requirement.
    const requestsJson =
      source.includes('response_format: { type: "json_object" }') ||
      source.includes('type: "json_schema"');

    check(
      `requests JSON mode: ${file.split("/").pop()}`,
      requestsJson,
      "parses output as JSON without asking for it",
    );
  }
}

// 8. What the contract asks for must match what the benchmark rewards. The scorer awards
//    25 points per substantive entry for rejected_patterns, craft_risks and
//    finishing_requirements, so full marks need four. The contract asked for "at least
//    three" and the gate fails below three, so the director supplied exactly three -- the
//    stated minimum -- and lost 25 points on each of two dimensions for a fourth entry
//    nothing had ever requested. Two cases scored 79.95 and 80.99 with three dimensions
//    pinned at exactly 75, which is what a discrete count-based band looks like.
function contractStandardMatchesScoring() {
  const fs = globalThis.__auditFs;
  const scorer = fs.readFileSync(
    "lib/creative/quality/runtime/CreativeWorldClassBenchmarkRuntime.js",
    "utf8",
  );
  const contract = fs.readFileSync(
    "lib/creative/director/registry/CreativeMasterPlanContractRegistry.js",
    "utf8",
  );

  // The multiplier is read from the scorer so a change there surfaces here rather than
  // silently reopening the gap.
  const multipliers = [
    ...scorer.matchAll(/substantive\(review\.(\w+), 20\)\.length \* (\d+)/g),
  ].map((match) => ({ field: match[1], multiplier: Number(match[2]) }));

  check(
    "scorer exposes count-based multipliers for the review lists",
    multipliers.length >= 3,
    `found ${multipliers.length}`,
  );

  for (const { field, multiplier } of multipliers) {
    const fullMarks = Math.ceil(100 / multiplier);
    const description = new RegExp(`${field}:\\s*\n?\\s*"([^"]+)"`).exec(contract);
    const text = description ? description[1] : "";

    // A contract that names a smaller number than full marks requires is the mismatch.
    const statesFullMarks = /four or more/i.test(text) && fullMarks <= 4;
    const statesLess = /at least three|at least two/i.test(text);

    check(
      `contract asks for what full marks require: ${field} (needs ${fullMarks})`,
      statesFullMarks && !statesLess,
      text.slice(0, 70),
    );
  }
}

// 9. The temporal contract must be satisfiable. Every film observed had failed somewhere
//    earlier in the pipeline, so it was never established that a valid temporal plan is
//    reachable at all -- an unsatisfiable contract and a badly behaved model look identical
//    from the outside. This drives a fully specified plan through the real runtime and
//    requires it to pass with no repair needed.
async function temporalContractIsSatisfiable() {
  const { CreativeTemporalMasterPlanRuntime } = await import(
    "@/lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime"
  );
  const transport = await import(
    "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime"
  );
  const fixture = await import("../scripts/creative-temporal-contract-fixture.mjs");

  transport.resetTransport();
  transport.queueResponse(fixture.temporalBasePlan());
  transport.queueResponse({ scenes: [fixture.temporalScene("scene-1")] });
  transport.queueResponse({ shots: [fixture.temporalShot("scene-1-shot-1")] });

  let result = null;
  let failure = "";
  try {
    result = await CreativeTemporalMasterPlanRuntime.create({
      organization_id: ORGANIZATION,
      mission: { id: "m1" },
      project: {
        id: "p1",
        production_type: "VIDEO",
        objective: "temporal contract satisfiability",
        target_duration: 30,
        metadata: { creative_quality_policy: fixture.TEMPORAL_QUALITY },
      },
      brief: { id: "b1", duration_seconds: 30 },
      assets: [{ id: "a1", asset_type: "video", file_name: "clip.mov" }],
    });
  } catch (error) {
    failure = String(error?.message || error).slice(0, 260);
  }

  check("temporal contract is satisfiable", Boolean(result), failure);
  if (!result) return;

  check(
    "temporal plan carries scenes and shots",
    (result.plan.scenes || []).length > 0 &&
      (result.plan.scenes[0].shots || []).length > 0,
  );
  // Needing a repair here would mean the fixture no longer matches the contract, which is
  // the drift this check exists to surface.
  check(
    "a fully specified temporal plan needs no repair",
    (result.contract_repair?.attempts ?? 0) === 0,
    `attempts=${result.contract_repair?.attempts}`,
  );
}

// 10. Direction must survive from the plan, through the production graph, into the
//     instruction the provider actually receives. This is where the studio's output happens
//     and nothing in the build covered it. The identity lock had already been found missing
//     at the serializer -- the binding that preserves a real person's face, absent while the
//     instruction claimed identities were preserved -- so the chain needs a standing guard
//     rather than a one-off check.
//
//     buildProductionGraph is a pure function with no provider and no database, so this
//     costs nothing to run.
async function directionSurvivesIntoProviderInstruction() {
  const { buildProductionGraph } = await import(
    "@/lib/creative/production-graph/planner/ProductionGraphPlanner"
  );
  const { serializeCreativeProviderInstruction } = await import(
    "@/lib/creative/execution/runtime/CreativeProviderInstructionSerializer"
  );
  const fixture = await import("../scripts/creative-temporal-contract-fixture.mjs");

  const plan = fixture.temporalBasePlan();
  plan.story_lineage = {
    story_contract_hash: "a".repeat(16),
    master_plan_hash: "b".repeat(16),
  };
  const scene = fixture.temporalScene("scene-1");
  const shot = fixture.temporalShot("scene-1-shot-1");
  shot.generation.identity_lock = {
    profile_id: "identity-1",
    preserve_exactly: "facial geometry, skin tone, age, hairline, body proportions",
    minimum_identity_score: 90,
  };
  plan.scenes = [{ ...scene, shots: [shot] }];

  let graph = null;
  let failure = "";
  try {
    graph = buildProductionGraph({
      organization_id: ORGANIZATION,
      creative_project_id: "p1",
      storyboard: { id: "sb1", title: "Audit", synopsis: "Audit synopsis" },
      scenes: [scene],
      shots: [{ ...shot, scene_id: "scene-1" }],
      creative_plan: plan,
    });
  } catch (error) {
    failure = String(error?.message || error).slice(0, 200);
  }

  check("production graph builds from a valid plan", Boolean(graph), failure);
  if (!graph) return;

  const generationNodes = (graph.nodes || []).filter(
    (node) => node.generation?.required === true || node.generation?.capability,
  );
  check("graph contains a generation node", generationNodes.length > 0);
  if (!generationNodes.length) return;

  const node = generationNodes[0];
  const instruction = serializeCreativeProviderInstruction(node);

  // Anything present in the node and absent from the instruction is direction lost between
  // planning and execution, which is invisible until it shows up in a finished frame.
  for (const probe of [
    "identity_lock",
    "camera",
    "lighting",
    "action",
    "negative_constraints",
    "primary_source",
  ]) {
    if (!JSON.stringify(node).includes(probe)) continue;
    check(
      `direction reaches the provider: ${probe}`,
      instruction.includes(probe),
      "present in the graph node and absent from the instruction",
    );
  }
}

// 11. The shot call's token budget must scale with the shots it asks for. It was a flat 15,000
//     against a contract requiring around forty fields per shot and a request for up to eight,
//     and the showreel died on OPENAI_TEXT_RESPONSE_NOT_COMPLETE:max_output_tokens. Scene count
//     and shot count interact, so the same film needs different budgets depending on how the
//     architecture step divided it -- which is exactly what a flat ceiling cannot express.
function shotCallBudgetScalesWithShots() {
  const fs = globalThis.__auditFs;
  const source = fs.readFileSync(
    "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
    "utf8",
  );

  check(
    "shot call budget is computed, not a flat literal",
    source.includes("shotCallTokenBudget(shotRange)"),
    "a flat ceiling cannot fit both a three-shot and an eight-shot scene",
  );

  // The whole function body is re-derived, not just its return expression, so a change to how
  // the budget is computed surfaces here rather than silently evaluating against a stale copy.
  // An earlier version of this check captured only the return line and threw on the local it
  // referenced.
  const budget = /function shotCallTokenBudget\(range = \{\}\) \{([\s\S]*?)\n\}/.exec(source);
  check("shot call budget function is present", Boolean(budget));
  if (!budget) return;

  const compute = new Function("range", budget[1]);
  const small = compute({ maximum: 3 });
  const large = compute({ maximum: 8 });

  check(
    "a larger shot request receives a larger budget",
    large > small,
    `3 shots=${small}, 8 shots=${large}`,
  );
  check(
    "an eight-shot scene is budgeted above the old flat ceiling",
    large > 15000,
    `8 shots=${large}`,
  );
  check(
    "the budget stays bounded",
    compute({ maximum: 999 }) <= 32000,
  );
}

async function main() {
  globalThis.__auditFs = await import("node:fs");
  console.log("============================================================");
  console.log("CREATIVE REPAIR PATH AUDIT");
  console.log("============================================================");
  console.log("PROVIDER_CALLS_EXECUTED=NO");
  console.log("DATABASE_READS_EXECUTED=NO");

  await wrappedPlanIsFound();
  await repairWithEmbeddedRoleDecisionsLands();
  skeletonEntryDoesNotEraseDeliverable();
  await runtimeModulesReferenceOnlyRealIdentifiers();
  invalidRepairIsRejectedNotAdopted();
  await temporalPathRepairsBeforeFailing();
  reasoningCallsRequestJsonMode();
  contractStandardMatchesScoring();
  await temporalContractIsSatisfiable();
  await directionSurvivesIntoProviderInstruction();
  shotCallBudgetScalesWithShots();

  console.log(`CHECKS_PASSED=${passes.length}`);
  console.log(`CHECKS_FAILED=${failures.length}`);
  for (const failure of failures) console.log(`FAILURE=${failure}`);

  if (failures.length) {
    console.log("CREATIVE_REPAIR_PATH_AUDIT=FAILED");
    process.exitCode = 1;
    return;
  }
  console.log("CREATIVE_REPAIR_PATH_AUDIT=PASSED");
}

main().catch((error) => {
  console.log("CREATIVE_REPAIR_PATH_AUDIT=FAILED");
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
