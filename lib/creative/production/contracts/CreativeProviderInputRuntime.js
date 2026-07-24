import {
  buildCreativeEvidenceRoleManifest,
  classifyCreativeEvidenceRoles,
  creativeEvidenceAssetId,
  creativeEvidenceAssetUrl,
} from "@/lib/creative/production/contracts/CreativeEvidenceRoleContractV2";

import {
  CreativeImagePromptBudgetRuntime,
} from "@/lib/creative/production/contracts/CreativeImagePromptBudgetRuntime";

const ROLE_PRIORITY = new Map([
  ["LOCATION", 10],
  ["IDENTITY", 20],
  ["WARDROBE", 30],
  ["PRODUCT", 40],
  ["BRAND", 50],
  ["TEXT", 60],
  ["STYLE", 70],
]);
const FULL_SCENE_MODE = "FULL_SCENE_REFERENCE_SYNTHESIS";

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function selectedAssets(assets = {}) {
  if (Array.isArray(assets)) return assets.filter(Boolean);
  return list(assets.selectedAssets);
}

function assetIdentity(asset = {}) {
  return (
    creativeEvidenceAssetId(asset) ||
    String(
      asset.image_url ||
      asset.file_url ||
      asset.url ||
      "",
    )
  );
}

function assetUrl(asset = {}) {
  return creativeEvidenceAssetUrl(asset);
}

function referenceIds(value) {
  return [
    ...new Set(
      list(value)
        .map((entry) => (
          typeof entry === "string" || typeof entry === "number"
            ? String(entry)
            : String(
                entry?.id ||
                entry?.asset_id ||
                entry?.reference_asset_id ||
                "",
              )
        ))
        .filter(Boolean),
    ),
  ];
}

function contractReferenceMap(contract = {}) {
  const references = [
    ...list(contract.references),
    ...list(contract.source_plate?.references),
  ];
  const map = new Map();

  for (const reference of references) {
    const id = String(reference.asset_id || reference.id || "");
    if (!id) continue;
    map.set(id, reference);
  }

  return map;
}

function evidenceBindingMap(manifest = {}) {
  const map = new Map();

  for (const binding of list(manifest.bindings)) {
    for (const assetId of list(binding.selected_asset_ids)) {
      if (!assetId) continue;
      const existing = map.get(String(assetId)) || [];
      map.set(
        String(assetId),
        [...new Set([...existing, binding.role].filter(Boolean))],
      );
    }
  }

  return map;
}

function rolePriority(asset = {}, bindingMap = new Map()) {
  const id = assetIdentity(asset);
  const roles = [
    ...list(bindingMap.get(id)),
    ...classifyCreativeEvidenceRoles(asset),
  ];

  return roles.reduce(
    (priority, role) => Math.min(
      priority,
      ROLE_PRIORITY.get(String(role).toUpperCase()) || 100,
    ),
    100,
  );
}

function sortAssets(assets, contract = {}, evidenceManifest = {}) {
  const map = contractReferenceMap(contract);
  const bindingMap = evidenceBindingMap(evidenceManifest);
  const authoritative = String(
    evidenceManifest.authoritative_source_asset_id ||
    contract.source_plate?.authoritative_asset_id ||
    "",
  );
  const selectedOrder = list(evidenceManifest.all_selected_asset_ids);

  return assets
    .map((asset, index) => ({ asset, index }))
    .sort((left, right) => {
      const leftId = assetIdentity(left.asset);
      const rightId = assetIdentity(right.asset);
      const leftAuthoritative = authoritative && leftId === authoritative ? 0 : 1;
      const rightAuthoritative = authoritative && rightId === authoritative ? 0 : 1;
      const leftSelectedIndex = selectedOrder.indexOf(leftId);
      const rightSelectedIndex = selectedOrder.indexOf(rightId);
      const leftSelected = leftSelectedIndex >= 0 ? 0 : 1;
      const rightSelected = rightSelectedIndex >= 0 ? 0 : 1;

      return (
        leftAuthoritative - rightAuthoritative ||
        leftSelected - rightSelected ||
        (
          leftSelected === 0 && rightSelected === 0
            ? leftSelectedIndex - rightSelectedIndex
            : 0
        ) ||
        rolePriority(map.get(leftId) || left.asset, bindingMap) -
          rolePriority(map.get(rightId) || right.asset, bindingMap) ||
        left.index - right.index
      );
    })
    .map(({ asset }) => asset);
}

function referenceManifest(assets, contract = {}, evidenceManifest = {}) {
  const map = contractReferenceMap(contract);
  const bindingMap = evidenceBindingMap(evidenceManifest);

  return assets.map((asset, index) => {
    const id = assetIdentity(asset);
    const reference = map.get(id) || {};
    const evidenceRoles = [
      ...new Set([
        ...list(bindingMap.get(id)),
        ...classifyCreativeEvidenceRoles(asset),
      ]),
    ];

    return {
      index: index + 1,
      asset_id: id || null,
      name: asset.name || asset.title || asset.file_name || null,
      evidence_roles: evidenceRoles,
      roles: list(
        reference.roles ||
        reference.reference_roles ||
        reference.role ||
        asset.reference_roles ||
        asset.reference_role ||
        asset.metadata?.reference_roles,
      ),
      authoritative_source:
        String(evidenceManifest.authoritative_source_asset_id || "") === id,
      required_for_roles: list(bindingMap.get(id)),
      url_available: Boolean(assetUrl(asset)),
    };
  });
}

function isCreativeGeneration(capability, input = {}) {
  return Boolean(
    input.production_task_id ||
    input.specification?.shot ||
    input.generation_contract ||
    String(input.mode || "").startsWith("creative_") ||
    [
      "reference_grounded_master_still",
      "reference_grounded_full_scene_synthesis",
      "approved_master_still_to_video",
    ].includes(String(input.mode || "")) ||
    [
      "ai.image.generate",
      "ai.video.image_to_video",
    ].includes(capability) && input.specification,
  );
}

function authorizedAssetIds(input = {}, contract = {}) {
  const specification = input.specification || {};
  const shot = specification.shot || {};

  return referenceIds([
    shot.reference_asset_ids,
    shot.assets,
    shot.reference_pack?.asset_ids,
    shot.reference_pack?.reference_asset_ids,
    input.authorized_reference_asset_ids,
    input.metadata?.authorized_reference_asset_ids,
    contract.source_plate?.authoritative_asset_id,
    list(contract.references).map((reference) =>
      reference.asset_id || reference.id,
    ),
  ]);
}

function assertEvidenceManifest(manifest = {}) {
  if (manifest.complete === true && manifest.spend_authorized === true) {
    return manifest;
  }

  const error = new Error("CREATIVE_REQUIRED_EVIDENCE_ROLE_INCOMPLETE");
  error.code =
    manifest.blockers?.[0] ||
    "CREATIVE_REQUIRED_EVIDENCE_ROLE_INCOMPLETE";
  error.details = manifest;
  throw error;
}

function castingContract(input = {}) {
  const specification = input.specification || {};
  const shot = specification.shot || {};
  const scene = specification.scene || {};
  const casting =
    input.casting ||
    shot.casting ||
    scene.casting ||
    null;
  const actors = list(
    casting?.actors ||
    shot.actors ||
    scene.actors,
  );

  return {
    mode: casting?.mode || (actors.length ? "DECLARED_CAST" : "NO_VISIBLE_CAST"),
    exact_identity_required: casting?.exact_identity_required === true,
    actors: actors.map((actor, index) => ({
      binding_key:
        actor.binding_key ||
        actor.evidence_binding_key ||
        `cast-${index + 1}`,
      narrative_role: actor.narrative_role || actor.role || null,
      count: Number(actor.count || 1),
      identity_mode: actor.identity_mode || null,
      identity_reference_asset_ids: referenceIds(
        actor.identity_reference_asset_ids,
      ),
      wardrobe: actor.wardrobe || null,
      action: actor.action || null,
      placement: actor.placement || null,
      gaze: actor.gaze || actor.gaze_target || null,
      interaction_target: actor.interaction_target || null,
    })),
  };
}

function assertFullSceneContract(capability, input = {}) {
  if (capability !== "ai.image.generate") return;

  const contract = input.generation_contract || {};
  const composition =
    input.composition_plan ||
    input.specification?.shot?.composition_plan ||
    {};
  const mode = String(
    contract.generation?.mode ||
    composition.mode ||
    input.mode ||
    "",
  ).toUpperCase();

  if (
    contract.version === "creative-full-scene-reference-synthesis-v1" &&
    mode !== FULL_SCENE_MODE
  ) {
    throw new Error("CREATIVE_FULL_SCENE_GENERATION_MODE_REQUIRED");
  }
  if (
    contract.version === "creative-full-scene-reference-synthesis-v1" &&
    (
      composition.exact_pixels_outside_mask_required === true ||
      list(composition.placement_regions).length ||
      list(composition.protected_regions).length
    )
  ) {
    throw new Error("CREATIVE_MASKED_COMPOSITION_DISABLED");
  }
}

export const CreativeProviderInputRuntime = {
  prepare({ capability, input = {} } = {}) {
    if (!isCreativeGeneration(capability, input)) return input;

    assertFullSceneContract(capability, input);

    const contract =
      input.generation_contract ||
      input.specification?.generation_contract ||
      null;
    const originalAssets = selectedAssets(input.assets);
    const specification = input.specification || {};
    const evidenceManifest = buildCreativeEvidenceRoleManifest({
      scene: specification.scene || {},
      shot: specification.shot || {},
      assets: originalAssets,
      authorized_asset_ids: authorizedAssetIds(input, contract || {}),
    });

    if (capability === "ai.image.generate") {
      assertEvidenceManifest(evidenceManifest);
    }

    const assets = sortAssets(
      originalAssets,
      contract || {},
      evidenceManifest,
    );
    const authoritativeSource = assets.find(
      (asset) =>
        assetIdentity(asset) ===
        String(evidenceManifest.authoritative_source_asset_id || ""),
    );
    const sourceImage =
      input.source_image ||
      assetUrl(authoritativeSource || assets[0] || {});
    const generationMode = String(
      contract?.generation?.mode ||
      input.composition_plan?.mode ||
      input.mode ||
      "reference_grounded_full_scene_synthesis",
    ).toUpperCase();
    const cast = castingContract(input);

    if (
      capability === "ai.video.image_to_video" &&
      !sourceImage
    ) {
      throw new Error("CREATIVE_APPROVED_MASTER_STILL_REQUIRED_FOR_VIDEO");
    }

    const prepared = {
      ...input,
      mode:
        generationMode === FULL_SCENE_MODE
          ? "reference_grounded_full_scene_synthesis"
          : input.mode,
      casting: cast,
      assets: {
        selectedAssets: assets,
      },
      source_image: sourceImage,
      authoritative_source_image: sourceImage,
      evidence_role_manifest: evidenceManifest,
      reference_manifest: referenceManifest(
        assets,
        contract || {},
        evidenceManifest,
      ),
      reference_contract: contract,
      prompt: [
        input.prompt || "",
        evidenceManifest.required_roles.length
          ? `AUTHORITATIVE EVIDENCE ROLE MANIFEST: ${JSON.stringify(evidenceManifest)}`
          : "",
        cast.actors.length
          ? `AUTHORITATIVE CAST MANIFEST: ${JSON.stringify(cast)}`
          : "No visible cast is declared for this shot.",
        evidenceManifest.authoritative_source_asset_id
          ? "The first reference is the authoritative source for the declared location or environment. Regenerate the complete frame with coherent cinema-quality camera, lighting, color, perspective and depth while preserving its recognizable architecture, layout, entrance geometry and spatial truth. Do not replace it with a generic setting."
          : "",
        generationMode === FULL_SCENE_MODE
          ? "FULL-SCENE SYNTHESIS IS REQUIRED. Generate one unified image from edge to edge. Do not paste people or objects into a source plate. Lighting direction, exposure, color science, lens perspective, depth of field, shadows, reflections, atmosphere, skin tones and material response must be globally coherent across the complete frame."
          : "",
        evidenceManifest.bindings.some(
          (binding) => binding.role === "IDENTITY",
        )
          ? "Every REFERENCE_IDENTITY cast member must remain individually recognizable and must use only the identity reference assets assigned to that cast binding. Never merge faces, share one identity across people, or swap identities between narrative roles."
          : "",
        evidenceManifest.bindings.some(
          (binding) => binding.role === "BRAND",
        )
          ? "Use approved brand evidence only. Do not invent, approximate or hallucinate logos, wordmarks, signage or visible brand text. Exact readable brand marks belong in post-production overlays unless provider rendering can be pixel-verified."
          : "Do not invent visible logos, wordmarks or signage when no approved brand evidence is bound.",
        evidenceManifest.bindings.some(
          (binding) => binding.role === "WARDROBE",
        )
          ? "Match approved wardrobe evidence for the declared subjects."
          : "Follow the approved wardrobe brief consistently without claiming unsupported exact wardrobe fidelity.",
      ].filter(Boolean).join("\n\n"),
    };

    return CreativeImagePromptBudgetRuntime.prepare({
      capability,
      input: prepared,
    });
  },
};
