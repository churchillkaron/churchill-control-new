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
    throw new Error(`CREATIVE_EVIDENCE_FIDELITY_PATTERN_MISSING:${path}:${label}`);
  }
  return source.replace(search, replacement);
}

function patchShotDirection() {
  const path = "lib/creative/production/contracts/CreativeShotDirectionEnrichmentRuntime.js";
  let source = read(path);
  const marker = "CREATIVE_CANONICAL_EVIDENCE_ACTOR_MERGE_V5";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      "function convergeDirection({",
      `// ${marker}\nfunction actorBindingKey(actor = {}, index = 0) {\n  return text(\n    actor.binding_key ||\n    actor.evidence_binding_key ||\n    actor.actor_id ||\n    actor.id ||\n    actor.narrative_role ||\n    actor.role ||\n    \`actor-\${index + 1}\`,\n  ).toLowerCase();\n}\n\nfunction canonicalReferenceIds(value) {\n  return unique(\n    list(value).map((entry) =>\n      typeof entry === \"string\" || typeof entry === \"number\"\n        ? String(entry)\n        : String(\n            entry?.id ||\n            entry?.asset_id ||\n            entry?.reference_asset_id ||\n            entry?.source_asset_id ||\n            \"\",\n          ),\n    ),\n  );\n}\n\nfunction mergeEvidenceBoundActors(canonicalActors = [], directedActors = []) {\n  const canonical = list(canonicalActors);\n  const directed = list(directedActors);\n  if (!canonical.length) return directed;\n\n  const byKey = new Map(\n    directed.map((actor, index) => [actorBindingKey(actor, index), actor]),\n  );\n\n  return canonical.map((actor, index) => {\n    const key = actorBindingKey(actor, index);\n    const directedActor =\n      byKey.get(key) ||\n      directed.find((candidate) =>\n        text(candidate.narrative_role || candidate.role).toLowerCase() ===\n        text(actor.narrative_role || actor.role).toLowerCase(),\n      ) ||\n      directed[index] ||\n      {};\n    const canonicalIdentityIds = canonicalReferenceIds(\n      actor.identity_reference_asset_ids ||\n      actor.identity_asset_ids ||\n      actor.reference_asset_ids,\n    );\n    const canonicalWardrobe = object(actor.wardrobe);\n    const directedWardrobe = object(directedActor.wardrobe);\n    const canonicalWardrobeIds = canonicalReferenceIds(\n      canonicalWardrobe.reference_asset_ids ||\n      canonicalWardrobe.asset_ids ||\n      actor.wardrobe_reference_asset_ids,\n    );\n\n    return {\n      ...actor,\n      ...directedActor,\n      binding_key:\n        actor.binding_key ||\n        actor.evidence_binding_key ||\n        directedActor.binding_key ||\n        key,\n      evidence_binding_key:\n        actor.evidence_binding_key ||\n        actor.binding_key ||\n        directedActor.evidence_binding_key ||\n        key,\n      identity_mode:\n        actor.identity_mode ||\n        directedActor.identity_mode ||\n        (canonicalIdentityIds.length ? \"REFERENCE_IDENTITY\" : null),\n      identity_reference_asset_ids:\n        canonicalIdentityIds.length\n          ? canonicalIdentityIds\n          : canonicalReferenceIds(\n              directedActor.identity_reference_asset_ids ||\n              directedActor.identity_asset_ids,\n            ),\n      wardrobe: {\n        ...directedWardrobe,\n        ...canonicalWardrobe,\n        reference_asset_ids:\n          canonicalWardrobeIds.length\n            ? canonicalWardrobeIds\n            : canonicalReferenceIds(\n                directedWardrobe.reference_asset_ids ||\n                directedWardrobe.asset_ids,\n              ),\n      },\n      wardrobe_reference_asset_ids:\n        canonicalWardrobeIds.length\n          ? canonicalWardrobeIds\n          : canonicalReferenceIds(\n              directedActor.wardrobe_reference_asset_ids,\n            ),\n      evidence_locked: Boolean(\n        canonicalIdentityIds.length || canonicalWardrobeIds.length,\n      ),\n    };\n  });\n}\n\nfunction convergeDirection({`,
      path,
      "insert-canonical-actor-merge",
    );
  }

  source = replaceRequired(
    source,
    `    actors: list(combined.actors).length\n      ? combined.actors\n      : list(shot.actors).length\n        ? shot.actors\n        : list(scene.actors),`,
    `    actors: mergeEvidenceBoundActors(\n      list(shot.actors).length ? shot.actors : list(scene.actors),\n      list(combined.actors),\n    ),`,
    path,
    "preserve-evidence-bound-actors",
  );

  source = source.replaceAll(
    "ambiguous staff/customer roles",
    "ambiguous declared narrative roles",
  );

  source = replaceRequired(
    source,
    `  "PASS only when no unsupported logo, signage, text, product or claim is invented.",`,
    `  "PASS only when no unsupported logo, signage, text, product or claim is invented.",\n  "PASS only when every bound identity remains recognizably matched to its assigned identity evidence.",\n  "PASS only when every bound wardrobe remains matched in silhouette, garment type, colour, trim, markings and role assignment.",\n  "PASS only when every required brand mark or visible text is exact; approximations, invented lettering and misspellings always fail.",\n  "PASS only when the generated location remains recognizably matched to the authoritative location evidence and does not become a generic substitute.",\n  "PASS only when this shot has a distinct story action, composition and camera relationship from adjacent shots unless an explicit continuity handoff requires a match.",`,
    path,
    "add-evidence-fidelity-qa",
  );

  source = replaceRequired(
    source,
    `      "Write at least ten binary QA checks that can fail the image.",`,
    `      "Write at least ten binary QA checks that can fail the image.",\n      "Make this shot visually and narratively distinct from adjacent shots: vary the decisive action, subject relationship, camera distance, angle, composition, foreground/midground/background design or location zone while preserving continuity and factual evidence.",\n      "Never replace canonical identity, wardrobe, location, product, brand or text reference bindings with newly invented actor or design data.",`,
    path,
    "add-shot-distinctiveness-direction",
  );

  write(path, source);
}

function patchProductionTaskRuntime() {
  const path = "lib/operations/tasks/runtime/ProductionTaskRuntime.js";
  let source = read(path);
  const marker = "CREATIVE_GENERATED_FRAME_QA_AND_CORRECTION_LOOP_V5";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      "async function createMediaAsset({ task, execution, type, url }) {",
      `// ${marker}\nfunction resolvedMediaUrl(value = {}) {\n  return firstValue(\n    value?.image_url,\n    value?.file_url,\n    value?.video_url,\n    value?.url,\n    value?.asset?.image_url,\n    value?.asset?.file_url,\n    value?.asset?.video_url,\n    value?.asset?.url,\n    value?.output?.image_url,\n    value?.output?.file_url,\n    value?.output?.video_url,\n    value?.output?.url,\n  );\n}\n\nasync function resolveDependencyAssets(task = {}) {\n  const output = [];\n  for (const dependencyId of task.depends_on || []) {\n    const dependency = await Repository.getById(dependencyId, {\n      organization_id: task.organization_id,\n      creative_project_id: task.creative_project_id,\n    });\n    if (!dependency) continue;\n    const url = resolvedMediaUrl(dependency.output || dependency);\n    if (!url) continue;\n    output.push({\n      id: dependency.output?.asset_id || dependency.id,\n      url,\n      image_url: url,\n      file_url: url,\n      source_task_id: dependency.id,\n      source_node_id: dependency.metadata?.node_id || null,\n      dependency_task_type: dependency.type || null,\n      generated_dependency: true,\n    });\n  }\n  return output;\n}\n\nasync function priorCompletedMasterStillUrls(task = {}) {\n  if (String(task.type || \"\").toUpperCase() !== \"QUALITY_REVIEW\") {\n    return [];\n  }\n\n  const tasks = await Repository.listByProject({\n    organization_id: task.organization_id,\n    creative_project_id: task.creative_project_id,\n  });\n  const dependencyIds = new Set(list(task.depends_on).map(String));\n\n  return [...new Set(\n    tasks\n      .filter((candidate) =>\n        String(candidate.type || \"\").toUpperCase() === \"GENERATE_IMAGE\" &&\n        [\"COMPLETED\", \"APPROVED\"].includes(\n          String(candidate.status || \"\").toUpperCase(),\n        ) &&\n        !dependencyIds.has(String(candidate.id)),\n      )\n      .map((candidate) => resolvedMediaUrl(candidate.output || candidate))\n      .filter(Boolean),\n  )].slice(0, 6);\n}\n\nfunction qualityCorrections(captured = {}) {\n  return [...new Set([\n    ...list(captured.quality_review?.correction_instructions),\n    ...list(captured.quality_review?.critical_failures),\n    ...list(captured.quality_review?.issues).map((issue) =>\n      typeof issue === \"string\"\n        ? issue\n        : issue?.correction || issue?.message || issue?.issue,\n    ),\n    captured.message,\n  ].filter(Boolean).map(String))];\n}\n\nasync function resetRejectedMasterStill({ task, captured }) {\n  if (String(task?.type || \"\").toUpperCase() !== \"QUALITY_REVIEW\") {\n    return null;\n  }\n  if (!captured.quality_review) return null;\n\n  const cycle = Number(task.metadata?.quality_revision_cycle || 0) + 1;\n  const maximum = Number(task.metadata?.max_quality_revisions || 3);\n  if (cycle > maximum) return null;\n\n  const dependencyId = list(task.depends_on)[0];\n  if (!dependencyId) return null;\n  const dependency = await Repository.getById(dependencyId, {\n    organization_id: task.organization_id,\n    creative_project_id: task.creative_project_id,\n  });\n  if (!dependency || String(dependency.type || \"\").toUpperCase() !== \"GENERATE_IMAGE\") {\n    return null;\n  }\n\n  const corrections = qualityCorrections(captured);\n  const rejectedVersion = {\n    asset_id: dependency.output?.asset_id || null,\n    url: resolvedMediaUrl(dependency.output || dependency) || null,\n    quality_review: captured.quality_review,\n    rejected_at: new Date().toISOString(),\n    revision_cycle: cycle,\n  };\n\n  await Repository.update(\n    dependency.id,\n    {\n      status: PRODUCTION_TASK_STATUS.WAITING,\n      output: {\n        ...(dependency.output || {}),\n        rejected_versions: [\n          ...list(dependency.output?.rejected_versions),\n          rejectedVersion,\n        ].slice(-3),\n      },\n      review: {\n        ...(dependency.review || {}),\n        required: true,\n        approved: false,\n        notes: corrections.join(\"\\n\"),\n      },\n      metadata: {\n        ...(dependency.metadata || {}),\n        quality_revision_cycle: cycle,\n        correction_instructions: corrections,\n        provider_status: \"WAITING_FOR_QUALITY_CORRECTION\",\n      },\n      worker_id: null,\n      lease_expires_at: null,\n      error: null,\n    },\n    {\n      organization_id: task.organization_id,\n      creative_project_id: task.creative_project_id,\n    },\n  );\n\n  return Repository.update(\n    task.id,\n    {\n      status: PRODUCTION_TASK_STATUS.WAITING,\n      output: {\n        ...(task.output || {}),\n        last_quality_rejection: rejectedVersion,\n      },\n      review: {\n        ...(task.review || {}),\n        approved: false,\n        notes: corrections.join(\"\\n\"),\n      },\n      metadata: {\n        ...(task.metadata || {}),\n        quality_revision_cycle: cycle,\n        correction_instructions: corrections,\n        provider_status: \"WAITING_FOR_CORRECTED_DEPENDENCY\",\n      },\n      worker_id: null,\n      lease_expires_at: null,\n      error: null,\n    },\n    {\n      organization_id: task.organization_id,\n      creative_project_id: task.creative_project_id,\n    },\n  );\n}\n\nasync function createMediaAsset({ task, execution, type, url }) {`,
      path,
      "insert-quality-correction-loop",
    );
  }

  source = replaceRequired(
    source,
    `    const assets = await resolveTaskAssets(task);\n    const authorizedReferenceAssetIds = [...new Set([`,
    `    const dependencyAssets = await resolveDependencyAssets(task);\n    const assets = await resolveTaskAssets(task);\n    const comparisonImages = await priorCompletedMasterStillUrls(task);\n    const inspectedImage = resolvedMediaUrl(dependencyAssets[0] || {});\n    const authorizedReferenceAssetIds = [...new Set([`,
    path,
    "resolve-explicit-inspection-image",
  );

  source = replaceRequired(
    source,
    `          assets: { selectedAssets: assets },\n          source_image: firstValue(`,
    `          assets: { selectedAssets: assets },\n          image:\n            String(task.type || \"\").toUpperCase() === \"QUALITY_REVIEW\"\n              ? inspectedImage\n              : task.input?.image,\n          inspected_image: inspectedImage,\n          comparison_images: comparisonImages,\n          source_image: firstValue(`,
    path,
    "pass-generated-frame-to-qa",
  );

  source = replaceRequired(
    source,
    `    return Repository.update(\n      id,\n      {\n        status: PRODUCTION_TASK_STATUS.FAILED,`,
    `    const corrected = await resetRejectedMasterStill({\n      task,\n      captured,\n    });\n    if (corrected) return corrected;\n\n    return Repository.update(\n      id,\n      {\n        status: PRODUCTION_TASK_STATUS.FAILED,`,
    path,
    "automatic-master-still-correction",
  );

  write(path, source);
}

function patchOpenAIProvider() {
  const path = "lib/platform/service-runtime/providers/openai/OpenAIProvider.js";
  let source = read(path);
  const marker = "CREATIVE_VISUAL_EVIDENCE_COMPARISON_QA_V5";

  source = replaceRequired(
    source,
    `    response = await client.images.edit({\n      model: "gpt-image-1",\n      image: files.length === 1 ? files[0] : files,\n      prompt: finalPrompt,\n      size,\n    });`,
    `    response = await client.images.edit({\n      model: "gpt-image-1",\n      image: files.length === 1 ? files[0] : files,\n      prompt: finalPrompt,\n      size,\n      quality: input.quality || "high",\n      input_fidelity: "high",\n      output_format: "png",\n    });`,
    path,
    "high-input-fidelity-reference-edit",
  );

  source = replaceRequired(
    source,
    `- No identity drift, altered product geometry, misspelled logos, invented architecture, broken anatomy, duplicated objects, fake text, watermark, or artificial-looking skin.`,
    `- No identity drift, altered product geometry, misspelled logos, invented architecture, broken anatomy, duplicated objects, fake text, watermark, or artificial-looking skin.\n- Exact brand marks and visible text may never be redrawn, approximated or hallucinated. Preserve verified source pixels when present; otherwise keep the designated area clean for an exact post-production overlay.\n- Match every evidence-bound wardrobe in garment type, silhouette, colour, trim, markings and subject assignment.\n- This frame must communicate its own distinct story action and composition rather than repeating another shot with minor pose changes.`,
    path,
    "strict-brand-wardrobe-and-diversity-prompt",
  );

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      `async function analyzeImage({\n  client,\n  model,\n  prompt,\n  image,\n  assets,\n  mode,\n  minimumScore = 90,\n}) {`,
      `// ${marker}\nasync function analyzeImage({\n  client,\n  model,\n  prompt,\n  image,\n  assets,\n  mode,\n  minimumScore = 90,\n  comparisonImages = [],\n  referenceManifest = [],\n  evidenceManifest = {},\n  specification = {},\n}) {`,
      path,
      "extend-image-analysis-contract",
    );
  }

  source = replaceRequired(
    source,
    `  const response = await client.responses.create({\n    model,\n    input: [\n      {\n        role: "user",\n        content: [\n          {\n            type: "input_text",\n            text: prompt || "Analyze this image and return strict JSON.",\n          },\n          {\n            type: "input_image",\n            image_url: resolvedImage,\n          },\n        ],\n      },\n    ],`,
    `  const evidenceUrls = referenceUrls(assets)\n    .filter((url) => url && url !== resolvedImage)\n    .slice(0, 6);\n  const comparisonUrls = [...new Set(list(comparisonImages).filter(Boolean))]\n    .filter((url) => url !== resolvedImage)\n    .slice(0, 6);\n  const masterStillQa = mode === "creative_master_still_qa";\n  const analysisPrompt = masterStillQa\n    ? [\n        prompt || "Inspect this generated master still.",\n        "The first image is the GENERATED FRAME under review.",\n        "The following EVIDENCE images are authoritative references. Compare the generated frame against the exact roles assigned in the evidence manifest.",\n        "The final COMPARISON images are previously generated story frames. Reject exact duplicates, near-duplicates, repeated dominant action, repeated composition, repeated camera relationship or a sequence that does not advance the story.",\n        "Return strict JSON with: passed, overall_score, critical_failures, issues, correction_instructions, release_readiness, evidence_fidelity, and story_distinctiveness.",\n        "evidence_fidelity must contain LOCATION, IDENTITY, WARDROBE, PRODUCT, BRAND, TEXT and STYLE objects with required, passed, score, matched_reference_asset_ids and issues.",\n        "story_distinctiveness must contain passed, duplicate_of_previous, repeated_action, repeated_composition, repeated_camera_relationship, narrative_progression_visible and issues.",\n        "Any fabricated, approximate, misspelled or substituted logo/wordmark fails BRAND and TEXT. Any clothing that does not match bound wardrobe evidence fails WARDROBE. Any generic substitute for the referenced place fails LOCATION.",\n        "EVIDENCE ROLE MANIFEST: " + JSON.stringify(evidenceManifest || {}),\n        "REFERENCE MANIFEST: " + JSON.stringify(referenceManifest || []),\n        "SHOT CONTRACT: " + JSON.stringify(specification?.shot || {}),\n      ].join("\\n\\n")\n    : prompt || "Analyze this image and return strict JSON.";\n  const content = [\n    { type: "input_text", text: analysisPrompt },\n    { type: "input_text", text: "GENERATED FRAME TO INSPECT" },\n    { type: "input_image", image_url: resolvedImage },\n    ...evidenceUrls.flatMap((url, index) => [\n      { type: "input_text", text: "AUTHORITATIVE EVIDENCE IMAGE " + (index + 1) },\n      { type: "input_image", image_url: url },\n    ]),\n    ...comparisonUrls.flatMap((url, index) => [\n      { type: "input_text", text: "PREVIOUS STORY FRAME " + (index + 1) },\n      { type: "input_image", image_url: url },\n    ]),\n  ];\n\n  const response = await client.responses.create({\n    model,\n    input: [\n      {\n        role: "user",\n        content,\n      },\n    ],`,
    path,
    "compare-generated-frame-with-evidence",
  );

  source = replaceRequired(
    source,
    `    const passed =\n      json.passed === true &&\n      overallScore >= Number(minimumScore || 90) &&\n      criticalFailures.length === 0;`,
    `    const requiredRoles = list(evidenceManifest?.required_roles)\n      .map((role) => String(role).toUpperCase());\n    const fidelity = json.evidence_fidelity && typeof json.evidence_fidelity === "object"\n      ? json.evidence_fidelity\n      : {};\n    const failedEvidenceRoles = requiredRoles.filter((role) => {\n      const result = fidelity[role] || fidelity[role.toLowerCase()] || null;\n      if (!result) return true;\n      const score = Number(result.score ?? 0);\n      return result.passed !== true || !Number.isFinite(score) || score < 85;\n    });\n    const distinctiveness = json.story_distinctiveness &&\n      typeof json.story_distinctiveness === "object"\n      ? json.story_distinctiveness\n      : {};\n    const duplicateFailure = comparisonUrls.length > 0 && (\n      distinctiveness.passed !== true ||\n      distinctiveness.duplicate_of_previous === true ||\n      distinctiveness.repeated_action === true ||\n      distinctiveness.repeated_composition === true ||\n      distinctiveness.repeated_camera_relationship === true ||\n      distinctiveness.narrative_progression_visible !== true\n    );\n    const passed =\n      json.passed === true &&\n      overallScore >= Number(minimumScore || 90) &&\n      criticalFailures.length === 0 &&\n      failedEvidenceRoles.length === 0 &&\n      !duplicateFailure;`,
    path,
    "fail-closed-evidence-and-duplicate-qa",
  );

  source = replaceRequired(
    source,
    `        minimum_score: Number(minimumScore || 90),`,
    `        minimum_score: Number(minimumScore || 90),\n        failed_evidence_roles: failedEvidenceRoles,\n        duplicate_or_story_repetition: duplicateFailure,\n        evidence_image_count: evidenceUrls.length,\n        comparison_image_count: comparisonUrls.length,`,
    path,
    "record-evidence-fidelity-failures",
  );

  source = replaceRequired(
    source,
    `      minimum_score,\n      response_format,`,
    `      minimum_score,\n      comparison_images,\n      reference_manifest,\n      evidence_role_manifest,\n      response_format,`,
    path,
    "destructure-qa-evidence-inputs",
  );

  source = replaceRequired(
    source,
    `          mode,\n          minimumScore: minimum_score,\n        });`,
    `          mode,\n          minimumScore: minimum_score,\n          comparisonImages: comparison_images,\n          referenceManifest: reference_manifest,\n          evidenceManifest: evidence_role_manifest,\n          specification,\n        });`,
    path,
    "pass-qa-evidence-inputs",
  );

  write(path, source);
}

function patchProviderInput() {
  const path = "lib/creative/production/contracts/CreativeProviderInputRuntime.js";
  let source = read(path);
  const marker = "CREATIVE_EXACT_EVIDENCE_RENDERING_POLICY_V5";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      `    const prepared = {`,
      `    // ${marker}\n    const exactBrandRequired = evidenceManifest.bindings.some((binding) =>\n      ["BRAND", "TEXT"].includes(String(binding.role || "").toUpperCase()),\n    );\n    const exactWardrobeRequired = evidenceManifest.bindings.some((binding) =>\n      String(binding.role || "").toUpperCase() === "WARDROBE",\n    );\n\n    const prepared = {`,
      path,
      "insert-exact-evidence-policy",
    );
  }

  source = replaceRequired(
    source,
    `      reference_contract: contract,\n      prompt: [`,
    `      reference_contract: contract,\n      exact_evidence_rendering_policy: {\n        exact_brand_or_text_required: exactBrandRequired,\n        exact_wardrobe_required: exactWardrobeRequired,\n        invented_brand_marks_forbidden: true,\n        generated_text_substitution_forbidden: true,\n        exact_post_production_overlay_required_when_pixels_cannot_be_preserved:\n          exactBrandRequired,\n      },\n      prompt: [`,
    path,
    "expose-exact-evidence-policy",
  );

  source = replaceRequired(
    source,
    `          ? "Use approved brand evidence only. Do not invent, approximate or hallucinate logos, wordmarks, signage or visible brand text. Exact readable brand marks belong in post-production overlays unless provider rendering can be pixel-verified."`,
    `          ? "Use approved brand evidence only. Do not invent, approximate or hallucinate logos, wordmarks, signage or visible brand text. Never redraw the mark from memory. Preserve verified source pixels where possible; otherwise leave a clean placement area for an exact post-production overlay and do not render substitute lettering."`,
    path,
    "strengthen-exact-brand-policy",
  );

  source = replaceRequired(
    source,
    `          ? "Match approved wardrobe evidence for the declared subjects."`,
    `          ? "Match approved wardrobe evidence for each assigned subject exactly in garment type, silhouette, colour, trim, markings and role assignment. Do not replace it with generic occupational clothing."`,
    path,
    "strengthen-wardrobe-policy",
  );

  write(path, source);
}

function patchPlanner() {
  const path = "lib/creative/production-graph/planner/ProductionGraphPlanner.js";
  let source = read(path);
  const marker = "CREATIVE_MASTER_STILL_FIDELITY_AND_DIVERSITY_GATE_V5";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      `function buildShotSpecification(scene, shot) {`,
      `// ${marker}\nfunction buildShotSpecification(scene, shot) {`,
      path,
      "mark-master-still-fidelity-contract",
    );
  }

  source = replaceRequired(
    source,
    `      quality_requirements:\n        shot.quality_requirements || shot.metadata?.quality_requirements || {},`,
    `      quality_requirements: {\n        evidence_role_comparison_required: true,\n        exact_brand_and_text_required: true,\n        exact_wardrobe_assignment_required: true,\n        distinct_from_adjacent_story_frames: true,\n        automatic_correction_cycles: 3,\n        ...(shot.quality_requirements || shot.metadata?.quality_requirements || {}),\n      },\n      visual_uniqueness_contract: {\n        distinct_story_action_required: true,\n        distinct_composition_required: true,\n        distinct_camera_relationship_required: true,\n        repeated_generic_pose_forbidden: true,\n        near_duplicate_frame_forbidden: true,\n        continuity_match_allowed_only_when_explicitly_declared: true,\n        ...(shot.visual_uniqueness_contract ||\n          shot.metadata?.visual_uniqueness_contract || {}),\n      },`,
    path,
    "add-shot-fidelity-and-diversity-specification",
  );

  source = replaceRequired(
    source,
    `              brand_fidelity: true,\n              anatomy: true,`,
    `              brand_fidelity: true,\n              exact_logo_and_text_fidelity: true,\n              wardrobe_fidelity: true,\n              evidence_role_comparison: true,\n              story_action_distinctiveness: true,\n              composition_distinctiveness: true,\n              anatomy: true,`,
    path,
    "expand-master-still-quality-gate",
  );

  write(path, source);
}

patchShotDirection();
patchProductionTaskRuntime();
patchOpenAIProvider();
patchProviderInput();
patchPlanner();

console.log("CREATIVE_EVIDENCE_FIDELITY_AND_DIVERSITY_V5=APPLIED");
