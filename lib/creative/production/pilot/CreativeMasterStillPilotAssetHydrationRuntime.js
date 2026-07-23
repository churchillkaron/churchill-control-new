import {
  CreativeGenerationReferenceResolver,
} from "@/lib/creative/assets/runtime/CreativeGenerationReferenceResolver";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

function object(value) {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? value
    : {};
}

function list(value) {
  if (!value) return [];
  return Array.isArray(value)
    ? value.filter(Boolean)
    : [value];
}

function assetId(asset = {}) {
  return String(asset.id || asset.asset_id || "");
}

function dedupeAssets(values = []) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    if (!value) continue;
    const key =
      assetId(value) ||
      value.image_url ||
      value.file_url ||
      value.url;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

function actorSource(specification = {}) {
  return list(
    specification.shot?.actors ||
    specification.scene?.actors,
  );
}

function hydrateActors(specification = {}, identityAssets = []) {
  const actors = actorSource(specification);
  const identityIds = identityAssets
    .map(assetId)
    .filter(Boolean);

  if (!actors.length || !identityIds.length) {
    return {
      mode: actors.length ? "GENERATED_CAST" : "NO_PEOPLE",
      actors,
    };
  }

  return {
    mode: "REFERENCE_IDENTITY",
    actors: actors.map((actor, index) => ({
      ...(typeof actor === "string"
        ? { role: actor }
        : actor),
      identity_mode: "REFERENCE_IDENTITY",
      identity_reference_asset_ids: [
        identityIds[index % identityIds.length],
      ],
    })),
  };
}

export const CreativeMasterStillPilotAssetHydrationRuntime = {
  async hydrate({
    organization_id,
    creative_project_id,
    master_task_id,
  } = {}) {
    if (!organization_id) {
      throw new Error("organization_id required");
    }

    if (!creative_project_id) {
      throw new Error("creative_project_id required");
    }

    if (!master_task_id) {
      throw new Error("master_task_id required");
    }

    const scope = {
      organization_id,
      creative_project_id,
    };
    const [task, references] = await Promise.all([
      ProductionTaskRuntime.get(master_task_id, scope),
      CreativeGenerationReferenceResolver.resolve({
        organization_id,
        creative_project_id,
        include_unapproved_fallback: true,
      }),
    ]);

    if (!task) {
      throw new Error("MASTER_STILL_PILOT_TASK_REQUIRED");
    }

    if (task.type !== "GENERATE_IMAGE") {
      throw new Error("MASTER_STILL_TASK_MUST_GENERATE_IMAGE");
    }

    const venue = references.venue_assets[0] || null;
    const brand = references.brand_assets;
    const identity = references.identity_assets;
    const selected = dedupeAssets([
      ...(venue ? [venue] : []),
      ...brand,
      ...identity,
    ]);

    if (!venue) {
      throw new Error("APPROVED_VENUE_REFERENCE_REQUIRED");
    }

    const input = object(task.input);
    const specification = object(input.specification);
    const shot = object(specification.shot);
    const scene = object(specification.scene);
    const casting = hydrateActors(specification, identity);
    const preserve = [
      ...list(shot.reference_pack?.preserve),
      "authoritative venue geometry and spatial layout",
      "architectural element placement",
      "physical signage placement",
    ];
    const neverChange = [
      ...list(shot.reference_pack?.never_change),
      "venue identity",
      "brand spelling and approved logo geometry",
      "authoritative sign location",
    ];
    const mayChange = [
      ...list(shot.reference_pack?.may_change),
      "photographic quality",
      "cinematic lighting",
      "image cleanliness",
      "ambient atmosphere",
      "natural performance and crowd activity",
    ];

    const updated = await ProductionTaskRuntime.update(
      task.id,
      {
        input: {
          ...input,
          assets: selected,
          reference_assets: selected,
          casting,
          composition_plan: {
            ...object(input.composition_plan),
            mode: "FULL_SCENE_REFERENCE_SYNTHESIS",
            source_plate_asset_id: assetId(venue),
            exact_brand_overlay_required: brand.length > 0,
            creative_interpretation_open: true,
          },
          specification: {
            ...specification,
            reference_required: true,
            brand_exact: brand.length > 0,
            generated_text_allowed: false,
            scene,
            shot: {
              ...shot,
              brand_exact: brand.length > 0,
              generated_text_allowed: false,
              casting,
              reference_pack: {
                ...object(shot.reference_pack),
                required: true,
                exact_brand_required: brand.length > 0,
                preserve: [...new Set(preserve)],
                never_change: [...new Set(neverChange)],
                may_change: [...new Set(mayChange)],
              },
            },
          },
        },
        metadata: {
          ...object(task.metadata),
          dynamic_reference_hydration: {
            resolved_at: new Date().toISOString(),
            project_id: creative_project_id,
            mission_id: references.mission_id,
            venue_asset_ids:
              references.venue_assets.map(assetId).filter(Boolean),
            brand_asset_ids:
              references.brand_assets.map(assetId).filter(Boolean),
            identity_asset_ids:
              references.identity_assets.map(assetId).filter(Boolean),
            selected_asset_ids:
              selected.map(assetId).filter(Boolean),
            approved_assets_available:
              references.approved_assets_available,
          },
        },
      },
      scope,
    );

    return {
      task: updated,
      references: {
        mission_id: references.mission_id,
        venue_asset_ids:
          references.venue_assets.map(assetId).filter(Boolean),
        brand_asset_ids:
          references.brand_assets.map(assetId).filter(Boolean),
        identity_asset_ids:
          references.identity_assets.map(assetId).filter(Boolean),
        selected_asset_ids:
          selected.map(assetId).filter(Boolean),
        counts: references.counts,
      },
    };
  },
};
