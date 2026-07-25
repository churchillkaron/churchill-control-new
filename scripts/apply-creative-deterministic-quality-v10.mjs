#!/usr/bin/env node

import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceRequired(source, search, replacement, path, label) {
  if (source.includes(replacement)) return source;
  if (!source.includes(search)) {
    throw new Error(`CREATIVE_QUALITY_V10_PATTERN_MISSING:${path}:${label}`);
  }
  return source.replace(search, replacement);
}

function patchProductionTaskRuntime() {
  const path = "lib/operations/tasks/runtime/ProductionTaskRuntime.js";
  let source = read(path);
  const marker = "CREATIVE_DETERMINISTIC_IMAGE_QUALITY_V10";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      `import {\n  CreativeAssetsRuntime,\n} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";`,
      `import {\n  CreativeAssetsRuntime,\n} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";\n\nimport {\n  CreativeDeterministicImageQualityRuntime,\n} from "@/lib/creative/production/quality/CreativeDeterministicImageQualityRuntime";`,
      path,
      "quality-runtime-import",
    );

    source = replaceRequired(
      source,
      `function assetReferenceIdentity(value) {`,
      `// ${marker}\nfunction assetRoleNames(asset = {}) {\n  return [...new Set([\n    ...list(asset.evidence_roles),\n    ...list(asset.evidence_role),\n    ...list(asset.reference_roles),\n    ...list(asset.reference_role),\n    ...list(asset.roles),\n    ...list(asset.role),\n    ...list(asset.metadata?.evidence_roles),\n    ...list(asset.metadata?.evidence_role),\n    ...list(asset.metadata?.reference_roles),\n    ...list(asset.metadata?.reference_role),\n  ].filter(Boolean).map((role) => String(role).toUpperCase()))];\n}\n\nfunction isMasterStillTask(task = {}) {\n  return Boolean(\n    String(task.type || "").toUpperCase() === "GENERATE_IMAGE" &&\n    (\n      String(task.metadata?.deliverable || "").toUpperCase() === "MASTER_STILL" ||\n      String(task.input?.mode || "").toLowerCase() === "reference_grounded_master_still" ||\n      String(task.metadata?.node_id || "").includes(":master") ||\n      String(task.input?.node_id || "").includes(":master")\n    )\n  );\n}\n\nfunction exactBrandRequired(task = {}, brandAssets = []) {\n  const requirement = task.input?.specification?.shot?.quality_requirements || {};\n  return Boolean(\n    isMasterStillTask(task) &&\n    brandAssets.length > 0 &&\n    requirement.exact_brand_and_text_required === true\n  );\n}\n\nfunction assetReferenceIdentity(value) {`,
      path,
      "quality-helpers",
    );

    source = replaceRequired(
      source,
      `async function priorCompletedMasterStillUrls(task = {}) {\n  if (String(task.type || "").toUpperCase() !== "QUALITY_REVIEW") {\n    return [];\n  }`,
      `async function priorCompletedMasterStillUrls(task = {}) {\n  const taskType = String(task.type || "").toUpperCase();\n  if (!["QUALITY_REVIEW", "GENERATE_IMAGE"].includes(taskType)) {\n    return [];\n  }`,
      path,
      "master-still-comparison-task-types",
    );

    source = replaceRequired(
      source,
      `        String(candidate.type || "").toUpperCase() === "GENERATE_IMAGE" &&\n        ["COMPLETED", "APPROVED"].includes(`,
      `        isMasterStillTask(candidate) &&\n        ["COMPLETED", "APPROVED"].includes(`,
      path,
      "master-still-only-filter",
    );

    source = replaceRequired(
      source,
      `        !dependencyIds.has(String(candidate.id)),`,
      `        String(candidate.id) !== String(task.id) &&\n        !dependencyIds.has(String(candidate.id)),`,
      path,
      "exclude-current-master-still",
    );

    source = replaceRequired(
      source,
      `async function createMediaAsset({ task, execution, type, url }) {`,
      `async function createMediaAsset({\n  task,\n  execution,\n  type,\n  url,\n  deterministic_quality = null,\n}) {`,
      path,
      "create-media-quality-signature",
    );

    source = replaceRequired(
      source,
      `        billing: normalized.billing,\n      },`,
      `        billing: normalized.billing,\n        deterministic_quality,\n      },`,
      path,
      "persist-deterministic-quality",
    );

    source = replaceRequired(
      source,
      `    const sourceAsset = assets[0] || null;\n    const corrections = [`,
      `    const sourceAsset = assets[0] || null;\n    const masterStillTask = isMasterStillTask(task);\n    const brandAssets = assets.filter((asset) =>\n      assetRoleNames(asset).includes("BRAND")\n    );\n    const requiresExactBrand = exactBrandRequired(task, brandAssets);\n\n    if (masterStillTask && requiresExactBrand) {\n      CreativeDeterministicImageQualityRuntime.assertExactBrandOverlayContract({\n        task,\n        brand_assets: brandAssets,\n        required: true,\n      });\n    }\n\n    const corrections = [`,
      path,
      "pre-spend-brand-contract",
    );

    source = replaceRequired(
      source,
      `      if (normalized.image_url) {\n        return createMediaAsset({\n          task,\n          execution: result,\n          type: "IMAGE",\n          url: normalized.image_url,\n        });\n      }`,
      `      if (normalized.image_url) {\n        let finalImageUrl = normalized.image_url;\n        let brandOverlay = null;\n        let duplicateGate = null;\n\n        if (masterStillTask) {\n          const overlay = await CreativeDeterministicImageQualityRuntime\n            .applyExactBrandOverlay({\n              task,\n              image_url: finalImageUrl,\n              brand_assets: brandAssets,\n              required: requiresExactBrand,\n            });\n          finalImageUrl = overlay.url;\n          brandOverlay = overlay.diagnostics;\n          duplicateGate = await CreativeDeterministicImageQualityRuntime\n            .assertUniqueMasterStill({\n              candidate_url: finalImageUrl,\n              comparison_urls: comparisonImages,\n            });\n        }\n\n        return createMediaAsset({\n          task,\n          execution: result,\n          type: "IMAGE",\n          url: finalImageUrl,\n          deterministic_quality: {\n            brand_overlay: brandOverlay,\n            duplicate_gate: duplicateGate,\n          },\n        });\n      }`,
      path,
      "post-generation-deterministic-quality",
    );
  }

  write(path, source);
}

function patchProductionGraphPlanner() {
  const path = "lib/creative/production-graph/planner/ProductionGraphPlanner.js";
  let source = read(path);
  const marker = "CREATIVE_BOUND_EVIDENCE_QUALITY_REQUIREMENTS_V10";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      `// CREATIVE_MASTER_STILL_FIDELITY_AND_DIVERSITY_GATE_V5\nfunction buildShotSpecification(scene, shot) {\n  return {`,
      `// CREATIVE_MASTER_STILL_FIDELITY_AND_DIVERSITY_GATE_V5\n// ${marker}\nfunction referenceRoles(asset = {}) {\n  return [...new Set([\n    ...list(asset.evidence_roles),\n    ...list(asset.evidence_role),\n    ...list(asset.reference_roles),\n    ...list(asset.reference_role),\n    ...list(asset.roles),\n    ...list(asset.role),\n    ...list(asset.metadata?.evidence_roles),\n    ...list(asset.metadata?.evidence_role),\n    ...list(asset.metadata?.reference_roles),\n    ...list(asset.metadata?.reference_role),\n  ].filter(Boolean).map((role) => String(role).toUpperCase()))];\n}\n\nfunction hasReferenceRole(assets = [], roles = []) {\n  const required = new Set(list(roles).map((role) => String(role).toUpperCase()));\n  return list(assets).some((asset) =>\n    referenceRoles(asset).some((role) => required.has(role))\n  );\n}\n\nfunction buildShotSpecification(scene, shot) {\n  const referenceAssets = declaredReferenceAssets(scene, shot);\n  const hasBrandOrTextEvidence = hasReferenceRole(\n    referenceAssets,\n    ["BRAND", "TEXT"],\n  );\n  const hasWardrobeEvidence = hasReferenceRole(\n    referenceAssets,\n    ["WARDROBE"],\n  );\n\n  return {`,
      path,
      "bound-evidence-helpers",
    );

    source = replaceRequired(
      source,
      `      assets: declaredReferenceAssets(scene, shot),\n      reference_asset_ids: declaredReferenceAssets(scene, shot)`,
      `      assets: referenceAssets,\n      reference_asset_ids: referenceAssets`,
      path,
      "reuse-declared-reference-assets",
    );

    source = replaceRequired(
      source,
      `      composition_plan:\n        shot.composition_plan || shot.metadata?.composition_plan || {},`,
      `      composition_plan:\n        shot.composition_plan || shot.metadata?.composition_plan || {},\n      brand_overlay:\n        shot.brand_overlay ||\n        shot.exact_brand_overlay ||\n        shot.metadata?.brand_overlay ||\n        shot.metadata?.exact_brand_overlay ||\n        null,`,
      path,
      "brand-overlay-contract-handoff",
    );

    source = replaceRequired(
      source,
      `        exact_brand_and_text_required: true,\n        exact_wardrobe_assignment_required: true,`,
      `        exact_brand_and_text_required: hasBrandOrTextEvidence,\n        exact_wardrobe_assignment_required: hasWardrobeEvidence,`,
      path,
      "conditional-quality-requirements",
    );
  }

  write(path, source);
}

patchProductionTaskRuntime();
patchProductionGraphPlanner();

console.log("CREATIVE_DETERMINISTIC_QUALITY_V10=APPLIED");
