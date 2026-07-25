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
    throw new Error(`CREATIVE_HARDENING_PATTERN_MISSING:${path}:${label}`);
  }
  return source.replace(search, replacement);
}

function replaceRegexRequired(source, pattern, replacement, marker, path) {
  if (source.includes(marker)) return source;
  if (!pattern.test(source)) {
    throw new Error(`CREATIVE_HARDENING_PATTERN_MISSING:${path}:${marker}`);
  }
  return source.replace(pattern, replacement);
}

function patchProductionGraphPlanner() {
  const path = "lib/creative/production-graph/planner/ProductionGraphPlanner.js";
  let source = read(path);
  const marker = "CREATIVE_DECLARED_EVIDENCE_ASSET_HANDOFF_V2";

  const helpers = `// ${marker}
function assetReferenceIdentity(value) {
  if (!value) return null;
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return String(
    value.id ||
    value.asset_id ||
    value.creative_asset_id ||
    value.source_asset_id ||
    value.reference_asset_id ||
    value.metadata?.source_asset_id ||
    value.metadata?.creative_asset_id ||
    "",
  ) || null;
}

function collectDeclaredAssetReferences(value, key = "", output = []) {
  if (!value) return output;
  const assetKey = /(asset|reference|evidence)/i.test(String(key));

  if (Array.isArray(value)) {
    for (const entry of value) {
      const identity = assetReferenceIdentity(entry);
      if (assetKey && identity) output.push(entry);
      collectDeclaredAssetReferences(entry, key, output);
    }
    return output;
  }

  if (typeof value === "object") {
    const identity = assetReferenceIdentity(value);
    if (assetKey && identity) output.push(value);
    for (const [childKey, childValue] of Object.entries(value)) {
      collectDeclaredAssetReferences(childValue, childKey, output);
    }
    return output;
  }

  if (assetKey) output.push(value);
  return output;
}

function uniqueAssetReferences(values = []) {
  const seen = new Set();
  const output = [];

  for (const value of values.flat(Infinity).filter(Boolean)) {
    const identity = assetReferenceIdentity(value);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    output.push(value);
  }

  return output;
}

function declaredReferenceAssets(scene = {}, shot = {}) {
  const output = [];
  const sources = [
    shot.assets,
    scene.assets,
    shot.reference_asset_ids,
    scene.reference_asset_ids,
    shot.reference_pack,
    scene.reference_pack,
    shot.evidence_requirements,
    scene.evidence_requirements,
    shot.casting,
    scene.casting,
    shot.actors,
    scene.actors,
    shot.products,
    scene.products,
    shot.location,
    scene.location,
    shot.brand_rules,
    scene.brand_rules,
  ];

  for (const value of sources) {
    collectDeclaredAssetReferences(value, "reference_assets", output);
  }

  return uniqueAssetReferences(output);
}

`;

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      "function buildShotSpecification(scene, shot) {",
      `${helpers}function buildShotSpecification(scene, shot) {`,
      path,
      "insert-evidence-helpers",
    );
  }

  source = replaceRequired(
    source,
    "    scene: {\n      id: scene.id,",
    "    scene: {\n      ...scene,\n      id: scene.id,",
    path,
    "preserve-scene-contract",
  );
  source = replaceRequired(
    source,
    "      actors: scene.actors || [],\n      products: scene.products || [],",
    "      actors: scene.actors || [],\n      casting: scene.casting || null,\n      products: scene.products || [],\n      assets: scene.assets || [],\n      reference_pack: scene.reference_pack || scene.metadata?.reference_pack || {},\n      evidence_requirements:\n        scene.evidence_requirements || scene.metadata?.evidence_requirements || {},\n      required_evidence_roles:\n        scene.required_evidence_roles || scene.metadata?.required_evidence_roles || [],",
    path,
    "preserve-scene-evidence",
  );
  source = replaceRequired(
    source,
    "    shot: {\n      id: shot.id,",
    "    shot: {\n      ...shot,\n      id: shot.id,",
    path,
    "preserve-shot-contract",
  );
  source = replaceRequired(
    source,
    "      actors: shot.actors || [],\n      products: shot.products || [],",
    "      actors: shot.actors || [],\n      casting: shot.casting || null,\n      products: shot.products || [],",
    path,
    "preserve-shot-casting",
  );
  source = replaceRequired(
    source,
    "      assets: shot.assets || [],\n      reference_pack: shot.reference_pack || shot.metadata?.reference_pack || {},",
    "      assets: declaredReferenceAssets(scene, shot),\n      reference_asset_ids: declaredReferenceAssets(scene, shot)\n        .map(assetReferenceIdentity)\n        .filter(Boolean),\n      reference_pack: shot.reference_pack || shot.metadata?.reference_pack || {},\n      evidence_requirements:\n        shot.evidence_requirements || shot.metadata?.evidence_requirements || {},\n      required_evidence_roles:\n        shot.required_evidence_roles || shot.metadata?.required_evidence_roles || [],\n      composition_plan:\n        shot.composition_plan || shot.metadata?.composition_plan || {},",
    path,
    "preserve-shot-evidence",
  );
  source = replaceRequired(
    source,
    "      const specification = buildShotSpecification(scene, shot);\n      const masterNodeId",
    "      const specification = buildShotSpecification(scene, shot);\n      const referenceAssets = declaredReferenceAssets(scene, shot);\n      const masterNodeId",
    path,
    "declare-reference-assets",
  );
  source = replaceRequired(
    source,
    "          assets: shot.assets || [],\n          generation: {",
    "          assets: referenceAssets,\n          generation: {",
    path,
    "master-node-assets",
  );
  source = replaceRequired(
    source,
    "              reference_assets: shot.assets || [],",
    "              reference_assets: referenceAssets,\n              authorized_reference_asset_ids: referenceAssets\n                .map(assetReferenceIdentity)\n                .filter(Boolean),",
    path,
    "generation-authorisation",
  );

  write(path, source);
}

function patchPromptBudgetRuntime() {
  const path = "lib/creative/production/contracts/CreativeImagePromptBudgetRuntime.js";
  let source = read(path);
  const marker = "CREATIVE_IMAGE_SPECIFICATION_COMPACTION_V2";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      "function compactShot(shot = {}) {\n  return {\n    ...shot,",
      `// ${marker}\nfunction compactShot(shot = {}) {\n  return {`,
      path,
      "remove-unbounded-shot-spread",
    );
  }

  source = replaceRequired(
    source,
    "    actors: list(shot.actors).slice(0, 8).map(compactActor),\n    products:",
    "    actors: list(shot.actors).slice(0, 8).map(compactActor),\n    casting: compactStructured(shot.casting, 900),\n    evidence_requirements: compactStructured(shot.evidence_requirements, 1100),\n    required_evidence_roles: clipList(shot.required_evidence_roles, 10, 80),\n    assets: clipList(shot.assets, 16, 160),\n    reference_asset_ids: clipList(shot.reference_asset_ids, 16, 120),\n    products:",
    path,
    "retain-bounded-evidence-fields",
  );

  write(path, source);
}

function patchProductionTaskRuntime() {
  const path = "lib/operations/tasks/runtime/ProductionTaskRuntime.js";
  let source = read(path);
  const marker = "CREATIVE_RUNTIME_EVIDENCE_REFERENCE_RECOVERY_V2";

  const replacement = `// ${marker}
function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function assetReferenceIdentity(value) {
  if (!value) return null;
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  return String(
    value.id ||
    value.asset_id ||
    value.creative_asset_id ||
    value.source_asset_id ||
    value.reference_asset_id ||
    value.metadata?.source_asset_id ||
    value.metadata?.creative_asset_id ||
    "",
  ) || null;
}

function assetAliases(asset = {}) {
  return [...new Set([
    asset.id,
    asset.asset_id,
    asset.creative_asset_id,
    asset.source_asset_id,
    asset.reference_asset_id,
    asset.metadata?.source_asset_id,
    asset.metadata?.creative_asset_id,
  ].filter(Boolean).map(String))];
}

function collectDeclaredAssetReferences(value, key = "", output = []) {
  if (!value) return output;
  const assetKey = /(asset|reference|evidence)/i.test(String(key));

  if (Array.isArray(value)) {
    for (const entry of value) {
      const identity = assetReferenceIdentity(entry);
      if (assetKey && identity) output.push(entry);
      collectDeclaredAssetReferences(entry, key, output);
    }
    return output;
  }

  if (typeof value === "object") {
    const identity = assetReferenceIdentity(value);
    if (assetKey && identity) output.push(value);
    for (const [childKey, childValue] of Object.entries(value)) {
      collectDeclaredAssetReferences(childValue, childKey, output);
    }
    return output;
  }

  if (assetKey) output.push(value);
  return output;
}

function uniqueAssetReferences(values = []) {
  const seen = new Set();
  const output = [];

  for (const value of values.flat(Infinity).filter(Boolean)) {
    const identity = assetReferenceIdentity(value);
    if (!identity || seen.has(identity)) continue;
    seen.add(identity);
    output.push(value);
  }

  return output;
}

async function resolveAssetReference(reference) {
  if (!reference) return null;

  const directUrl = firstValue(
    reference?.image_url,
    reference?.file_url,
    reference?.url,
    reference?.thumbnail_url,
  );
  if (typeof reference === "object" && directUrl) return reference;

  const identity = assetReferenceIdentity(reference);
  if (!identity) return typeof reference === "object" ? reference : null;

  try {
    const resolved = await CreativeAssetsRuntime.get(identity);
    return resolved
      ? {
          ...resolved,
          ...(typeof reference === "object" ? reference : {}),
        }
      : null;
  } catch {
    return typeof reference === "object" ? reference : null;
  }
}

async function resolveTaskAssets(task) {
  const declared = [];
  collectDeclaredAssetReferences(
    task.input?.specification,
    "specification_reference_assets",
    declared,
  );
  collectDeclaredAssetReferences(
    task.input?.generation_contract,
    "generation_contract_reference_assets",
    declared,
  );

  const references = uniqueAssetReferences([
    ...list(task.input?.reference_assets),
    ...list(task.input?.assets),
    ...list(task.input?.authorized_reference_asset_ids),
    ...list(task.input?.metadata?.authorized_reference_asset_ids),
    ...declared,
  ]);

  const direct = (
    await Promise.all(references.map(resolveAssetReference))
  ).filter(Boolean);

  const dependencies = [];

  for (const dependencyId of task.depends_on || []) {
    const dependency = await Repository.getById(dependencyId, {
      organization_id: task.organization_id,
      creative_project_id: task.creative_project_id,
    });
    if (!dependency) continue;

    const url = firstValue(
      dependency.output?.url,
      dependency.output?.image_url,
      dependency.output?.video_url,
      dependency.output?.asset?.url,
      dependency.output?.asset?.image_url,
      dependency.output?.asset?.file_url,
    );

    if (url) {
      dependencies.push({
        id: dependency.output?.asset_id || dependency.id,
        url,
        image_url: url,
        file_url: url,
        source_task_id: dependency.id,
        source_node_id: dependency.metadata?.node_id || null,
      });
    }
  }

  return uniqueAssetReferences([...dependencies, ...direct]);
}

async function createMediaAsset`;

  source = replaceRegexRequired(
    source,
    /async function resolveAssetReference\(reference\) \{[\s\S]*?\n\}\n\nasync function resolveTaskAssets\(task\) \{[\s\S]*?\n\}\n\nasync function createMediaAsset/,
    replacement,
    marker,
    path,
  );

  source = replaceRequired(
    source,
    "    const assets = await resolveTaskAssets(task);\n    const sourceAsset = assets[0] || null;",
    "    const assets = await resolveTaskAssets(task);\n    const authorizedReferenceAssetIds = [...new Set([\n      ...list(task.input?.authorized_reference_asset_ids),\n      ...list(task.input?.metadata?.authorized_reference_asset_ids),\n      ...assets.flatMap(assetAliases),\n    ].filter(Boolean).map(String))];\n    const sourceAsset = assets[0] || null;",
    path,
    "runtime-authorised-aliases",
  );
  source = replaceRequired(
    source,
    "          ...(task.input || {}),\n          specification,",
    "          ...(task.input || {}),\n          specification,\n          authorized_reference_asset_ids: authorizedReferenceAssetIds,\n          metadata: {\n            ...(task.input?.metadata || {}),\n            authorized_reference_asset_ids: authorizedReferenceAssetIds,\n          },",
    path,
    "provider-authorised-aliases",
  );

  write(path, source);
}

function patchOpenAIProvider() {
  const path = "lib/platform/service-runtime/providers/openai/OpenAIProvider.js";
  let source = read(path);
  const marker = "CREATIVE_OPENAI_FINAL_PROMPT_BUDGET_V2";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      "const DEFAULT_STRUCTURED_OUTPUT_TOKENS = 12000;",
      "const DEFAULT_STRUCTURED_OUTPUT_TOKENS = 12000;\nconst OPENAI_IMAGE_PROMPT_HARD_LIMIT = 32000;\nconst OPENAI_IMAGE_PROMPT_SAFE_LIMIT = 30000;",
      path,
      "prompt-budget-constants",
    );

    const budgetFunction = `// ${marker}
function enforceOpenAIImagePromptBudget(value) {
  const prompt = String(value || "").trim();
  if (prompt.length <= OPENAI_IMAGE_PROMPT_SAFE_LIMIT) return prompt;

  const suffix = [
    "[Provider payload compacted at the final OpenAI boundary.]",
    "The structured scene, shot, evidence, casting, reference and quality contracts remain authoritative.",
    "Preserve approved evidence, physical blocking, identity boundaries, location geometry, product truth, wardrobe continuity, brand safety, anatomy, realism and all mandatory corrections.",
  ].join(" ");
  const maximumPrefix = Math.max(
    0,
    OPENAI_IMAGE_PROMPT_SAFE_LIMIT - suffix.length - 2,
  );
  const compacted = prompt.slice(0, maximumPrefix).trim() + "\\n\\n" + suffix;

  if (compacted.length > OPENAI_IMAGE_PROMPT_HARD_LIMIT) {
    throw new Error("CREATIVE_OPENAI_IMAGE_PROMPT_BUDGET_EXCEEDED");
  }

  return compacted;
}

`;

    source = replaceRequired(
      source,
      "function buildMasterStillPrompt({",
      `${budgetFunction}function buildMasterStillPrompt({`,
      path,
      "insert-final-prompt-budget",
    );
  }

  source = replaceRequired(
    source,
    "  const finalPrompt = buildMasterStillPrompt({\n    prompt,\n    assets,\n    specification,\n    mode,\n  });",
    "  const finalPrompt = enforceOpenAIImagePromptBudget(\n    buildMasterStillPrompt({\n      prompt,\n      assets,\n      specification,\n      mode,\n    }),\n  );",
    path,
    "apply-final-prompt-budget",
  );

  write(path, source);
}

patchProductionGraphPlanner();
patchPromptBudgetRuntime();
patchProductionTaskRuntime();
patchOpenAIProvider();

console.log("CREATIVE_LIVE_SMOKE_HARDENING_V2=APPLIED");
