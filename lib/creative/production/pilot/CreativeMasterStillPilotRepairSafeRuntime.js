import {
  CreativeMasterStillPilotRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotRuntime";

import {
  CreativeMasterStillPilotRepairRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotRepairRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  deterministicUuid,
} from "@/lib/operations/tasks/identity/ProductionTaskIdentity";

function list(value) {
  if (!value) return [];
  return Array.isArray(value)
    ? value.filter(Boolean)
    : [value];
}

function uniqueStrings(values = []) {
  return [...new Set(
    values
      .filter(Boolean)
      .map((value) => String(value).trim())
      .filter(Boolean),
  )];
}

function referenceKey(value = {}) {
  if (typeof value === "string") return value;

  return (
    value.id ||
    value.asset_id ||
    value.image_url ||
    value.file_url ||
    value.url ||
    null
  );
}

function dedupeReferences(values = []) {
  const seen = new Set();
  const result = [];

  for (const value of values) {
    if (!value) continue;
    const key = referenceKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }

  return result;
}

function semanticTokens(asset = {}) {
  return uniqueStrings([
    ...list(asset.reference_roles),
    ...list(asset.reference_role),
    ...list(asset.roles),
    ...list(asset.role),
    ...list(asset.tags),
    ...list(asset.labels),
    ...list(asset.metadata?.reference_roles),
    ...list(asset.metadata?.reference_role),
    ...list(asset.metadata?.roles),
    ...list(asset.metadata?.role),
    ...list(asset.metadata?.tags),
    ...list(asset.metadata?.labels),
    ...list(asset.analysis?.reference_roles),
    ...list(asset.analysis?.reference_role),
    ...list(asset.analysis?.roles),
    ...list(asset.analysis?.role),
    ...list(asset.analysis?.tags),
    ...list(asset.analysis?.labels),
    asset.ai_suggested_type,
    asset.asset_type,
    asset.type,
    asset.name,
    asset.title,
    asset.file_name,
    asset.filename,
    asset.description,
    asset.caption,
    asset.metadata?.name,
    asset.metadata?.title,
    asset.metadata?.file_name,
    asset.metadata?.description,
    asset.metadata?.caption,
    asset.analysis?.summary,
    asset.analysis?.description,
    asset.analysis?.classification,
    asset.analysis?.subject,
  ]).map((value) => value.toUpperCase());
}

function semanticMatch(asset = {}, patterns = []) {
  return semanticTokens(asset).some((token) => (
    patterns.some((pattern) => pattern.test(token))
  ));
}

function inferSemanticRoles(asset = {}) {
  const roles = uniqueStrings([
    ...list(asset.reference_roles),
    ...list(asset.reference_role),
    ...list(asset.roles),
    ...list(asset.role),
    ...list(asset.metadata?.reference_roles),
    ...list(asset.metadata?.reference_role),
    ...list(asset.metadata?.roles),
    ...list(asset.metadata?.role),
  ]);

  if (semanticMatch(asset, [
    /BRAND/,
    /LOGO/,
    /WORDMARK/,
    /SIGNAGE/,
    /TYPOGRAPHY/,
    /EMBLEM/,
  ])) {
    roles.push("BRAND_REFERENCE", "LOGO_REFERENCE");
  }

  if (semanticMatch(asset, [
    /VENUE/,
    /LOCATION/,
    /ENTRANCE/,
    /EXTERIOR/,
    /INTERIOR/,
    /ARCHITECTURE/,
    /ENVIRONMENT/,
    /SCENE[ _-]?PLATE/,
    /BUILDING/,
    /FACADE/,
    /DOORWAY/,
    /STORE ?FRONT/,
  ])) {
    roles.push("VENUE_REFERENCE", "SOURCE_PLATE");
  }

  if (semanticMatch(asset, [
    /IDENTITY/,
    /PERSON/,
    /PORTRAIT/,
    /STAFF/,
    /EMPLOYEE/,
    /TEAM/,
    /HOST/,
    /WAITER/,
    /WAITRESS/,
    /SERVER/,
    /BARTENDER/,
    /CHEF/,
    /MANAGER/,
    /TALENT/,
    /CAST/,
  ])) {
    roles.push("IDENTITY_REFERENCE", "STAFF_REFERENCE");
  }

  return uniqueStrings(roles);
}

async function hydrateReference(value) {
  if (!value) return null;
  if (typeof value !== "string") return value;

  return CreativeAssetsRuntime.get(value)
    .catch(() => value);
}

function sourcePlateId(task = {}) {
  return String(
    task.input?.composition_plan?.source_plate_asset_id ||
    task.input?.specification?.composition_plan?.source_plate_asset_id ||
    task.input?.specification?.shot?.composition_plan?.source_plate_asset_id ||
    task.input?.specification?.shot?.reference_pack?.source_plate_asset_id ||
    "",
  );
}

async function enrichReferences(task = {}, values = []) {
  const hydrated = await Promise.all(
    values.map(hydrateReference),
  );
  const brandIds = new Set(uniqueStrings([
    ...list(
      task.metadata?.organization_reference_supplement
        ?.brand_asset_ids,
    ),
    ...list(task.metadata?.brand_asset_ids),
  ]));
  const identityIds = new Set(uniqueStrings([
    ...list(
      task.metadata?.organization_reference_supplement
        ?.identity_asset_ids,
    ),
    ...list(task.metadata?.identity_asset_ids),
  ]));
  const plateId = sourcePlateId(task);

  const enriched = hydrated.map((reference) => {
    if (!reference || typeof reference === "string") {
      return reference;
    }

    const key = String(referenceKey(reference) || "");
    const roles = inferSemanticRoles(reference);

    if (brandIds.has(key)) {
      roles.push("BRAND_REFERENCE", "LOGO_REFERENCE");
    }
    if (identityIds.has(key)) {
      roles.push("IDENTITY_REFERENCE", "STAFF_REFERENCE");
    }
    if (plateId && key === plateId) {
      roles.push("VENUE_REFERENCE", "SOURCE_PLATE");
    }

    return {
      ...reference,
      reference_roles: uniqueStrings(roles),
      metadata: {
        ...(reference.metadata || {}),
        reference_roles: uniqueStrings([
          ...list(reference.metadata?.reference_roles),
          ...roles,
        ]),
        evidence_role_hydrated: true,
      },
    };
  });

  const brandCount = enriched.filter((reference) => (
    reference &&
    typeof reference === "object" &&
    list(reference.reference_roles).some((role) => (
      /BRAND|LOGO/.test(String(role).toUpperCase())
    ))
  )).length;
  const venueCount = enriched.filter((reference) => (
    reference &&
    typeof reference === "object" &&
    list(reference.reference_roles).some((role) => (
      /VENUE|SOURCE_PLATE/.test(String(role).toUpperCase())
    ))
  )).length;
  const identityCount = enriched.filter((reference) => (
    reference &&
    typeof reference === "object" &&
    list(reference.reference_roles).some((role) => (
      /IDENTITY|STAFF/.test(String(role).toUpperCase())
    ))
  )).length;

  return {
    references: dedupeReferences(enriched),
    counts: {
      brand: brandCount,
      venue: venueCount,
      identity: identityCount,
    },
  };
}

function summarize(task = null) {
  if (!task) return null;

  return {
    id: task.id || null,
    status: task.status || null,
    error: task.error || null,
    error_code:
      task.metadata?.structured_failure?.code ||
      null,
    error_details:
      task.metadata?.structured_failure?.details ||
      null,
    asset_url:
      task.output?.image_url ||
      task.output?.url ||
      task.output?.asset?.image_url ||
      task.output?.asset?.url ||
      null,
    asset_id: task.output?.asset_id || null,
    provider_status: task.metadata?.provider_status || null,
    attempt: Number(task.metadata?.attempt || 0),
    cost: {
      currency: task.cost?.currency || null,
      actual: Number(task.cost?.actual || 0),
    },
  };
}

async function repairContext(input = {}) {
  const initial = await CreativeMasterStillPilotRuntime.run(input);
  const originalMasterId = initial.master_still?.id || null;
  const originalQaId = initial.quality_review?.id || null;

  if (!originalMasterId || !originalQaId) {
    return {
      initial,
      scope: null,
      repairMasterId: null,
      repairQaId: null,
      repairMaster: null,
      repairQa: null,
    };
  }

  const repairMasterId = deterministicUuid(
    `AVANTIQO_MASTER_STILL_REPAIR_V1:${originalMasterId}`,
  );
  const repairQaId = deterministicUuid(
    `AVANTIQO_MASTER_STILL_REPAIR_QA_V1:${originalQaId}`,
  );
  const scope = {
    organization_id: input.organization_id,
    creative_project_id: input.creative_project_id,
  };
  const [repairMaster, repairQa] = await Promise.all([
    ProductionTaskRuntime.get(repairMasterId, scope),
    ProductionTaskRuntime.get(repairQaId, scope),
  ]);

  return {
    initial,
    scope,
    repairMasterId,
    repairQaId,
    repairMaster,
    repairQa,
  };
}

function isZeroCostPreflightFailure(task = null) {
  if (!task || task.status !== "FAILED") return false;

  const code = String(
    task.metadata?.structured_failure?.code ||
    task.error ||
    "",
  ).toUpperCase();

  return Boolean(
    code.includes("PREFLIGHT") ||
    code === "REFERENCE_EVIDENCE_REQUIRED" ||
    code === "CASTING_CONTRACT_INCOMPLETE" ||
    code === "COMPOSITION_PLAN_INCOMPLETE" ||
    code === "EXACT_BRAND_REFERENCE_REQUIRED"
  ) &&
    Number(task.cost?.actual || 0) === 0 &&
    !task.output?.provider_submission &&
    Number(
      task.metadata?.repair_preflight_resume_attempt ||
      0,
    ) < 1;
}

async function resumeExistingPreflightFailure(context, input = {}) {
  const task = context.repairMaster;

  if (
    input.retry_preflight_blocked !== true ||
    !context.scope ||
    !isZeroCostPreflightFailure(task)
  ) {
    return context;
  }

  const rawReferences = dedupeReferences([
    ...list(task.input?.reference_assets),
    ...list(task.input?.assets),
  ]);

  if (!rawReferences.length) {
    return context;
  }

  const enriched = await enrichReferences(
    task,
    rawReferences,
  );

  if (!enriched.references.length) {
    return context;
  }

  const updated = await ProductionTaskRuntime.update(
    task.id,
    {
      status: "WAITING",
      error: null,
      input: {
        ...(task.input || {}),
        reference_assets: enriched.references,
        assets: enriched.references,
      },
      timing: {
        ...(task.timing || {}),
        started_at: null,
        completed_at: null,
      },
      metadata: {
        ...(task.metadata || {}),
        attempt: 0,
        provider_status: "REPAIR_PREFLIGHT_RESUME_READY",
        structured_failure: null,
        repair_preflight_resume_attempt: 1,
        repair_preflight_resume_reason:
          task.metadata?.structured_failure?.code ||
          task.error ||
          "CREATIVE_GENERATION_PREFLIGHT_BLOCKED",
        repair_preflight_resume_reference_count:
          enriched.references.length,
        repair_preflight_resume_role_counts:
          enriched.counts,
        repair_preflight_resumed_at:
          new Date().toISOString(),
      },
      worker_id: null,
      lease_expires_at: null,
    },
    context.scope,
  );

  return {
    ...context,
    repairMaster: updated,
    preflight_resumed: true,
    preflight_resume_reference_count:
      enriched.references.length,
    preflight_resume_role_counts:
      enriched.counts,
  };
}

function recoveredResult(context, error) {
  const {
    initial,
    repairMasterId,
    repairQaId,
    repairMaster,
    repairQa,
  } = context;
  const master = summarize(repairMaster);
  const qa = summarize(repairQa);
  const masterComplete = ["COMPLETED", "APPROVED"].includes(
    master?.status,
  );

  return {
    ...initial,
    success: false,
    production_scope: "ONE_MASTER_STILL_REPAIR_AND_ITS_QA",
    master_still: master || {
      id: repairMasterId,
      status: "NOT_MATERIALIZED",
    },
    quality_review: qa || {
      id: repairQaId,
      status: masterComplete
        ? "READY_TO_MATERIALIZE"
        : "WAITING_FOR_REPAIRED_MASTER",
      passed: false,
      overall_score: 0,
      minimum_score: Number(
        initial.quality_review?.minimum_score || 90,
      ),
    },
    repair_attempt: {
      attempted: Boolean(repairMaster),
      attempt: 1,
      automatic_repairs_remaining: 0,
      response_recovered_from_null_qa_state: true,
      preflight_resumed: context.preflight_resumed === true,
      preflight_resume_reference_count:
        Number(context.preflight_resume_reference_count || 0),
      preflight_resume_role_counts:
        context.preflight_resume_role_counts || null,
      technical_error:
        error?.message || String(error || ""),
    },
    video_tasks_materialized: 0,
    video_tasks_dispatched: 0,
    next_gate:
      repairMaster?.status === "FAILED"
        ? "MASTER_STILL_REPAIR_TECHNICAL_FAILURE"
        : masterComplete
          ? "MASTER_STILL_REPAIR_QA_PENDING"
          : "MASTER_STILL_REPAIR_PROCESSING",
  };
}

export const CreativeMasterStillPilotRepairSafeRuntime = {
  async run(input = {}) {
    let context = null;

    if (input.retry_preflight_blocked === true) {
      context = await repairContext(input);
      context = await resumeExistingPreflightFailure(
        context,
        input,
      );
    }

    try {
      return await CreativeMasterStillPilotRepairRuntime.run(input);
    } catch (error) {
      if (!/Cannot read properties of null \(reading 'output'\)/.test(
        String(error?.message || error || ""),
      )) {
        throw error;
      }

      context = context || await repairContext(input);

      if (!context.repairMasterId || !context.repairQaId) {
        throw error;
      }

      const [repairMaster, repairQa] = await Promise.all([
        ProductionTaskRuntime.get(
          context.repairMasterId,
          context.scope,
        ),
        ProductionTaskRuntime.get(
          context.repairQaId,
          context.scope,
        ),
      ]);

      return recoveredResult({
        ...context,
        repairMaster,
        repairQa,
      }, error);
    }
  },
};
