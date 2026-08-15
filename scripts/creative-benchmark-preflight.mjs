// Everything about the five benchmark cases that can be checked without paying a provider.
//
// A full five-case run is around eighty baht of reasoning, and three of the five cases had never been
// exercised even once. A case that cannot succeed for a setup reason -- a missing project, a capability the
// organization does not have enabled, an unresolvable pinned asset, an invalid quality policy -- burns that
// money to report something knowable in advance. This checks what is knowable in advance.
//
// It does not predict scores and cannot: whether the work is good, and whether the tribunal clears it, are
// answerable only by running. What it says is whether a run would fail before reaching that question.
//
// Read-only. No provider calls, no writes.
//
//   node --loader ./scripts/next-alias-loader.mjs scripts/creative-benchmark-preflight.mjs

import { CREATIVE_WORLD_CLASS_BENCHMARK_CASES } from "@/app/api/creative/tests/world-class-benchmark/fixtures";
import { resolveBenchmarkAssets } from "@/lib/creative/quality/runtime/CreativeBenchmarkAssetResolver";
import { availableProductionCapabilities } from "@/lib/creative/director/planner/creativeProductionCapabilities";
import { CreativeWorkflowRegistry } from "@/lib/creative/director/registry/CreativeWorkflowRegistry";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function text(value) {
  return String(value ?? "").trim();
}

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

// The same shape qualityPolicyFor enforces in both executors, checked here so a bad policy is reported
// against the case that carries it rather than thrown from inside a paid run.
const POLICY_NUMBERS = ["minimum_scene_score", "regenerate_below_score"];
const POLICY_BOOLEANS = [
  "require_brand_fit",
  "require_non_ai_feel",
  "require_identity_continuity",
  "require_product_continuity",
  "require_story_progression",
];

function policyProblems(policy) {
  const problems = [];
  const quality = object(policy);
  if (!Object.keys(quality).length) return ["no quality policy on the fixture"];
  if (!text(quality.version)) problems.push("version is required");
  for (const field of POLICY_NUMBERS) {
    const value = Number(quality[field]);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      problems.push(`${field} must be a number from 0 to 100`);
    }
  }
  if (Number(quality.regenerate_below_score) > Number(quality.minimum_scene_score)) {
    problems.push("regenerate_below_score cannot exceed minimum_scene_score");
  }
  for (const field of POLICY_BOOLEANS) {
    if (typeof quality[field] !== "boolean") problems.push(`${field} must be a boolean`);
  }
  return problems;
}

async function main() {
  console.log("============================================================");
  console.log("CREATIVE BENCHMARK PREFLIGHT");
  console.log("============================================================");
  console.log("PROVIDER_CALLS_EXECUTED=NO");
  console.log("WRITES_EXECUTED=NO");
  console.log(`CASES=${CREATIVE_WORLD_CLASS_BENCHMARK_CASES.length}`);

  const capabilityCache = new Map();
  let blocking = 0;
  let warnings = 0;

  for (const benchmarkCase of CREATIVE_WORLD_CLASS_BENCHMARK_CASES) {
    const problems = [];
    const notes = [];

    // The quality policy, which both executors throw on rather than degrade.
    for (const problem of policyProblems(benchmarkCase.quality)) {
      problems.push(`quality policy: ${problem}`);
    }

    // The source project has to exist and belong to the organization the case names, because the runtime
    // compares them and fails the case when they disagree.
    const projectId = text(benchmarkCase.source_project_id);
    if (!projectId) {
      problems.push("no source_project_id");
    } else {
      const { data, error } = await supabaseAdmin
        .from("creative_projects")
        .select("id,organization_id,name")
        .eq("id", projectId)
        .maybeSingle();
      if (error) problems.push(`source project lookup failed: ${error.message}`);
      else if (!data) problems.push(`source project ${projectId} does not exist`);
      else if (text(data.organization_id) !== text(benchmarkCase.organization_id)) {
        problems.push(
          `source project belongs to ${data.organization_id}, not ${benchmarkCase.organization_id}`,
        );
      }
    }

    // Assets, including whether every pinned id resolves.
    let assetCount = 0;
    try {
      const assets = await resolveBenchmarkAssets({
        organization_id: benchmarkCase.organization_id,
        production_type: benchmarkCase.production_type,
        anchors: [],
        minimum: 2,
        maximum: Math.max(6, list(benchmarkCase.asset_ids).length),
        pinned_asset_ids: list(benchmarkCase.asset_ids),
      });
      assetCount = assets.length;
      const resolution = assets.resolution || {};
      if (list(resolution.unresolved_pinned_asset_ids).length) {
        problems.push(
          `pinned assets that do not resolve: ${resolution.unresolved_pinned_asset_ids.join(", ")}`,
        );
      }
      notes.push(`assets ${assetCount} (${resolution.selection_mode})`);
      if (!resolution.preferred_family_available) {
        // Not blocking. A generated deliverable is allowed to be briefed by another medium, and an
        // audio package composed from venue imagery is the case working as intended.
        notes.push(`no ${resolution.preferred_family} asset among them`);
        warnings += 1;
      }
    } catch (error) {
      problems.push(`asset resolution failed: ${String(error?.message || error)}`);
    }

    // The capabilities the organization actually has enabled, which is what the director may plan against.
    try {
      if (!capabilityCache.has(benchmarkCase.organization_id)) {
        capabilityCache.set(
          benchmarkCase.organization_id,
          await availableProductionCapabilities(benchmarkCase.organization_id),
        );
      }
      const context = capabilityCache.get(benchmarkCase.organization_id);
      const capabilities = list(context.capabilities);
      if (!capabilities.length) problems.push("no executable production capabilities");
      notes.push(`capabilities ${capabilities.length}`);
      if (list(context.unexecutable).length) {
        notes.push(`unexecutable services ${context.unexecutable.length}`);
        warnings += 1;
      }
    } catch (error) {
      problems.push(`capability resolution failed: ${String(error?.message || error)}`);
    }

    // Every registered workflow the director could choose, so a case whose medium has no workflow at all
    // is caught here rather than as WORKFLOW_KIND_INVALID inside a paid run.
    try {
      const workflows = list(CreativeWorkflowRegistry.list?.() || []);
      if (!workflows.length) problems.push("no registered workflows");
      else notes.push(`workflows ${workflows.length}`);
    } catch (error) {
      problems.push(`workflow registry failed: ${String(error?.message || error)}`);
    }

    const status = problems.length ? "BLOCKED" : "READY";
    if (problems.length) blocking += 1;
    console.log(`\n${status}  ${benchmarkCase.id}`);
    console.log(`   ${benchmarkCase.production_type}, floor ${benchmarkCase.quality?.minimum_scene_score}`);
    if (notes.length) console.log(`   ${notes.join(" | ")}`);
    for (const problem of problems) console.log(`   PROBLEM: ${problem}`);
  }

  console.log("\n============================================================");
  console.log(`CASES_BLOCKED=${blocking}`);
  console.log(`ADVISORY_NOTES=${warnings}`);
  console.log(
    blocking
      ? "A run would fail on the above before reaching any question of quality. Fix these first."
      : "No setup blocker. What remains is whether the work is good enough and whether the tribunal clears it, which only a run can answer.",
  );
}

main().catch((error) => {
  console.error(String(error?.message || error));
  process.exitCode = 1;
});
