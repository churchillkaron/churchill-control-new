import {
  buildCreativeEvidenceRoleManifest,
  classifyCreativeEvidenceRoles,
  creativeEvidenceAssetId,
  creativeEvidenceAssetUrl,
} from "@/lib/creative/production/contracts/CreativeEvidenceRoleContract";

const ROLE_PRIORITY = new Map([
  ["LOCATION", 10],
  ["IDENTITY", 20],
  ["WARDROBE", 30],
  ["PRODUCT", 40],
  ["BRAND", 50],
  ["TEXT", 60],
  ["STYLE", 70],
]);

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
    const id = String(
      reference.asset_id || reference.id || "",
    );
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

function sortAssets(
  assets,
  contract = {},
  evidenceManifest = {},
) {
  const map = contractReferenceMap(contract);
  const bindingMap = evidenceBindingMap(evidenceManifest);
  const authoritative = String(
    evidenceManifest.authoritative_source_asset_id ||
    contract.source_plate?.authoritative_asset_id ||
    "",
  );
  const selectedOrder = list(
    evidenceManifest.all_selected_asset_ids,
  );

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
        rolePriority(
          map.get(leftId) || left.asset,
          bindingMap,
        ) - rolePriority(
          map.get(rightId) || right.asset,
          bindingMap,
        ) ||
        left.index - right.index
      );
    })
    .map(({ asset }) => asset);
}

function referenceManifest(
  assets,
  contract = {},
  evidenceManifest = {},
) {
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

  const error = new Error(
    "CREATIVE_REQUIRED_EVIDENCE_ROLE_INCOMPLETE",
  );
  error.code =
    manifest.blockers?.[0] ||
    "CREATIVE_REQUIRED_EVIDENCE_ROLE_INCOMPLETE";
  error.details = manifest;
  throw error;
}

export const CreativeProviderInputRuntime = {
  prepare({ capability, input = {} } = {}) {
    if (!isCreativeGeneration(capability, input)) return input;

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
      authorized_asset_ids: authorizedAssetIds(
        input,
        contract || {},
      ),
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
      input.mode ||
      "reference_grounded_full_scene_synthesis",
    ).toUpperCase();

    if (
      capability === "ai.video.image_to_video" &&
      !sourceImage
    ) {
      throw new Error(
        "CREATIVE_APPROVED_MASTER_STILL_REQUIRED_FOR_VIDEO",
      );
    }

    return {
      ...input,
      mode:
        generationMode === "FULL_SCENE_REFERENCE_SYNTHESIS"
          ? "reference_grounded_full_scene_synthesis"
          : input.mode,
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
        evidenceManifest.authoritative_source_asset_id
          ? `The first reference is the authoritative source for the declared location/environment. Preserve its verified architecture, layout, entrance geometry and spatial relationships. Do not replace it with a generic setting.`
          : "",
        evidenceManifest.bindings.some(
          (binding) => binding.role === "BRAND",
        )
          ? "Use approved brand evidence only. Do not invent, approximate or hallucinate logos, wordmarks, signage or visible brand text."
          : "Do not invent visible logos, wordmarks or signage when no approved brand evidence is bound.",
        evidenceManifest.bindings.some(
          (binding) => binding.role === "WARDROBE",
        )
          ? "Match approved wardrobe evidence for the declared subjects."
          : "Do not claim exact wardrobe fidelity when no approved wardrobe evidence is bound.",
      ].filter(Boolean).join("\n\n"),
    };
  },
};