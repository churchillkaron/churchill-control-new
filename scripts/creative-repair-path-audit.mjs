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

async function main() {
  console.log("============================================================");
  console.log("CREATIVE REPAIR PATH AUDIT");
  console.log("============================================================");
  console.log("PROVIDER_CALLS_EXECUTED=NO");
  console.log("DATABASE_READS_EXECUTED=NO");

  await wrappedPlanIsFound();
  await repairWithEmbeddedRoleDecisionsLands();
  skeletonEntryDoesNotEraseDeliverable();
  await runtimeModulesReferenceOnlyRealIdentifiers();

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
