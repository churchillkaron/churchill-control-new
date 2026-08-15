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
async function contractStandardMatchesScoring() {
  const fs = globalThis.__auditFs;
  const scorer = fs.readFileSync(
    "lib/creative/quality/runtime/CreativeWorldClassBenchmarkRuntime.js",
    "utf8",
  );
  // The built contract's own field descriptions, read as data rather than scraped out of the source
  // file. Regexing the file worked until a description became a template literal, at which point it
  // would have silently matched nothing and passed for the wrong reason.
  const { CreativeMasterPlanContractRegistry } = await import(
    "@/lib/creative/director/registry/CreativeMasterPlanContractRegistry"
  );
  const reviewContract =
    CreativeMasterPlanContractRegistry.buildDecisionContract("AUDIO")
      .common_plan_contract.creative_review || {};

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
    const text = String(reviewContract[field] ?? "");

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

// 12. The clichés the benchmark penalises must be named to the director, and must not catch honest
//     craft language. The contract asked it to "identify the most likely advertising clichés and
//     design against them" while the benchmark judged against a private list of fourteen -- the
//     same gap that had rejected_patterns supplying three when full marks needed four. Two of those
//     patterns also caught exact craft description: "journey" matched audience and customer
//     journey, and an unanchored "where .* meets .*" matched any sentence with where before meets.
async function genericLanguagePatternsAreFairAndDisclosed() {
  const fs = globalThis.__auditFs;
  const { CREATIVE_GENERIC_LANGUAGE_PATTERNS } = await import(
    "@/lib/creative/quality/runtime/CreativeWorldClassBenchmarkRuntime"
  );
  // The built contract's own field descriptions, read as data rather than scraped out of the source
  // file. Regexing the file worked until a description became a template literal, at which point it
  // would have silently matched nothing and passed for the wrong reason.
  const { CreativeMasterPlanContractRegistry } = await import(
    "@/lib/creative/director/registry/CreativeMasterPlanContractRegistry"
  );
  const reviewContract =
    CreativeMasterPlanContractRegistry.buildDecisionContract("AUDIO")
      .common_plan_contract.creative_review || {};

  const { genericLanguageHits, scoreCreativeWorldClassBenchmarkCase } = await import(
    "@/lib/creative/quality/runtime/CreativeWorldClassBenchmarkRuntime"
  );

  const hits = (value) =>
    CREATIVE_GENERIC_LANGUAGE_PATTERNS.filter(
      (entry) => (value.toLowerCase().match(entry.pattern) || []).length,
    ).map((entry) => entry.id);

  // The penalty in the score must be computed from this same list. Testing the exported list alone is
  // what let a stale inline copy survive inside genericLanguagePenalty: the list was narrowed, the
  // diagnostic reported the narrowed result, and the score went on using the broad originals.
  // churchill-audio-package exposed it by reporting a penalty of 35 alongside hits worth 21.
  const probePlan = {
    workflow_kind: "AUDIO",
    concept: {
      title: "t",
      creative_thesis: "seamless transitions, seamless mix, seamless handoff",
      narrative: "the audience journey from door to table",
      creative_system: "framing where the bar rail meets the window light",
      hook: "h", message: "m", emotional_promise: "e", call_to_action: "c",
      signature_device: "d", refused_devices: "r",
    },
    creative_review: {
      passed: true, overall_score: 95, dimensions: {},
      rejected_patterns: [], craft_risks: [], finishing_requirements: [],
      selected_direction_reason: "r",
    },
    deliverables: [], production: {},
  };
  const reportedHits = genericLanguageHits(probePlan)
    .reduce((sum, entry) => sum + entry.count, 0);
  const scoredPenalty = scoreCreativeWorldClassBenchmarkCase({
    id: "probe", label: "probe", benchmark: {}, master_plan: { plan: probePlan },
  }).metrics.generic_language_penalty;

  check(
    "the scored penalty is computed from the disclosed list",
    scoredPenalty === Math.min(35, reportedHits * 7),
    `hits=${reportedHits} expected=${Math.min(35, reportedHits * 7)} scored=${scoredPenalty}`,
  );
  check(
    "craft language contributes nothing to the scored penalty",
    scoredPenalty === 21,
    `three cliché uses should score 21, got ${scoredPenalty}`,
  );

  // The built contract rather than the source file. The disclosure is derived from the filler registry
  // now, so grepping the file for literal phrases would fail on a correctly derived disclosure and pass
  // on a hardcoded one that had drifted from the list -- the wrong artefact in both directions.
  const excellenceGate = CreativeMasterPlanContractRegistry
    .buildDecisionContract("AUDIO").pre_return_excellence_gate;
  const disclosedContract = `${excellenceGate.anti_cliche_test} ${excellenceGate.craft_translation}`;

  check(
    "the penalised clichés are disclosed in the contract",
    /elevate your/i.test(disclosedContract) && /cutting-edge/i.test(disclosedContract),
    "the director is judged against a list it is never shown",
  );

  // Craft and strategy language must not be scored as advertising filler.
  for (const honest of [
    "the audience journey from doorway to table",
    "customer journey mapping informs the sequence",
    "a shot list where camera movement meets the beat of the track",
    "framing where the bar rail meets the window light",
  ]) {
    const fired = hits(honest);
    check(
      `craft language is not penalised: "${honest.slice(0, 44)}"`,
      fired.length === 0,
      fired.join(","),
    );
  }

  // Real clichés must still be caught, including every inflection of redefine, which the original
  // pattern could not match in its commonest form.
  for (const cliche of [
    "Where luxury meets convenience.",
    "elevate your evening",
    "begin your journey with us",
    "redefining the sports bar",
    "redefines the category",
    "cutting-edge sound design",
  ]) {
    check(
      `cliché is caught: "${cliche.slice(0, 40)}"`,
      hits(cliche).length > 0,
      "advertising filler scoring as acceptable direction",
    );
  }
}

// 13. A panel one reviewer over the bound must not lose the case. food-editorial returned seven
//     reviewers against a maximum of six and was thrown away at
//     CREATIVE_TRIBUNAL_REVIEWER_COUNT_INVALID:7 -- after its plan had been built and scored, for a
//     violation the planner can simply be told about. The panel is one cheap call next to the six
//     reviews that follow it.
//
//     Trimming the list here was the alternative and was rejected: dropping a discipline the
//     planner judged necessary would also make unanimity easier to reach, and that is not a change
//     to make silently while trying to pass a benchmark.
async function panelCountViolationIsReplannedOnce() {
  const { CreativeDynamicTribunalRuntime } = await import(
    "@/lib/creative/director/runtime/CreativeDynamicTribunalRuntime"
  );
  const transport = await import(
    "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime"
  );
  const fixture = await import("../scripts/creative-temporal-contract-fixture.mjs");

  const reviewer = (index) => ({
    id: `r${index}`,
    role: "discipline role",
    weight: 1,
    mandate: "a specific independent review responsibility of adequate length to pass",
  });
  const panelOf = (count) => ({
    reviewers: Array.from({ length: count }, (_, index) => reviewer(index + 1)),
    rationale: "sufficient for this mission",
  });

  async function panelCallsFor(panels) {
    transport.resetTransport();
    for (const panel of panels) transport.queueResponse(panel);
    for (let index = 1; index <= 8; index += 1) {
      transport.queueResponse({
        reviewer_id: `r${index}`, score: 95, passed: true, strengths: ["s"],
        failures: [], mandatory_repairs: [], fatal_rejection_reason: null,
        weakest_link: "minor", evidence_used: ["e"],
      });
    }
    const plan = fixture.temporalBasePlan();
    plan.quality = fixture.TEMPORAL_QUALITY;
    let error = null;
    try {
      await CreativeDynamicTribunalRuntime.review({
        organization_id: ORGANIZATION,
        creative_project_id: "p1",
        creative_mission_id: "m1",
        mission: { id: "m1" }, project: { id: "p1" }, brief: { id: "b1" },
        assets: [{ id: "a1" }], available_capabilities: [], master: { plan },
      });
    } catch (caught) {
      error = String(caught?.message || caught);
    }
    return {
      calls: transport.recordedCalls().filter(
        (entry) => entry.operation === "CREATIVE_DYNAMIC_TRIBUNAL_PANEL_V1",
      ).length,
      error,
    };
  }

  const corrected = await panelCallsFor([panelOf(7), panelOf(4)]);
  check(
    "an over-bound panel is replanned once",
    corrected.calls === 2,
    `panel calls=${corrected.calls}`,
  );
  check(
    "a replanned panel proceeds past the count check",
    !String(corrected.error || "").includes("REVIEWER_COUNT_INVALID"),
    corrected.error?.slice(0, 90),
  );

  const persistent = await panelCallsFor([panelOf(7), panelOf(7)]);
  check(
    "a panel still out of range after replanning fails closed",
    String(persistent.error || "").includes("REVIEWER_COUNT_INVALID") && persistent.calls === 2,
    `calls=${persistent.calls} error=${persistent.error?.slice(0, 60)}`,
  );

  const compliant = await panelCallsFor([panelOf(3)]);
  check(
    "a compliant panel is not replanned",
    compliant.calls === 1,
    `panel calls=${compliant.calls}`,
  );
}

// 14. One failed scene must not lose the film. A film is one shot call per scene, so a 205 second
//     master is around fifteen calls after the base plan and architecture. A single unparseable
//     response or empty shots array used to throw and discard every completed scene with it -- the
//     most expensive failure in the studio, and the one that killed both Cole films at different
//     points.
async function oneFailedSceneDoesNotLoseTheFilm() {
  const { CreativeTemporalMasterPlanRuntime } = await import(
    "@/lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime"
  );
  const transport = await import(
    "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime"
  );
  const fixture = await import("../scripts/creative-temporal-contract-fixture.mjs");

  async function attempt(shotResponses) {
    transport.resetTransport();
    transport.queueResponse(fixture.temporalBasePlan());
    transport.queueResponse({ scenes: [fixture.temporalScene("scene-1")] });
    for (const response of shotResponses) transport.queueResponse(response);
    for (let index = 0; index < 3; index += 1) transport.queueResponse({});

    let succeeded = false;
    try {
      await CreativeTemporalMasterPlanRuntime.create({
        organization_id: ORGANIZATION,
        mission: { id: "m1" },
        project: {
          id: "p1", production_type: "VIDEO", objective: "scene retry audit",
          target_duration: 30,
          metadata: { creative_quality_policy: fixture.TEMPORAL_QUALITY },
        },
        brief: { id: "b1", duration_seconds: 30 },
        assets: [{ id: "a1", asset_type: "video", file_name: "clip.mov" }],
      });
      succeeded = true;
    } catch {
      succeeded = false;
    }
    return {
      succeeded,
      shotCalls: transport.recordedCalls().filter(
        (entry) => entry.operation === "TEMPORAL_SCENE_SHOT_DIRECTION_V1",
      ).length,
    };
  }

  const good = fixture.temporalShot("scene-1-shot-1");

  const recovered = await attempt([{ shots: [] }, { shots: [good] }]);
  check(
    "a scene that fails once is retried and the film survives",
    recovered.succeeded && recovered.shotCalls === 2,
    `succeeded=${recovered.succeeded} shot calls=${recovered.shotCalls}`,
  );

  const clean = await attempt([{ shots: [good] }]);
  check(
    "a scene that succeeds first time is not retried",
    clean.succeeded && clean.shotCalls === 1,
    `shot calls=${clean.shotCalls}`,
  );

  const persistent = await attempt([{ shots: [] }, { shots: [] }]);
  check(
    "a scene that fails twice still fails closed",
    !persistent.succeeded && persistent.shotCalls === 2,
    `succeeded=${persistent.succeeded} shot calls=${persistent.shotCalls}`,
  );
}

// 15. The request must not carry craft guidance for media the job is not in. The seven workflow
//     contracts were 10,345 of 25,899 characters -- forty per cent of the request -- and six of them
//     described a different medium. An audio package was carrying the full temporal, still, document,
//     interactive, software and campaign craft contracts, all visually oriented, and audio has been
//     the weakest case in every run.
async function requestIsScopedToTheOperativeWorkflow() {
  const { CreativeMasterPlanContractRegistry } = await import(
    "@/lib/creative/director/registry/CreativeMasterPlanContractRegistry"
  );

  // Calling it at all is part of the check: an earlier version of this scoping referenced a text()
  // helper the module does not have, which node --check cannot see and only a call reveals.
  let unscoped;
  let scoped;
  try {
    unscoped = CreativeMasterPlanContractRegistry.buildDecisionContract();
    scoped = CreativeMasterPlanContractRegistry.buildDecisionContract("AUDIO");
  } catch (error) {
    check("decision contract builds", false, String(error?.message).slice(0, 120));
    return;
  }
  check("decision contract builds", true);

  check(
    "scoping the workflow shrinks the request",
    JSON.stringify(scoped).length < JSON.stringify(unscoped).length,
  );
  check(
    "every workflow kind is still listed",
    scoped.workflow_contracts.length === unscoped.workflow_contracts.length,
  );

  const operative = scoped.workflow_contracts.find((entry) => entry.workflow_kind === "AUDIO");
  check(
    "the operative workflow keeps its full contract",
    Boolean(operative?.contract?.required_sections?.length),
  );
  check(
    "non-operative workflows carry identity only",
    scoped.workflow_contracts
      .filter((entry) => entry.workflow_kind !== "AUDIO")
      .every((entry) => !entry.contract && entry.workflow_kind && entry.executor),
  );
  // With no declared medium the model must still be able to choose, so every contract is sent.
  check(
    "an undetermined medium still receives every contract",
    unscoped.workflow_contracts.every((entry) => Boolean(entry.contract)),
  );
}

// 16. The temporal repair must be able to fix a field nested inside a shot. This is the mechanism
//     both Cole films now depend on: their remaining failures are shot-level completeness --
//     SHOT_OUTPUT_SPEC_REQUIRED, SHOT_GENERATION_REQUIRED_FLAG_INVALID,
//     SHOT_SAFETY_AND_REPAIR_DETAIL_REQUIRED -- against a contract of around forty fields per shot.
//
//     Checking the prompt first showed it already names every field the validator requires, so the
//     answer is not more instruction text. It is whether a repair returning one nested field lands
//     without flattening the shot around it, which needs the identity-matched array merge to work
//     three levels deep: scenes by id, shots by id, then the field itself.
async function temporalRepairFixesANestedShotField() {
  const { CreativeTemporalMasterPlanRuntime } = await import(
    "@/lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime"
  );
  const transport = await import(
    "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime"
  );
  const fixture = await import("../scripts/creative-temporal-contract-fixture.mjs");

  const broken = fixture.temporalShot("scene-1-shot-1");
  delete broken.generation.output_spec.resolution;

  transport.resetTransport();
  transport.queueResponse(fixture.temporalBasePlan());
  transport.queueResponse({ scenes: [fixture.temporalScene("scene-1")] });
  transport.queueResponse({ shots: [broken] });
  transport.queueResponse({
    scenes: [{
      id: "scene-1",
      shots: [{ id: "scene-1-shot-1", generation: { output_spec: { resolution: "1920x1080" } } }],
    }],
  });
  transport.queueResponse({});

  let plan = null;
  let failure = "";
  try {
    const result = await CreativeTemporalMasterPlanRuntime.create({
      organization_id: ORGANIZATION,
      mission: { id: "m1" },
      project: {
        id: "p1", production_type: "VIDEO", objective: "nested shot repair audit",
        target_duration: 30,
        metadata: { creative_quality_policy: fixture.TEMPORAL_QUALITY },
      },
      brief: { id: "b1", duration_seconds: 30 },
      assets: [{ id: "a1", asset_type: "video", file_name: "clip.mov" }],
    });
    plan = result.plan;
  } catch (error) {
    failure = String(error?.message || error).slice(0, 200);
  }

  check("a repair reaching into a shot lands", Boolean(plan), failure);
  if (!plan) return;

  const shot = plan.scenes?.[0]?.shots?.[0] || {};
  check(
    "the repaired field is present",
    shot.generation?.output_spec?.resolution === "1920x1080",
  );
  // The point of merging rather than replacing: everything the repair did not mention survives.
  check("sibling output_spec fields survive", shot.generation?.output_spec?.width === 1920);
  check("the shot's own direction survives", Boolean(shot.title) && Boolean(shot.camera?.framing));
}

// 17. Scene shot planning must run concurrently and still come back in scene order. Each scene is
//     planned independently -- shotPlanPrompt receives the base plan, its own scene and the output
//     spec, and never sees another scene's shots -- so running fifteen of them one after another for
//     a 205 second master bought nothing and cost most of the fifty minutes a single film took to
//     produce direction, with no media generated at all.
//
//     Concurrency is only safe if order survives it, because scene order is the film.
async function sceneShotPlanningRunsConcurrentlyInOrder() {
  const { CreativeTemporalMasterPlanRuntime } = await import(
    "@/lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime"
  );
  const transport = await import(
    "@/lib/platform/service-runtime/execution/ServiceExecutionRuntime"
  );
  const fixture = await import("../scripts/creative-temporal-contract-fixture.mjs");

  const sceneCount = 6;
  transport.resetTransport();
  transport.queueResponse(fixture.temporalBasePlan());
  transport.queueResponse({
    scenes: Array.from({ length: sceneCount }, (_, index) => ({
      ...fixture.temporalScene(`scene-${index + 1}`),
      duration_seconds: 5,
      // Distinct objectives: the validator requires each scene to advance a different one.
      objective: `Scene ${index + 1} advances a distinct and specific story objective for this film.`,
    })),
  });
  for (let index = 1; index <= sceneCount; index += 1) {
    const shot = fixture.temporalShot(`scene-${index}-shot-1`);
    shot.duration_seconds = 5;
    // Generated output duration must match the directed shot duration.
    shot.generation.output_spec.duration_seconds = 5;
    transport.queueResponse({ shots: [shot] });
  }
  for (let index = 0; index < 3; index += 1) transport.queueResponse({});

  let plan = null;
  let failure = "";
  try {
    const result = await CreativeTemporalMasterPlanRuntime.create({
      organization_id: ORGANIZATION,
      mission: { id: "m1" },
      project: {
        id: "p1", production_type: "VIDEO", objective: "concurrency audit",
        target_duration: 30,
        metadata: { creative_quality_policy: fixture.TEMPORAL_QUALITY },
      },
      brief: { id: "b1", duration_seconds: 30 },
      assets: [{ id: "a1", asset_type: "video", file_name: "clip.mov" }],
    });
    plan = result.plan;
  } catch (error) {
    failure = String(error?.message || error).slice(0, 160);
  }

  check("a multi-scene film plans successfully", Boolean(plan), failure);
  if (!plan) return;

  const ids = (plan.scenes || []).map((scene) => scene.id);
  const expected = Array.from({ length: sceneCount }, (_, index) => `scene-${index + 1}`);
  check(
    "scene order survives concurrent planning",
    JSON.stringify(ids) === JSON.stringify(expected),
    ids.join(","),
  );
  check(
    "every scene received its shots",
    (plan.scenes || []).every((scene) => (scene.shots || []).length > 0),
  );
  check(
    "one shot call per scene, no duplicates from the waves",
    transport.recordedCalls().filter(
      (entry) => entry.operation === "TEMPORAL_SCENE_SHOT_DIRECTION_V1",
    ).length === sceneCount,
  );
}

// 18. Every penalised cliché must be findable in what the director is told, and the instruction must
//     require replacing it rather than merely avoiding it. Re-scoring a saved direction showed the
//     whole remaining gap on an audio case was one word used three times: at the corrected penalty it
//     scored 70.66 against a case floor of 82, and removing that word alone would put it near 91.
//
//     The two rules were disconnected. anti_cliche_test forbade "seamless" while craft_translation --
//     which requires abstract adjectives to be replaced by observable craft -- did not list it, so the
//     director was told not to use a word without being told what it stands in for.
async function everyPenalisedClicheIsDisclosedAndReplaceable() {
  const { CREATIVE_GENERIC_LANGUAGE_PATTERNS } = await import(
    "@/lib/creative/quality/runtime/CreativeWorldClassBenchmarkRuntime"
  );
  const { CreativeMasterPlanContractRegistry } = await import(
    "@/lib/creative/director/registry/CreativeMasterPlanContractRegistry"
  );

  const gate = CreativeMasterPlanContractRegistry.buildDecisionContract("AUDIO")
    .pre_return_excellence_gate;
  const disclosure = `${gate.anti_cliche_test} ${gate.craft_translation}`.toLowerCase();

  const phrases = {
    elevate_your: "elevate your",
    unforgettable_experience: "unforgettable experience",
    where_x_meets_y: "where x meets y",
    more_than_just: "more than just",
    discover_the_difference: "discover the difference",
    unlock_potential: "unlock potential",
    redefine: "redefine",
    journey: "journey",
    premium_experience: "premium experience",
    seamless: "seamless",
    innovative_solutions: "innovative solutions",
    cutting_edge: "cutting-edge",
    game_changer: "game-changer",
    transform_your: "transform your",
  };

  const undisclosed = CREATIVE_GENERIC_LANGUAGE_PATTERNS
    .map((entry) => entry.id)
    .filter((id) => !phrases[id] || !disclosure.includes(phrases[id]));

  check(
    "every penalised cliché is disclosed to the director",
    undisclosed.length === 0,
    undisclosed.join(","),
  );
  check(
    "seamless is classified as an abstract adjective requiring craft",
    gate.craft_translation.toLowerCase().includes("seamless"),
  );
  check(
    "the instruction requires replacement, not only avoidance",
    /replace it with the observable execution/i.test(gate.anti_cliche_test),
  );
  check(
    "a concrete replacement is given rather than an abstract rule",
    /no audible edit point|matched room tone|crossfade/i.test(gate.craft_translation),
  );
}

// 19. Advertising filler must be rejected by the gate, not only scored. This is why telling the
//     director to avoid it failed twice: filler was punished at scoring and never rejected anywhere, so
//     the repair loop was never told. GENERIC_DIRECTION in the validator only matches a whole field that
//     is a placeholder -- n/a, tbd -- so "seamlessly integrated mix" inside good prose passed validation
//     and the gate untouched, then lost 21 points and failed outright.
//
//     Disclosure was added and the next run used "seamless" three times. A concrete replacement was
//     added and the run after used "seamlessly" twice plus "premium experience". Prompting was the wrong
//     lever; the repair paths work when the gate names the problem.
async function advertisingFillerIsRejectedNotOnlyScored() {
  const { validateCreativeMasterPlanDecision } = await import(
    "@/lib/creative/director/validation/CreativeMasterPlanDecisionGate"
  );
  const { genericLanguageHits, CREATIVE_GENERIC_LANGUAGE_PATTERNS } = await import(
    "@/lib/creative/quality/runtime/CreativeWorldClassBenchmarkRuntime"
  );
  const { CREATIVE_ADVERTISING_FILLER, advertisingFillerDisclosure } = await import(
    "@/lib/creative/director/registry/CreativeAdvertisingFillerRegistry"
  );

  const planWith = (thesis) => ({
    workflow_kind: "AUDIO",
    concept: {
      title: "t", creative_thesis: thesis, narrative: "n", hook: "h", message: "m",
      creative_system: "c", emotional_promise: "e", call_to_action: "a",
      signature_device: "d", refused_devices: "r",
    },
    creative_review: {
      passed: true, overall_score: 95, dimensions: {}, rejected_patterns: [],
      craft_risks: [], finishing_requirements: [], selected_direction_reason: "r",
    },
    deliverables: [], production: {},
  });
  const rejected = (thesis) =>
    validateCreativeMasterPlanDecision({ plan: planWith(thesis), available_capabilities: [] })
      .failures.some((entry) => entry.code === "ADVERTISING_FILLER_REJECTED");

  // The exact combination that cost a real case: premium experience once, seamless twice.
  check(
    "three filler uses are rejected by the gate",
    rejected("seamless mix, seamlessly cut, a premium experience"),
    "the repair loop is never told and the case is lost at scoring",
  );
  check(
    "two uses are not rejected",
    !rejected("seamless mix and seamlessly cut"),
    "the threshold should match the benchmark's own hard failure",
  );
  check(
    "craft language is not rejected as filler",
    !rejected("the audience journey where the bar rail meets the window light"),
  );

  // One list behind disclosure, rejection and scoring. A private copy in any of the three is how the
  // score came to charge for patterns the disclosure had already narrowed.
  check(
    "the benchmark uses the registry list rather than a copy",
    CREATIVE_GENERIC_LANGUAGE_PATTERNS === CREATIVE_ADVERTISING_FILLER,
  );
  check(
    "the disclosure is derived from the same list",
    CREATIVE_ADVERTISING_FILLER.every((entry) =>
      advertisingFillerDisclosure().includes(entry.phrase),
    ),
  );
  check(
    "the scorer and the gate see the same hits",
    genericLanguageHits(planWith("seamless seamlessly premium experience"))
      .reduce((sum, entry) => sum + entry.count, 0) === 3,
  );
}

// 20. Roles the registry says cannot apply to a medium must be completed from the registry, not demanded
//     from the director. Every film attempt today failed partly on
//     AGENCY_ROLE_DECISION_REQUIRED@role_decisions.experience_director and .technical_architect. Those
//     roles are registered INTERACTIVE, and INTERACTIVE plus SOFTWARE, so neither can apply to a film --
//     the registry says so before anyone is asked. The director was told about them and sensibly omitted
//     them, and around fifteen calls of story, scene architecture and shot direction were rejected for
//     not declaring inapplicable disciplines inapplicable.
//
//     The accountability that matters is untouched: a role that could have applied and was skipped still
//     fails, and an explicit decision is never overwritten.
async function ineligibleRolesAreDerivedNotDemanded() {
  const { applyDerivedRoleDecisions } = await import(
    "@/lib/creative/director/planner/creativeRoleDecisionDefaults"
  );
  const { CREATIVE_AGENCY_ROLES } = await import(
    "@/lib/creative/director/registry/CreativeAgencyRoleRegistry"
  );

  const film = applyDerivedRoleDecisions(
    { workflow_kind: "TEMPORAL", role_decisions: {} },
    CREATIVE_AGENCY_ROLES,
  ).role_decisions;

  for (const id of ["experience_director", "technical_architect"]) {
    check(
      `ineligible role is derived for a film: ${id}`,
      film[id]?.status === "NOT_REQUIRED" && film[id]?.derived_from_registry === true,
      JSON.stringify(film[id] || null),
    );
  }

  // The judgement for a role that could apply stays the director's.
  const wronglyFilled = CREATIVE_AGENCY_ROLES.filter(
    (role) =>
      (role.applies_to.includes("ALL") || role.applies_to.includes("TEMPORAL")) &&
      Object.prototype.hasOwnProperty.call(film, role.id),
  ).map((role) => role.id);
  check(
    "no eligible role is filled in for the director",
    wronglyFilled.length === 0,
    wronglyFilled.join(","),
  );

  const explicit = applyDerivedRoleDecisions(
    {
      workflow_kind: "TEMPORAL",
      role_decisions: { experience_director: { status: "ACTIVE", decision: "deliberate choice" } },
    },
    CREATIVE_AGENCY_ROLES,
  ).role_decisions;
  check(
    "an explicit decision is never overwritten",
    explicit.experience_director.status === "ACTIVE" &&
      !explicit.experience_director.derived_from_registry,
  );

  // The same roles are eligible for interactive work and must not be derived away there.
  const interactive = applyDerivedRoleDecisions(
    { workflow_kind: "INTERACTIVE", role_decisions: {} },
    CREATIVE_AGENCY_ROLES,
  ).role_decisions;
  check(
    "a role eligible for another medium is not derived there",
    !interactive.experience_director,
  );
}

// 21. Form must be the story's decision, not arithmetic on the running time.
//
//     sceneCountRange computed duration / 14 and forced the result into a narrow band, so a 205 second
//     film could only ever be 13 to 18 scenes. It could not be one continuous take, three long movements,
//     or forty rapid fragments. Every film of a given length came out the same shape, which is how a
//     studio produces competent forgettable work. shotCountRange nearly repeated the mistake: narrowing
//     it to enforce a 6.5 second average would have forbidden a fast-cut passage outright.
//
//     The contract also policed language without policing form -- it rejected advertising clichés while
//     leaving structure entirely unexamined.
function formIsChosenNotDerived() {
  const fs = globalThis.__auditFs;
  const source = fs.readFileSync(
    "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
    "utf8",
  );

  const sceneRange = /function sceneCountRange\(duration\) \{([\s\S]*?)\n\}/.exec(source);
  const shotRange = /function shotCountRange\(duration\) \{([\s\S]*?)\n\}/.exec(source);
  check("scene and shot ranges are present", Boolean(sceneRange && shotRange));
  if (!sceneRange || !shotRange) return;

  const scenes = new Function("duration", sceneRange[1])(205.16);
  const shots = new Function("duration", shotRange[1])(205.16 / 13);

  check(
    "a single continuous take is permitted",
    scenes.minimum === 1,
    `minimum ${scenes.minimum} scenes forbids it on arithmetic grounds`,
  );
  check(
    "a rapid montage is permitted",
    scenes.maximum >= 20,
    `maximum ${scenes.maximum} scenes`,
  );
  check(
    "the derived number is a reference, not the whole range",
    scenes.maximum - scenes.minimum >= 15,
    `range spans only ${scenes.maximum - scenes.minimum}`,
  );
  // A scene must still be able to hold a fast sequence rather than an enforced average.
  check(
    "a scene may hold a fast-cut sequence",
    shots.maximum >= 6,
    `maximum ${shots.maximum} shots per scene`,
  );

  const prompt = source.slice(source.indexOf("function sceneArchitecturePrompt"));
  check(
    "the director is told the structure is its to invent",
    /STRUCTURE IS YOURS TO INVENT/.test(prompt) &&
      /unbroken take|continuous unbroken take/i.test(prompt),
  );
  check(
    "the director is told shot length follows the action",
    /Shot length is a story decision, not an average/.test(source),
  );
}

// 22. The contract must require invention in form, not only in language.
async function contractRequiresStructuralInvention() {
  const { CreativeMasterPlanContractRegistry } = await import(
    "@/lib/creative/director/registry/CreativeMasterPlanContractRegistry"
  );
  const gate = CreativeMasterPlanContractRegistry.buildDecisionContract("TEMPORAL")
    .pre_return_excellence_gate;

  check("structural invention is part of the excellence gate", Boolean(gate.structural_invention));
  if (!gate.structural_invention) return;

  check(
    "unconventional forms are named as available",
    /unbroken take|non-linear|repeating motif/i.test(gate.structural_invention),
  );
  check(
    "the default shape is rejected",
    /the one anybody would default to/i.test(gate.structural_invention),
  );
  // Without this the rule becomes an instruction to be strange, which is its own kind of bad work.
  check(
    "novelty for its own sake is excluded",
    /novelty for its own sake/i.test(gate.structural_invention),
  );
  check(
    "stills are covered, not only film",
    /a still may be/i.test(gate.structural_invention),
  );
}

// 23. Imagination has to be demanded, not hoped for. The contract asked for ten camera fields per
// shot and nothing about what makes the work memorable, so competent coverage satisfied it. These
// checks assert the surface is examined: a declared device, the reflex answers rejected, a form for
// the call to action, and typography and effects treated as instruments rather than a caption layer
// and a cleanup pass.
async function contractRequiresSurfaceInvention() {
  const { CreativeMasterPlanContractRegistry } = await import(
    "@/lib/creative/director/registry/CreativeMasterPlanContractRegistry"
  );
  const contract = CreativeMasterPlanContractRegistry.buildDecisionContract("TEMPORAL");
  const gate = contract.pre_return_excellence_gate;
  const concept = contract.common_plan_contract?.concept || {};
  // The shot schema is disclosed through the workflow contracts, not common_plan_contract, so
  // resolve it from the serialised contract the model actually receives rather than from a path
  // that happens to exist. A guard that reads a private copy passes while the model sees nothing.
  const shot = (() => {
    const found = [];
    const walk = (node) => {
      if (!node || typeof node !== "object") return;
      if (!Array.isArray(node) && typeof node.purpose === "string" && typeof node.camera === "string") {
        found.push(node);
      }
      for (const value of Object.values(node)) walk(value);
    };
    walk(contract);
    return found[0] || {};
  })();

  check("surface invention is part of the excellence gate", Boolean(gate.surface_invention));
  if (gate.surface_invention) {
    // The specific failure the user named: a camera move described in detail is craft, and the
    // contract used to accept it as the whole of the idea.
    check(
      "camera movement is explicitly not a device",
      /camera movement is not a device/i.test(gate.surface_invention),
    );
    check(
      "typography and effects are named as instruments",
      /typograph/i.test(gate.surface_invention) && /not a finishing layer/i.test(gate.surface_invention),
    );
    check(
      "the call to action must take a form",
      /call to action/i.test(gate.surface_invention) &&
        /never the default/i.test(gate.surface_invention),
    );
    // A device on every shot is decoration; the gate has to say so or it produces maximalism.
    check(
      "restraint is required alongside invention",
      /decoration|leave the rest plain/i.test(gate.surface_invention),
    );
    check(
      "stills are covered, not only film",
      /stills/i.test(gate.surface_invention),
    );
  }

  check("the concept must declare a signature device", Boolean(concept.signature_device));
  check("the concept must reject the reflex devices", Boolean(concept.refused_devices));
  check(
    "refused devices must name mechanisms rather than categories",
    /push-in|title card|logo end frame/i.test(String(concept.refused_devices)),
  );
  check("every shot must state its part in the device", Boolean(shot.device));
  check(
    "a deliberately plain shot is a valid answer",
    /plain/i.test(String(shot.device)),
  );
  // The two fields that could carry a device used to argue against using one.
  check(
    "typography is no longer described as a caption layer",
    /creative instrument/i.test(String(shot.graphics)) &&
      !/^Typography and graphic behavior as a caption/.test(String(shot.graphics)),
  );
  check(
    "an effect may be the idea itself",
    /the idea itself/i.test(String(shot.vfx)),
  );
  // The fidelity rule is a rights constraint and must survive the rewrite.
  check(
    "text fidelity outside generated pixels is preserved",
    /outside generated pixels/i.test(String(shot.graphics)),
  );
}

// 24. The prompt and the validator must agree on field names. The temporal skeleton asked the
// director for concept.visual_system while the validator required concept.creative_system, with no
// normalisation on that path -- so every film failed validation on a field-name mismatch and spent
// one of its two repair attempts renaming a field. Nothing detected it because both sides were
// internally valid. This compares the two directly.
async function promptSkeletonMatchesValidatorRequirements() {
  const { readFileSync } = globalThis.__auditFs;
  const runtime = readFileSync(
    "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
    "utf8",
  );
  const validator = readFileSync(
    "lib/creative/director/validation/CreativeMasterPlanValidator.js",
    "utf8",
  );

  const conceptBlock = /const concept = object\(normalized\.concept\);\s*for \(const field of \[([\s\S]*?)\]\)/
    .exec(validator);
  check("the validator's required concept fields are readable", Boolean(conceptBlock));
  if (!conceptBlock) return;

  const required = [...conceptBlock[1].matchAll(/"(\w+)"/g)].map((match) => match[1]);
  check("the concept requirement list is non-trivial", required.length >= 8, `${required.length} fields`);

  const skeleton = runtime.slice(
    runtime.indexOf('"workflow_kind": "TEMPORAL"'),
    runtime.indexOf('"story": {'),
  );
  const missing = required.filter((field) => !skeleton.includes(`"${field}"`));
  check(
    "every required concept field is asked for in the prompt skeleton",
    missing.length === 0,
    `never requested: ${missing.join(", ")}`,
  );

  // The same class of drift for the shot contract, which is where the field count is highest.
  const shotSkeletonStart = runtime.indexOf('"id": "stable unique shot id"');
  check("the shot skeleton is locatable", shotSkeletonStart > 0);
  if (shotSkeletonStart < 0) return;
  // There are three MANDATORY RULES blocks in this file; the shot one is the first after the
  // skeleton opens, and slicing to the earliest match produced an empty string that passed nothing.
  const shotSkeleton = runtime.slice(
    shotSkeletonStart,
    runtime.indexOf("MANDATORY RULES", shotSkeletonStart),
  );
  check("the shot skeleton is non-empty", shotSkeleton.length > 400, `${shotSkeleton.length} chars`);
  const shotBlock = /function validateShot\([\s\S]*?for \(const \[field, minimum\] of \[([\s\S]*?)\]\)/
    .exec(validator);
  check("the validator's required shot fields are readable", Boolean(shotBlock));
  if (!shotBlock) return;

  const shotRequired = [...shotBlock[1].matchAll(/\["(\w+)"/g)].map((match) => match[1]);
  const shotMissing = shotRequired.filter((field) => !shotSkeleton.includes(`"${field}"`));
  check(
    "every required shot field is asked for in the shot skeleton",
    shotMissing.length === 0,
    `never requested: ${shotMissing.join(", ")}`,
  );

  check(
    "the director is told the device is its to invent",
    /THE DEVICE IS YOURS TO INVENT/.test(runtime),
  );
  check(
    "the shot call is told a camera move is not a device",
    /a push-in is camera behaviour, not a device/.test(runtime),
  );
}

// 25. The prompt must not name a provider capability, and its example values must be values the
// validator accepts. The shot skeleton did both wrong: it wrote "service": "ai.video.generate"
// literally -- a hardcoded capability in a runtime that resolves everything else from the
// organization -- and it showed "output_spec": {} as the example, which is exactly the empty object
// the validator rejects with SHOT_OUTPUT_SPEC_REQUIRED. Every shot of every film copied the example
// and failed. Field-name checks cannot catch this; the example value has to be checked too.
async function promptExamplesAreValidAndCapabilityFree() {
  const { readFileSync } = globalThis.__auditFs;
  const runtime = readFileSync(
    "lib/creative/director/runtime/CreativeTemporalMasterPlanRuntime.js",
    "utf8",
  );

  // Scope this to the text that actually reaches the model. Two references in this file are
  // legitimate and a whole-file grep condemns both: the runtime names ai.reasoning.execute to make
  // its own reasoning calls, which is transport rather than a creative capability the director plans
  // against, and a comment quotes the id this check exists to prevent.
  //
  // The prompts are template literals, so read those directly. Matching function bodies with a lazy
  // /\n\}/ terminator silently stopped at the first closing brace inside the JSON skeleton, which
  // truncated the text before the generation block and made this check pass against nothing -- a
  // reinstated "ai.video.generate" went undetected until the mutation test.
  const promptText = runtime
    .split("`")
    .filter((_, index) => index % 2 === 1)
    .join("\n")
    .replace(/^\s*\/\/.*$/gm, "");
  check(
    "the prompt template literals are locatable",
    promptText.includes("MANDATORY RULES") && promptText.length > 6000,
    `${promptText.length} chars`,
  );
  const hardcoded = [...promptText.matchAll(/"(ai\.[a-z0-9_.]+)"/g)].map((match) => match[1]);
  check(
    "the temporal prompt names no provider capability literally",
    hardcoded.length === 0,
    `hardcoded: ${[...new Set(hardcoded)].join(", ")}`,
  );
  check(
    "the temporal path resolves capabilities from the organization",
    /availableProductionCapabilities\(organization_id\)/.test(runtime),
  );
  // Assert the list itself is interpolated, not merely that the heading is mentioned. The mandatory
  // rule below the skeleton names the same heading, so testing for the phrase alone passed while the
  // resolved pairs had been removed from the prompt entirely.
  check(
    "the resolved capability pairs are interpolated into the shot prompt",
    /PRODUCTION CAPABILITIES YOU MAY PLAN AGAINST: \$\{JSON\.stringify\(capabilityPairs\)\}/
      .test(runtime),
  );

  const start = runtime.indexOf('"id": "stable unique shot id"');
  if (start < 0) return check("the shot skeleton is locatable for example checks", false);
  const skeleton = runtime.slice(start, runtime.indexOf("MANDATORY RULES", start));

  // The validator rejects an empty generation.output_spec, so the prompt must never demonstrate one.
  // Check every output_spec example in every prompt, not only the shot skeleton: the deliverable
  // skeleton carries one too, and the validator rejects an empty object in both places.
  const outputSpecExamples = [...promptText.matchAll(/"output_spec":\s*(\{[^{}]*\}|\{)/g)]
    .map((match) => match[1]);
  check(
    "every output_spec example is populated",
    outputSpecExamples.length > 0 && outputSpecExamples.every((example) => example !== "{}"),
    `examples: ${outputSpecExamples.join(" | ") || "none found"}`,
  );
  const emptyExamples = [...skeleton.matchAll(/"(\w+)":\s*\{\}/g)].map((match) => match[1]);
  check(
    "the shot skeleton does not show an empty output_spec",
    !emptyExamples.includes("output_spec"),
    `empty object examples: ${emptyExamples.join(", ")}`,
  );
  check(
    "the output_spec example carries the duration the validator compares",
    /"output_spec":\s*\{[^}]*duration_seconds/.test(skeleton),
  );
  check(
    "the shot call is told output_spec must be populated",
    /output_spec must be a populated object, never empty/.test(runtime),
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
  await contractStandardMatchesScoring();
  await temporalContractIsSatisfiable();
  await directionSurvivesIntoProviderInstruction();
  shotCallBudgetScalesWithShots();
  await genericLanguagePatternsAreFairAndDisclosed();
  await panelCountViolationIsReplannedOnce();
  await oneFailedSceneDoesNotLoseTheFilm();
  await requestIsScopedToTheOperativeWorkflow();
  await temporalRepairFixesANestedShotField();
  await sceneShotPlanningRunsConcurrentlyInOrder();
  await everyPenalisedClicheIsDisclosedAndReplaceable();
  await advertisingFillerIsRejectedNotOnlyScored();
  await ineligibleRolesAreDerivedNotDemanded();
  formIsChosenNotDerived();
  await contractRequiresStructuralInvention();
  await contractRequiresSurfaceInvention();
  await promptSkeletonMatchesValidatorRequirements();
  await promptExamplesAreValidAndCapabilityFree();

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
