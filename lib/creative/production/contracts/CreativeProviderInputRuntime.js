function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function selectedAssets(assets = {}) {
  if (Array.isArray(assets)) return assets.filter(Boolean);
  return list(assets.selectedAssets);
}

function assetIdentity(asset = {}) {
  return String(
    asset.id ||
    asset.asset_id ||
    asset.image_url ||
    asset.file_url ||
    asset.url ||
    "",
  );
}

function assetUrl(asset = {}) {
  return (
    asset.image_url ||
    asset.file_url ||
    asset.url ||
    asset.thumbnail_url ||
    null
  );
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

function rolePriority(reference = {}) {
  const roles = list(
    reference.roles ||
    reference.reference_roles ||
    reference.role,
  ).map((value) => String(value).toUpperCase());

  if (roles.some((role) => /VENUE|LOCATION|ENTRANCE|ARCHITECTURE/.test(role))) {
    return 10;
  }
  if (roles.some((role) => /IDENTITY|PERSON|STAFF|CAST|CHARACTER/.test(role))) {
    return 20;
  }
  if (roles.some((role) => /WARDROBE|UNIFORM|COSTUME/.test(role))) {
    return 30;
  }
  if (roles.some((role) => /PRODUCT|MENU|FOOD|DRINK/.test(role))) {
    return 40;
  }
  if (roles.some((role) => /LOGO|BRAND|SIGNAGE/.test(role))) {
    return 50;
  }
  if (roles.some((role) => /STYLE|LIGHT|MOOD|COMPOSITION/.test(role))) {
    return 60;
  }
  return 100;
}

function sortAssets(assets, contract = {}) {
  const map = contractReferenceMap(contract);
  const authoritative = String(
    contract.source_plate?.authoritative_asset_id || "",
  );

  return assets
    .map((asset, index) => ({ asset, index }))
    .sort((left, right) => {
      const leftId = assetIdentity(left.asset);
      const rightId = assetIdentity(right.asset);
      const leftAuthoritative = authoritative && leftId === authoritative ? 0 : 1;
      const rightAuthoritative = authoritative && rightId === authoritative ? 0 : 1;

      return (
        leftAuthoritative - rightAuthoritative ||
        rolePriority(map.get(leftId) || left.asset) -
          rolePriority(map.get(rightId) || right.asset) ||
        left.index - right.index
      );
    })
    .map(({ asset }) => asset);
}

function referenceManifest(assets, contract = {}) {
  const map = contractReferenceMap(contract);

  return assets.map((asset, index) => {
    const id = assetIdentity(asset);
    const reference = map.get(id) || {};

    return {
      index: index + 1,
      asset_id: id || null,
      name: asset.name || asset.title || asset.file_name || null,
      roles: list(
        reference.roles ||
        reference.reference_roles ||
        reference.role ||
        asset.reference_roles ||
        asset.reference_role ||
        asset.metadata?.reference_roles,
      ),
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

export const CreativeProviderInputRuntime = {
  prepare({ capability, input = {} } = {}) {
    if (!isCreativeGeneration(capability, input)) return input;

    const contract =
      input.generation_contract ||
      input.specification?.generation_contract ||
      null;
    const assets = sortAssets(
      selectedAssets(input.assets),
      contract || {},
    );
    const sourceImage =
      input.source_image ||
      assetUrl(assets[0] || {});
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
      reference_manifest: referenceManifest(
        assets,
        contract || {},
      ),
      reference_contract: contract,
    };
  },
};
