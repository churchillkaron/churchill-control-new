import {
  CreativeGenerationReferenceResolver,
} from "@/lib/creative/assets/runtime/CreativeGenerationReferenceResolver";

import {
  ExecutionRuntime,
} from "@/lib/creative/execution/runtime/ExecutionRuntime";

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
  if (typeof asset === "string") return asset;
  return String(asset.id || asset.asset_id || "");
}

function dedupeStrings(values = []) {
  return [...new Set(
    values
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean),
  )];
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

function referenceValues(source = {}) {
  const input = object(source.input);
  const requirements = object(input.requirements);
  const specification = object(input.specification);
  const referencePack = object(specification.shot?.reference_pack);

  return [
    ...list(input.reference_assets),
    ...list(input.assets),
    ...list(input.reference_asset_ids),
    ...list(input.asset_ids),
    ...list(requirements.reference_assets),
    ...list(requirements.assets),
    ...list(requirements.reference_asset_ids),
    ...list(requirements.asset_ids),
    ...list(specification.reference_assets),
    ...list(specification.assets),
    ...list(specification.reference_asset_ids),
    ...list(specification.asset_ids),
    ...list(referencePack.assets),
    ...list(referencePack.asset_ids),
    ...list(referencePack.reference_assets),
    ...list(referencePack.reference_asset_ids),
  ];
}

function findExecutionStep(plans = [], task = {}) {
  const executionStepId =
    task.metadata?.execution_step_id ||
    null;
  const nodeId =
    task.metadata?.node_id ||
    null;

  for (const plan of plans || []) {
    const steps = Array.isArray(plan?.steps)
      ? plan.steps
      : [];
    const exact = executionStepId
      ? steps.find((step) => step.id === executionStepId)
      : null;
    if (exact) {
      return {
        plan,
        step: exact,
        resolution: "EXECUTION_STEP_ID",
      };
    }

    const byNode = nodeId
      ? steps.find((step) => step.node_id === nodeId)
      : null;
    if (byNode) {
      return {
        plan,
        step: byNode,
        resolution: "PRODUCTION_NODE_ID",
      };
    }
  }

  return {
    plan: null,
    step: null,
    resolution: null,
  };
}

function assetRoleTokens(asset = {}) {
  return dedupeStrings([
    ...list(asset.reference_roles),
    ...list(asset.reference_role),
    ...list(asset.roles),
    ...list(asset.role),
    ...list(asset.metadata?.reference_roles),
    ...list(asset.metadata?.reference_role),
    ...list(asset.metadata?.roles),
    ...list(asset.metadata?.role),
    ...list(asset.analysis?.reference_roles),
    ...list(asset.analysis?.reference_role),
    ...list(asset.analysis?.roles),
    ...list(asset.analysis?.role),
    asset.ai_suggested_type,
    asset.asset_type,
    asset.type,
  ]).map((value) => value.toUpperCase());
}

function roleMatches(values = [], patterns = []) {
  return values.some((value) => (
    patterns.some((pattern) => pattern.test(value))
  ));
}

function isStaffIdentityAsset(asset = {}) {
  return roleMatches(assetRoleTokens(asset), [
    /STAFF/,
    /EMPLOYEE/,
    /TEAM/,
    /HOST/,
    /WAITER/,
    /SERVER/,
    /BARTENDER/,
    /CHEF/,
    /MANAGER/,
  ]);
}

function actorSource(specification = {}) {
  return list(
    specification.shot?.actors ||
    specification.scene?.actors,
  );
}

function actorRoleText(actor = {}) {
  const source = typeof actor === "string"
    ? actor
    : [
        actor.role,
        actor.character,
        actor.type,
        actor.name,
        actor.description,
        actor.brief,
        actor.prompt,
        actor.action,
      ].filter(Boolean).join(" ");

  return String(source || "").toUpperCase();
}

function actorRequiresStaffIdentity(actor = {}) {
  return roleMatches([actorRoleText(actor)], [
    /STAFF/,
    /EMPLOYEE/,
    /TEAM MEMBER/,
    /HOST/,
    /WAITER/,
    /WAITRESS/,
    /SERVER/,
    /BARTENDER/,
    /CHEF/,
    /MANAGER/,
  ]);
}

function existingActorReferenceIds(actor = {}) {
  if (typeof actor === "string") return [];

  return dedupeStrings([
    ...list(actor.identity_reference_asset_ids),
    ...list(actor.reference_asset_ids),
    actor.identity_reference_asset_id,
    actor.reference_asset_id,
  ]);
}

function hydrateActors(specification = {}, identityAssets = []) {
  const actors = actorSource(specification);

  if (!actors.length) {
    return {
      mode: "NO_PEOPLE",
      actors: [],
      selected_identity_assets: [],
    };
  }

  const identityById = new Map(
    identityAssets
      .map((asset) => [assetId(asset), asset])
      .filter(([id]) => Boolean(id)),
  );
  const staffAssets = identityAssets.filter(isStaffIdentityAsset);
  const usedIdentityAssets = [];
  let referenceCount = 0;
  let generatedCount = 0;

  const hydratedActors = actors.map((actor, index) => {
    const normalized = typeof actor === "string"
      ? { role: actor }
      : { ...actor };
    const existingIds = existingActorReferenceIds(normalized)
      .filter((id) => identityById.has(id));

    if (existingIds.length) {
      referenceCount += 1;
      existingIds.forEach((id) => {
        usedIdentityAssets.push(identityById.get(id));
      });

      return {
        ...normalized,
        identity_mode: "REFERENCE_IDENTITY",
        identity_reference_asset_ids: existingIds,
      };
    }

    if (
      actorRequiresStaffIdentity(normalized) &&
      staffAssets.length
    ) {
      const selected = staffAssets[index % staffAssets.length];
      usedIdentityAssets.push(selected);
      referenceCount += 1;

      return {
        ...normalized,
        identity_mode: "REFERENCE_IDENTITY",
        identity_reference_asset_ids: [assetId(selected)],
      };
    }

    generatedCount += 1;

    return {
      ...normalized,
      identity_mode: "GENERATED_CAST",
      identity_reference_asset_ids: [],
    };
  });

  return {
    mode:
      referenceCount && generatedCount
        ? "MIXED_CAST"
        : referenceCount
          ? "REFERENCE_IDENTITY"
          : "GENERATED_CAST",
    actors: hydratedActors,
    selected_identity_assets:
      dedupeAssets(usedIdentityAssets),
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
    const [task, plans] = await Promise.all([
      ProductionTaskRuntime.get(
        master_task_id,
        scope,
      ),
      ExecutionRuntime.list(scope),
    ]);

    if (!task) {
      throw new Error("MASTER_STILL_PILOT_TASK_REQUIRED");
    }

    if (task.type !== "GENERATE_IMAGE") {
      throw new Error("MASTER_STILL_TASK_MUST_GENERATE_IMAGE");
    }

    const taskInput = object(task.input);
    const execution = findExecutionStep(plans, task);
    const taskReferences = dedupeAssets(
      referenceValues({ input: taskInput }),
    );
    const planReferences = dedupeAssets(
      referenceValues(execution.step || {}),
    );
    const preferredAssets = dedupeAssets([
      ...taskReferences,
      ...planReferences,
    ]);
    const references =
      await CreativeGenerationReferenceResolver.resolve({
        organization_id,
        creative_project_id,
        preferred_assets: preferredAssets,
        include_unapproved_fallback: true,
      });

    const venue = references.venue_assets[0] || null;
    const brand = references.brand_assets;
    const specification = object(
      execution.step?.input?.specification ||
      taskInput.specification,
    );
    const shot = object(specification.shot);
    const scene = object(specification.scene);
    const casting = hydrateActors(
      specification,
      references.identity_assets,
    );
    const selectedIdentity = casting.selected_identity_assets;
    const selected = dedupeAssets([
      ...(venue ? [venue] : []),
      ...brand,
      ...selectedIdentity,
    ]);

    if (!venue) {
      const error = new Error("VENUE_REFERENCE_REQUIRED");
      error.code = error.message;
      error.details = {
        task_reference_count: taskReferences.length,
        plan_reference_count: planReferences.length,
        execution_step_id:
          task.metadata?.execution_step_id || null,
        execution_step_resolution:
          execution.resolution,
        execution_plan_id:
          execution.plan?.id || null,
        resolution: references.resolution || null,
        counts: references.counts || null,
      };
      throw error;
    }

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
          ...taskInput,
          ...object(execution.step?.input),
          assets: selected,
          reference_assets: selected,
          casting: {
            mode: casting.mode,
            actors: casting.actors,
          },
          composition_plan: {
            ...object(taskInput.composition_plan),
            ...object(execution.step?.input?.composition_plan),
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
              casting: {
                mode: casting.mode,
                actors: casting.actors,
              },
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
            execution_plan_id:
              execution.plan?.id || null,
            execution_step_resolution:
              execution.resolution,
            task_reference_count:
              taskReferences.length,
            plan_reference_count:
              planReferences.length,
            venue_asset_ids:
              references.venue_assets.map(assetId).filter(Boolean),
            brand_asset_ids:
              references.brand_assets.map(assetId).filter(Boolean),
            available_identity_asset_ids:
              references.identity_assets.map(assetId).filter(Boolean),
            selected_identity_asset_ids:
              selectedIdentity.map(assetId).filter(Boolean),
            selected_asset_ids:
              selected.map(assetId).filter(Boolean),
            casting_mode: casting.mode,
            venue_resolution:
              references.resolution?.venue || null,
            preferred_reference_count:
              preferredAssets.length,
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
        execution_plan_id:
          execution.plan?.id || null,
        execution_step_resolution:
          execution.resolution,
        task_reference_count:
          taskReferences.length,
        plan_reference_count:
          planReferences.length,
        venue_asset_ids:
          references.venue_assets.map(assetId).filter(Boolean),
        brand_asset_ids:
          references.brand_assets.map(assetId).filter(Boolean),
        available_identity_asset_ids:
          references.identity_assets.map(assetId).filter(Boolean),
        selected_identity_asset_ids:
          selectedIdentity.map(assetId).filter(Boolean),
        selected_asset_ids:
          selected.map(assetId).filter(Boolean),
        casting_mode: casting.mode,
        resolution: references.resolution || null,
        counts: references.counts,
      },
    };
  },
};
