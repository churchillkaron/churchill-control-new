#!/usr/bin/env node

import fs from "node:fs";

function read(path) {
  return fs.readFileSync(path, "utf8");
}

function write(path, content) {
  fs.writeFileSync(path, content);
}

function replaceOrAssert(content, pattern, replacement, marker, path) {
  if (content.includes(marker)) return content;
  if (!pattern.test(content)) {
    throw new Error(`CREATIVE_HARDENING_PATTERN_MISSING:${path}:${marker}`);
  }
  return content.replace(pattern, replacement);
}

function patchProductionGraphPlanner() {
  const path = "lib/creative/production-graph/planner/ProductionGraphPlanner.js";
  let source = read(path);
  const marker = "CREATIVE_DECLARED_EVIDENCE_ASSET_HANDOFF_V1";

  source = replaceOrAssert(
    source,
    /function buildShotSpecification\(scene, shot\) \{[\s\S]*?\n\}\n\nfunction addFilmNodes/,
    `// CREATIVE_DECLARED_EVIDENCE_ASSET_HANDOFF_V1\nfunction assetReferenceIdentity(value) {\n  if (!value) return null;\n  if (typeof value === "string" || typeof value === "number") {\n    return String(value);\n  }\n  return String(\n    value.id ||\n    value.asset_id ||\n    value.creative_asset_id ||\n    value.source_asset_id ||\n    value.reference_asset_id ||\n    value.metadata?.source_asset_id ||\n    value.metadata?.creative_asset_id ||\n    "",\n  ) || null;\n}\n\nfunction collectDeclaredAssetReferences(value, key = "", output = []) {\n  if (!value) return output;\n\n  const assetKey = /(asset|reference|evidence)/i.test(String(key));\n\n  if (Array.isArray(value)) {\n    for (const entry of value) {\n      const identity = assetReferenceIdentity(entry);\n      if (assetKey && identity) output.push(entry);\n      collectDeclaredAssetReferences(entry, key, output);\n    }\n    return output;\n  }\n\n  if (typeof value === "object") {\n    const identity = assetReferenceIdentity(value);\n    if (assetKey && identity) output.push(value);\n    for (const [childKey, childValue] of Object.entries(value)) {\n      collectDeclaredAssetReferences(childValue, childKey, output);\n    }\n    return output;\n  }\n\n  if (assetKey) output.push(value);\n  return output;\n}\n\nfunction uniqueAssetReferences(values = []) {\n  const seen = new Set();\n  const output = [];\n\n  for (const value of values.flat(Infinity).filter(Boolean)) {\n    const identity = assetReferenceIdentity(value);\n    if (!identity || seen.has(identity)) continue;\n    seen.add(identity);\n    output.push(value);\n  }\n\n  return output;\n}\n\nfunction declaredReferenceAssets(scene = {}, shot = {}) {\n  const output = [];\n  const sources = [\n    shot.assets,\n    scene.assets,\n    shot.reference_asset_ids,\n    scene.reference_asset_ids,\n    shot.reference_pack,\n    scene.reference_pack,\n    shot.evidence_requirements,\n    scene.evidence_requirements,\n    shot.casting,\n    scene.casting,\n    shot.actors,\n    scene.actors,\n    shot.products,\n    scene.products,\n    shot.location,\n    scene.location,\n    shot.brand_rules,\n    scene.brand_rules,\n  ];\n\n  for (const source of sources) {\n    collectDeclaredAssetReferences(source, "reference_assets", output);\n  }\n\n  return uniqueAssetReferences(output);\n}\n\nfunction buildShotSpecification(scene, shot) {\n  const referenceAssets = declaredReferenceAssets(scene, shot);\n\n  return {\n    scene: {\n      ...scene,\n      id: scene.id,\n      number: scene.scene_number,\n      title: scene.title || "",\n      objective: scene.objective || "",\n      emotion: scene.emotion || "",\n      location: scene.location || {},\n      actors: scene.actors || [],\n      casting: scene.casting || null,\n      products: scene.products || [],\n      brand_rules: scene.brand_rules || [],\n      assets: scene.assets || [],\n      reference_pack: scene.reference_pack || scene.metadata?.reference_pack || {},\n      evidence_requirements:\n        scene.evidence_requirements || scene.metadata?.evidence_requirements || {},\n      required_evidence_roles:\n        scene.required_evidence_roles || scene.metadata?.required_evidence_roles || [],\n      visual_style: scene.visual_style || {},\n      camera_style: scene.camera_style || {},\n      audio_style: scene.audio_style || {},\n    },\n    shot: {\n      ...shot,\n      id: shot.id,\n      number: shot.shot_number,\n      title: shot.title || "",\n      purpose: shot.purpose || "",\n      duration_seconds: Number(shot.duration_seconds || 5),\n      opening_frame: shot.opening_frame || "",\n      closing_frame: shot.closing_frame || "",\n      action_beats: shot.action_beats || [],\n      performance_direction: shot.performance_direction || "",\n      camera: shot.camera || {},\n      lighting: shot.lighting || {},\n      actors: shot.actors || [],\n      casting: shot.casting || null,\n      products: shot.products || [],\n      location: shot.location || scene.location || {},\n      dialogue: shot.dialogue || [],\n      narration: shot.narration || {},\n      music: shot.music || {},\n      sound_effects: shot.sound_effects || [],\n      subtitles: shot.subtitles || [],\n      assets: referenceAssets,\n      reference_asset_ids: uniqueAssetReferences(referenceAssets)\n        .map(assetReferenceIdentity)\n        .filter(Boolean),\n      reference_pack: shot.reference_pack || shot.metadata?.reference_pack || {},\n      evidence_requirements:\n        shot.evidence_requirements || shot.metadata?.evidence_requirements || {},\n      required_evidence_roles:\n        shot.required_evidence_roles || shot.metadata?.required_evidence_roles || [],\n      continuity: shot.continuity || shot.metadata?.continuity || {},\n      reality_rules: shot.reality_rules || shot.metadata?.reality_rules || {},\n      composition_plan:\n        shot.composition_plan || shot.metadata?.composition_plan || {},\n      negative_constraints:\n        shot.negative_constraints || shot.metadata?.negative_constraints || [],\n      quality_requirements:\n        shot.quality_requirements || shot.metadata?.quality_requirements || {},\n    },\n  };\n}\n\nfunction addFilmNodes`,
    marker,
    path,
  );

  if (!source.includes("const referenceAssets = declaredReferenceAssets(scene, shot);")) {
    source = source.replace(
      "      const specification = buildShotSpecification(scene, shot);\n      const masterNodeId",
      "      const specification = buildShotSpecification(scene, shot);\n      const referenceAssets = declaredReferenceAssets(scene, shot);\n      const masterNodeId",
    );
  }

  source = source.replace(
    "          assets: shot.assets || [],\n          generation: {",
    "          assets: referenceAssets,\n          generation: {",
  );
  source = source.replace(
    "              reference_assets: shot.assets || [],",
    "              reference_assets: referenceAssets,\n              authorized_reference_asset_ids: referenceAssets\n                .map(assetReferenceIdentity)\n                .filter(Boolean),",
  );

  write(path, source);
}

function patchPromptBudget() {
  const path = "lib/creative/production/contracts/CreativeImagePromptBudgetRuntime.js";
  let source = read(path);
  const marker = "CREATIVE_IMAGE_SPECIFICATION_COMPACTION_V2";

  source = replaceOrAssert(
    source,
    /function compactScene\(scene = \{\}\) \{[\s\S]*?\n\}\n\nfunction compactShot\(shot = \{\}\) \{[\s\S]*?\n\}\n\nfunction compactEvidenceManifest/,
    `// CREATIVE_IMAGE_SPECIFICATION_COMPACTION_V2\nfunction compactScene(scene = {}) {\n  return {\n    id: scene.id || scene.scene_id || null,\n    scene_number: scene.scene_number || scene.number || null,\n    title: clip(scene.title || scene.name, 240) || null,\n    objective: clip(scene.objective || scene.purpose, 600) || null,\n    emotion: clip(\n      scene.emotion || scene.emotional_function || scene.emotional_goal,\n      360,\n    ) || null,\n    location: compactStructured(scene.location, 700),\n    actors: list(scene.actors).slice(0, 8).map(compactActor),\n    casting: compactStructured(scene.casting, 900),\n    products: compactStructured(list(scene.products).slice(0, 8), 900),\n    brand_rules: compactStructured(scene.brand_rules, 700),\n    assets: clipList(scene.assets, 12, 160),\n    continuity: compactStructured(scene.continuity, 700),\n    reference_pack: compactReferencePack(scene.reference_pack || {}),\n    evidence_requirements: compactStructured(\n      scene.evidence_requirements,\n      900,\n    ),\n    required_evidence_roles: clipList(\n      scene.required_evidence_roles,\n      10,\n      80,\n    ),\n  };\n}\n\nfunction compactShot(shot = {}) {\n  return {\n    id: shot.id || shot.shot_id || null,\n    shot_number: shot.shot_number || shot.number || null,\n    title: clip(shot.title || shot.name, 260) || null,\n    purpose: clip(shot.purpose || shot.objective, 700) || null,\n    duration_seconds: Number(shot.duration_seconds || 0) || null,\n    opening_frame: clip(\n      shot.opening_frame || shot.opening_state || shot.frame_zero_description,\n      700,\n    ) || null,\n    closing_frame: clip(\n      shot.closing_frame || shot.closing_state || shot.end_frame,\n      700,\n    ) || null,\n    decisive_moment: clip(shot.decisive_moment, 700) || null,\n    action_beats: clipList(shot.action_beats, 12, 360),\n    performance_direction: clip(shot.performance_direction, 1400) || null,\n    camera: compactStructured(\n      shot.camera || shot.cinematography || shot.camera_contract,\n      1300,\n    ),\n    lighting: compactStructured(\n      shot.lighting || shot.lighting_contract,\n      1100,\n    ),\n    actors: list(shot.actors).slice(0, 8).map(compactActor),\n    casting: compactStructured(shot.casting, 900),\n    products: list(shot.products).slice(0, 8).map((product) => ({\n      name: clip(product?.name || product?.title || product?.description, 240),\n      reference_asset_ids: clipList(\n        product?.reference_asset_ids ||\n        product?.asset_ids ||\n        product?.reference_asset_id ||\n        product?.asset_id,\n        4,\n        120,\n      ),\n      exact: product?.exact === true || product?.reference_required === true,\n    })),\n    location: compactStructured(shot.location, 700),\n    continuity: compactStructured(shot.continuity, 900),\n    reality_rules: {\n      human: clipList(shot.reality_rules?.human, 8, 260),\n      physical: clipList(shot.reality_rules?.physical, 8, 260),\n      environment: clipList(shot.reality_rules?.environment, 8, 260),\n    },\n    composition_plan: compactStructured(shot.composition_plan, 900),\n    assets: clipList(shot.assets, 16, 160),\n    reference_asset_ids: clipList(shot.reference_asset_ids, 16, 120),\n    reference_pack: compactReferencePack(shot.reference_pack || {}),\n    evidence_requirements: compactStructured(\n      shot.evidence_requirements,\n      1100,\n    ),\n    required_evidence_roles: clipList(\n      shot.required_evidence_roles,\n      10,\n      80,\n    ),\n    identity_exact: shot.identity_exact === true,\n    wardrobe_exact: shot.wardrobe_exact === true,\n    product_exact: shot.product_exact === true,\n    location_exact: shot.location_exact === true,\n    brand_exact: shot.brand_exact === true,\n    quality_requirements: compactStructured(\n      shot.quality_requirements,\n      2200,\n    ),\n    negative_constraints: clipList(\n      shot.negative_constraints || shot.failure_prevention,\n      14,\n      300,\n    ),\n    failure_prevention: clipList(\n      shot.failure_prevention || shot.negative_constraints,\n      14,\n      300,\n    ),\n  };\n}\n\nfunction compactEvidenceManifest`,
    marker,
    path,
  );

  write(path, source);
}

function patchProductionTaskRuntime() {
  const path = "lib/operations/tasks/runtime/ProductionTaskRuntime.js";
  let source = read(path);
  const marker = "CREATIVE_RUNTIME_EVIDENCE_REFERENCE_RECOVERY_V1";

  source = replaceOrAssert(
    source,
    /async function resolveAssetReference\(reference\) \{[\s\S]*?\n\}\n\nasync function resolveTaskAssets\(task\) \{[\s\S]*?\n\}\n\nasync function createMediaAsset/,
    `// CREATIVE_RUNTIME_EVIDENCE_REFERENCE_RECOVERY_V1\nfunction list(value) {\n  if (!value) return [];\n  return Array.isArray(value) ? value.filter(Boolean) : [value];\n}\n\nfunction assetReferenceIdentity(value) {\n  if (!value) return null;\n  if (typeof value === "string" || typeof value === "number") {\n    return String(value);\n  }\n  return String(\n    value.id ||\n    value.asset_id ||\n    value.creative_asset_id ||\n    value.source_asset_id ||\n    value.reference_asset_id ||\n    value.metadata?.source_asset_id ||\n    value.metadata?.creative_asset_id ||\n    "",\n  ) || null;\n}\n\nfunction assetAliases(asset = {}) {\n  return [...new Set([\n    asset.id,\n    asset.asset_id,\n    asset.creative_asset_id,\n    asset.source_asset_id,\n    asset.reference_asset_id,\n    asset.metadata?.source_asset_id,\n    asset.metadata?.creative_asset_id,\n  ].filter(Boolean).map(String))];\n}\n\nfunction collectDeclaredAssetReferences(value, key = "", output = []) {\n  if (!value) return output;\n  const assetKey = /(asset|reference|evidence)/i.test(String(key));\n\n  if (Array.isArray(value)) {\n    for (const entry of value) {\n      const identity = assetReferenceIdentity(entry);\n      if (assetKey && identity) output.push(entry);\n      collectDeclaredAssetReferences(entry, key, output);\n    }\n    return output;\n  }\n\n  if (typeof value === "object") {\n    const identity = assetReferenceIdentity(value);\n    if (assetKey && identity) output.push(value);\n    for (const [childKey, childValue] of Object.entries(value)) {\n      collectDeclaredAssetReferences(childValue, childKey, output);\n    }\n    return output;\n  }\n\n  if (assetKey) output.push(value);\n  return output;\n}\n\nfunction uniqueAssetReferences(values = []) {\n  const seen = new Set();\n  const output = [];\n\n  for (const value of values.flat(Infinity).filter(Boolean)) {\n    const identity = assetReferenceIdentity(value);\n    if (!identity || seen.has(identity)) continue;\n    seen.add(identity);\n    output.push(value);\n  }\n\n  return output;\n}\n\nasync function resolveAssetReference(reference) {\n  if (!reference) return null;\n\n  const directUrl = firstValue(\n    reference?.image_url,\n    reference?.file_url,\n    reference?.url,\n    reference?.thumbnail_url,\n  );\n  if (typeof reference === "object" && directUrl) return reference;\n\n  const identity = assetReferenceIdentity(reference);\n  if (!identity) return typeof reference === "object" ? reference : null;\n\n  try {\n    const resolved = await CreativeAssetsRuntime.get(identity);\n    return resolved\n      ? {\n          ...resolved,\n          ...(typeof reference === "object" ? reference : {}),\n        }\n      : null;\n  } catch {\n    return typeof reference === "object" ? reference : null;\n  }\n}\n\nasync function resolveTaskAssets(task) {\n  const declared = [];\n  collectDeclaredAssetReferences(\n    task.input?.specification,\n    "specification_reference_assets",\n    declared,\n  );\n  collectDeclaredAssetReferences(\n    task.input?.generation_contract,\n    "generation_contract_reference_assets",\n    declared,\n  );\n\n  const references = uniqueAssetReferences([\n    ...list(task.input?.reference_assets),\n    ...list(task.input?.assets),\n    ...list(task.input?.authorized_reference_asset_ids),\n    ...list(task.input?.metadata?.authorized_reference_asset_ids),\n    ...declared,\n  ]);\n\n  const direct = (\n    await Promise.all(references.map(resolveAssetReference))\n  ).filter(Boolean);\n\n  const dependencies = [];\n\n  for (const dependencyId of task.depends_on || []) {\n    const dependency = await Repository.getById(dependencyId, {\n      organization_id: task.organization_id,\n      creative_project_id: task.creative_project_id,\n    });\n    if (!dependency) continue;\n\n    const url = firstValue(\n      dependency.output?.url,\n      dependency.output?.image_url,\n      dependency.output?.video_url,\n      dependency.output?.asset?.url,\n      dependency.output?.asset?.image_url,\n      dependency.output?.asset?.file_url,\n    );\n\n    if (url) {\n      dependencies.push({\n        id: dependency.output?.asset_id || dependency.id,\n        url,\n        image_url: url,\n        file_url: url,\n        source_task_id: dependency.id,\n        source_node_id: dependency.metadata?.node_id || null,\n      });\n    }\n  }\n\n  return uniqueAssetReferences([...dependencies, ...direct]);\n}\n\nasync function createMediaAsset`,
    marker,
    path,
  );

  if (!source.includes("const authorizedReferenceAssetIds =")) {
    source = source.replace(
      "    const assets = await resolveTaskAssets(task);\n    const sourceAsset = assets[0] || null;",
      `    const assets = await resolveTaskAssets(task);\n    const authorizedReferenceAssetIds = [...new Set([\n      ...list(task.input?.authorized_reference_asset_ids),\n      ...list(task.input?.metadata?.authorized_reference_asset_ids),\n      ...assets.flatMap(assetAliases),\n    ].filter(Boolean).map(String))];\n    const sourceAsset = assets[0] || null;`,
    );

    source = source.replace(
      "          ...(task.input || {}),\n          specification,",
      `          ...(task.input || {}),\n          specification,\n          authorized_reference_asset_ids: authorizedReferenceAssetIds,\n          metadata: {\n            ...(task.input?.metadata || {}),\n            authorized_reference_asset_ids: authorizedReferenceAssetIds,\n          },`,
    );
  }

  write(path, source);
}

function patchOpenAIProvider() {
  const path = "lib/platform/service-runtime/providers/openai/OpenAIProvider.js";
  let source = read(path);
  const marker = "CREATIVE_OPENAI_FINAL_PROMPT_BUDGET_V1";

  if (!source.includes(marker)) {
    source = source.replace(
      "const DEFAULT_STRUCTURED_OUTPUT_TOKENS = 12000;",
      `const DEFAULT_STRUCTURED_OUTPUT_TOKENS = 12000;\nconst OPENAI_IMAGE_PROMPT_HARD_LIMIT = 32000;\nconst OPENAI_IMAGE_PROMPT_SAFE_LIMIT = 30000;`,
    );

    source = source.replace(
      "function buildMasterStillPrompt({",
      `// CREATIVE_OPENAI_FINAL_PROMPT_BUDGET_V1\nfunction enforceOpenAIImagePromptBudget(value) {\n  const prompt = String(value || "").trim();\n  if (prompt.length <= OPENAI_IMAGE_PROMPT_SAFE_LIMIT) return prompt;\n\n  const suffix = [\n    "[Provider payload compacted at the final OpenAI boundary.]",\n    "The structured scene, shot, evidence, casting, reference and quality contracts remain authoritative.",\n    "Preserve approved evidence, physical blocking, identity boundaries, location geometry, product truth, wardrobe continuity, brand safety, anatomy, realism and all mandatory corrections.",\n  ].join(" ");\n  const maximumPrefix = Math.max(0, OPENAI_IMAGE_PROMPT_SAFE_LIMIT - suffix.length - 2);\n  const compacted = \\`${"${prompt.slice(0, maximumPrefix).trim()}"}\\n\\n${"${suffix}"}\\`;\n\n  if (compacted.length > OPENAI_IMAGE_PROMPT_HARD_LIMIT) {\n    throw new Error("CREATIVE_OPENAI_IMAGE_PROMPT_BUDGET_EXCEEDED");\n  }\n\n  return compacted;\n}\n\nfunction buildMasterStillPrompt({`,
    );

    const oldBlock = `  const finalPrompt = buildMasterStillPrompt({\n    prompt,\n    assets,\n    specification,\n    mode,\n  });`;
    const newBlock = `  const finalPrompt = enforceOpenAIImagePromptBudget(\n    buildMasterStillPrompt({\n      prompt,\n      assets,\n      specification,\n      mode,\n    }),\n  );`;

    if (!source.includes(oldBlock)) {
      throw new Error("CREATIVE_HARDENING_PATTERN_MISSING:OpenAIProvider:finalPrompt");
    }
    source = source.replace(oldBlock, newBlock);
  }

  write(path, source);
}

patchProductionGraphPlanner();
patchPromptBudget();
patchProductionTaskRuntime();
patchOpenAIProvider();

console.log("CREATIVE_LIVE_SMOKE_HARDENING=APPLIED");
