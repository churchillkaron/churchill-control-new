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
    throw new Error(`CREATIVE_EVIDENCE_BINDING_PATTERN_MISSING:${path}:${label}`);
  }
  return source.replace(search, replacement);
}

function replaceRegexRequired(source, pattern, replacement, marker, path) {
  if (source.includes(marker)) return source;
  if (!pattern.test(source)) {
    throw new Error(`CREATIVE_EVIDENCE_BINDING_PATTERN_MISSING:${path}:${marker}`);
  }
  return source.replace(pattern, replacement);
}

function patchStoryboardEvidenceBinding() {
  const path = "lib/creative/storyboard/runtime/CreativeStoryboardExecutionContractConvergence.js";
  let source = read(path);
  const marker = "CREATIVE_STORYBOARD_EVIDENCE_BINDING_V3";

  if (!source.includes(marker)) {
    source = replaceRequired(
      source,
      "function list(value) {",
      `import {\n  classifyCreativeEvidenceRoles,\n  creativeEvidenceAssetId,\n  deriveCreativeEvidenceRequirements,\n} from \"@/lib/creative/production/contracts/CreativeEvidenceRoleContractV2\";\n\n// ${marker}\nfunction list(value) {`,
      path,
      "import-evidence-contract",
    );
  }

  const helpers = `function referenceValueId(value) {
  if (!value) return null;
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim();
    return normalized && normalized !== "[object Object]" ? normalized : null;
  }
  if (typeof value !== "object") return null;
  return String(
    value.id ||
    value.asset_id ||
    value.creative_asset_id ||
    value.source_asset_id ||
    value.reference_asset_id ||
    value.metadata?.source_asset_id ||
    value.metadata?.creative_asset_id ||
    "",
  ).trim() || null;
}

function nestedReferenceValues(shot = {}) {
  return [
    ...list(shot.reference_asset_ids),
    ...list(shot.assets),
    ...list(shot.master_still_contract?.reference_asset_ids),
    ...list(shot.location_reference_asset_ids),
    shot.location_reference_asset_id,
    shot.source_plate_asset_id,
    shot.composition_plan?.source_plate_asset_id,
    ...list(shot.reference_pack?.asset_ids),
    ...list(shot.reference_pack?.reference_asset_ids),
    ...list(shot.reference_pack?.location_asset_ids),
    ...list(shot.reference_pack?.brand_asset_ids),
    ...list(shot.brand_reference_asset_ids),
    shot.brand_reference_asset_id,
    ...list(shot.style_reference_asset_ids),
    shot.style_reference_asset_id,
    ...list(shot.text_reference_asset_ids),
    shot.text_reference_asset_id,
    ...list(shot.actors).flatMap((actor) => [
      ...list(actor?.identity_reference_asset_ids),
      actor?.identity_reference_asset_id,
      ...list(actor?.reference_asset_ids),
      actor?.reference_asset_id,
      ...list(actor?.wardrobe_reference_asset_ids),
      actor?.wardrobe_reference_asset_id,
      ...list(actor?.wardrobe?.reference_asset_ids),
      actor?.wardrobe?.reference_asset_id,
    ]),
    ...list(shot.products).flatMap((product) => [
      ...list(product?.reference_asset_ids),
      product?.reference_asset_id,
      ...list(product?.asset_ids),
      product?.asset_id,
    ]),
  ];
}

function referenceIds(shot = {}) {
  return unique(
    nestedReferenceValues(shot)
      .map(referenceValueId)
      .filter(Boolean),
  );
}

function assetRoleIndex(assets = []) {
  const byId = new Map();
  const byRole = new Map();

  for (const asset of list(assets)) {
    const id = creativeEvidenceAssetId(asset) || referenceValueId(asset);
    if (!id || byId.has(id)) continue;
    byId.set(id, asset);

    for (const role of classifyCreativeEvidenceRoles(asset)) {
      const normalized = String(role || "").toUpperCase();
      if (!normalized) continue;
      const values = byRole.get(normalized) || [];
      values.push(id);
      byRole.set(normalized, values);
    }
  }

  return { byId, byRole };
}

function roleIds(index, role) {
  return unique(list(index.byRole.get(String(role || "").toUpperCase()))).slice(0, 3);
}

function actorIdentityIds(actor = {}) {
  return unique([
    ...list(actor.identity_reference_asset_ids),
    actor.identity_reference_asset_id,
    ...list(actor.reference_asset_ids),
    actor.reference_asset_id,
  ].map(referenceValueId).filter(Boolean));
}

function actorWardrobeIds(actor = {}) {
  return unique([
    ...list(actor.wardrobe_reference_asset_ids),
    actor.wardrobe_reference_asset_id,
    ...list(actor.wardrobe?.reference_asset_ids),
    actor.wardrobe?.reference_asset_id,
  ].map(referenceValueId).filter(Boolean));
}

function productReferenceIds(product = {}) {
  return unique([
    ...list(product.reference_asset_ids),
    product.reference_asset_id,
    ...list(product.asset_ids),
    product.asset_id,
  ].map(referenceValueId).filter(Boolean));
}

function bindActors(actors = [], identityIds = [], wardrobeIds = []) {
  let identityCursor = 0;
  let wardrobeCursor = 0;

  return list(actors).map((actor) => {
    const source = object(actor);
    const identityMode = String(
      source.identity_mode || source.identityMode || "",
    ).toUpperCase();
    const existingIdentityIds = actorIdentityIds(source);
    const existingWardrobeIds = actorWardrobeIds(source);
    const next = { ...source };

    if (
      identityMode === "REFERENCE_IDENTITY" &&
      !existingIdentityIds.length &&
      identityIds.length
    ) {
      next.identity_reference_asset_ids = [
        identityIds[identityCursor % identityIds.length],
      ];
      identityCursor += 1;
    }

    const wardrobeReferenceRequired = Boolean(
      source.wardrobe_exact === true ||
      source.wardrobe_reference_required === true ||
      /REFERENCE|EXACT|MATCH|PRESERVE/i.test(
        typeof source.wardrobe === "string"
          ? source.wardrobe
          : JSON.stringify(source.wardrobe || {}),
      ),
    );

    if (
      wardrobeReferenceRequired &&
      !existingWardrobeIds.length &&
      wardrobeIds.length
    ) {
      next.wardrobe_reference_asset_ids = [
        wardrobeIds[wardrobeCursor % wardrobeIds.length],
      ];
      wardrobeCursor += 1;
    }

    return next;
  });
}

function bindProducts(products = [], productIds = []) {
  let cursor = 0;

  return list(products).map((product) => {
    const source = object(product);
    const exact = Boolean(
      source.exact === true ||
      source.reference_required === true ||
      /REFERENCE|EXACT|MATCH|PRESERVE/i.test(JSON.stringify(source)),
    );
    if (!exact || productReferenceIds(source).length || !productIds.length) {
      return source;
    }

    const id = productIds[cursor % productIds.length];
    cursor += 1;
    return {
      ...source,
      reference_asset_ids: [id],
    };
  });
}

function bindShotEvidence({ scene = {}, shot = {}, assets = [] } = {}) {
  const source = object(shot);
  const index = assetRoleIndex(assets);
  const explicitIds = referenceIds(source);
  const requirements = deriveCreativeEvidenceRequirements({
    scene,
    shot: source,
    authorized_assets: [],
  });
  const requiredRoles = unique(requirements.map((requirement) => requirement.role));
  const selectedByRole = new Map(
    requiredRoles.map((role) => [role, roleIds(index, role)]),
  );
  const selectedIds = unique([
    ...explicitIds,
    ...requiredRoles.flatMap((role) => list(selectedByRole.get(role))),
  ]);
  const locationIds = list(selectedByRole.get("LOCATION"));
  const brandIds = list(selectedByRole.get("BRAND"));
  const identityIds = list(selectedByRole.get("IDENTITY"));
  const wardrobeIds = list(selectedByRole.get("WARDROBE"));
  const productIds = list(selectedByRole.get("PRODUCT"));
  const styleIds = list(selectedByRole.get("STYLE"));
  const textIds = list(selectedByRole.get("TEXT"));
  const existingRequirements = object(source.evidence_requirements);
  const generatedRoles = unique([
    ...list(existingRequirements.generated_roles),
    ...list(existingRequirements.excluded_exact_roles),
  ]);
  const referencePack = object(source.reference_pack);
  const compositionPlan = object(source.composition_plan);

  return {
    ...source,
    actors: bindActors(source.actors, identityIds, wardrobeIds),
    products: bindProducts(source.products, productIds),
    reference_asset_ids: selectedIds,
    assets: selectedIds,
    location_reference_asset_ids: unique([
      ...list(source.location_reference_asset_ids),
      source.location_reference_asset_id,
      ...locationIds,
    ].map(referenceValueId).filter(Boolean)),
    brand_reference_asset_ids: unique([
      ...list(source.brand_reference_asset_ids),
      source.brand_reference_asset_id,
      ...brandIds,
    ].map(referenceValueId).filter(Boolean)),
    style_reference_asset_ids: unique([
      ...list(source.style_reference_asset_ids),
      source.style_reference_asset_id,
      ...styleIds,
    ].map(referenceValueId).filter(Boolean)),
    text_reference_asset_ids: unique([
      ...list(source.text_reference_asset_ids),
      source.text_reference_asset_id,
      ...textIds,
    ].map(referenceValueId).filter(Boolean)),
    evidence_requirements: {
      ...existingRequirements,
      required_roles: unique([
        ...list(existingRequirements.required_roles),
        ...requiredRoles,
      ]).filter((role) => !generatedRoles.includes(role)),
      generated_roles: generatedRoles,
      excluded_exact_roles: generatedRoles,
      deterministic_binding_version:
        "CREATIVE_STORYBOARD_EVIDENCE_BINDING_V3",
    },
    reference_pack: {
      ...referencePack,
      asset_ids: unique([
        ...list(referencePack.asset_ids),
        ...selectedIds,
      ].map(referenceValueId).filter(Boolean)),
      reference_asset_ids: unique([
        ...list(referencePack.reference_asset_ids),
        ...selectedIds,
      ].map(referenceValueId).filter(Boolean)),
      location_asset_ids: unique([
        ...list(referencePack.location_asset_ids),
        ...locationIds,
      ].map(referenceValueId).filter(Boolean)),
      brand_asset_ids: unique([
        ...list(referencePack.brand_asset_ids),
        ...brandIds,
      ].map(referenceValueId).filter(Boolean)),
      required_roles: unique([
        ...list(referencePack.required_roles),
        ...requiredRoles,
      ]).filter((role) => !generatedRoles.includes(role)),
    },
    composition_plan: {
      ...compositionPlan,
      source_plate_asset_id:
        compositionPlan.source_plate_asset_id || locationIds[0] || null,
    },
    metadata: {
      ...object(source.metadata),
      evidence_binding: {
        version: "CREATIVE_STORYBOARD_EVIDENCE_BINDING_V3",
        required_roles: requiredRoles,
        selected_asset_ids: selectedIds,
        selected_by_role: Object.fromEntries(
          requiredRoles.map((role) => [role, list(selectedByRole.get(role))]),
        ),
        unresolved_roles: requiredRoles.filter(
          (role) => !list(selectedByRole.get(role)).length,
        ),
        fail_closed: true,
      },
    },
  };
}

`;

  source = replaceRegexRequired(
    source,
    /function referenceIds\(shot = \{\}\) \{[\s\S]*?\n\}\n\nfunction referencePreserveRules/,
    `${helpers}function referencePreserveRules`,
    "function bindShotEvidence",
    path,
  );

  source = replaceRequired(
    source,
    "function convergeShot({ shot, sceneIndex, shotIndex }) {\n  const source = object(shot);",
    "function convergeShot({ shot, scene, assets, sceneIndex, shotIndex }) {\n  const source = bindShotEvidence({ scene, shot, assets });",
    path,
    "bind-shot-before-convergence",
  );

  source = replaceRequired(
    source,
    "export function convergeCreativeStoryboardExecutionContracts({\n  creativePlan,\n} = {}) {",
    "export function convergeCreativeStoryboardExecutionContracts({\n  creativePlan,\n  assets = [],\n} = {}) {",
    path,
    "accept-project-assets",
  );

  source = replaceRequired(
    source,
    "      convergeShot({\n        shot,\n        sceneIndex,\n        shotIndex,\n      }),",
    "      convergeShot({\n        shot,\n        scene,\n        assets,\n        sceneIndex,\n        shotIndex,\n      }),",
    path,
    "pass-scene-and-assets",
  );

  source = replaceRequired(
    source,
    "        canonical_asset_selection_allowed: false,",
    "        canonical_asset_selection_allowed: true,\n        deterministic_evidence_role_binding: true,\n        evidence_binding_version: \"CREATIVE_STORYBOARD_EVIDENCE_BINDING_V3\",",
    path,
    "metadata-evidence-binding",
  );

  write(path, source);
}

function patchDirectorEvidenceInput() {
  const path = "lib/creative/director/runtime/CreativeDirectorRuntime.js";
  let source = read(path);

  source = replaceRequired(
    source,
    "function convergeForInspection({\n  creativePlan,\n  targetDuration,\n}) {\n  const executionReady = convergeCreativeStoryboardExecutionContracts({\n    creativePlan,\n  });",
    "function convergeForInspection({\n  creativePlan,\n  targetDuration,\n  assets = [],\n}) {\n  const executionReady = convergeCreativeStoryboardExecutionContracts({\n    creativePlan,\n    assets,\n  });",
    path,
    "pass-assets-into-convergence",
  );

  source = source.replaceAll(
    "      targetDuration: duration,\n    });",
    "      targetDuration: duration,\n      assets: input.assets || [],\n    });",
  );

  write(path, source);
}

patchStoryboardEvidenceBinding();
patchDirectorEvidenceInput();

console.log("CREATIVE_STORYBOARD_EVIDENCE_BINDING_V3=APPLIED");
