import {
  CreativeMasterStillPilotReferenceDeliveryRecoveryRuntime,
} from "@/lib/creative/production/pilot/CreativeMasterStillPilotReferenceDeliveryRecoveryRuntime";

import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";

import {
  ProductionTaskRuntime,
} from "@/lib/operations/tasks/runtime/ProductionTaskRuntime";

const MAX_REFERENCE_BYTES = 20 * 1024 * 1024;
const SUCCESSFUL = new Set(["COMPLETED", "APPROVED"]);

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
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

function assetKey(asset = {}) {
  if (typeof asset === "string") return asset;
  return asset.id || asset.asset_id || assetUrl(asset) || null;
}

function dedupe(values = []) {
  const seen = new Set();
  const output = [];

  for (const value of values) {
    if (!value) continue;
    const key = assetKey(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }

  return output;
}

function roleTokens(asset = {}) {
  return [
    ...list(asset.reference_roles),
    ...list(asset.reference_role),
    ...list(asset.roles),
    ...list(asset.role),
    ...list(asset.metadata?.reference_roles),
    ...list(asset.metadata?.reference_role),
    ...list(asset.analysis?.reference_roles),
  ]
    .map((value) => String(value).toUpperCase())
    .filter(Boolean);
}

function hasRole(asset, role) {
  const target = String(role || "").toUpperCase();
  return roleTokens(asset).some((token) => token.includes(target));
}

async function refreshAsset(value) {
  const id = typeof value === "string"
    ? value
    : value?.id || value?.asset_id || null;

  if (!id) return value;

  const fresh = await CreativeAssetsRuntime.get(id)
    .catch(() => null);

  if (!fresh) return value;
  if (typeof value === "string") return fresh;

  return {
    ...value,
    ...fresh,
    reference_roles:
      value.reference_roles || fresh.reference_roles || [],
    metadata: {
      ...(fresh.metadata || {}),
      ...(value.metadata || {}),
      qa_reference_delivery_refreshed: true,
      qa_reference_delivery_refreshed_at:
        new Date().toISOString(),
    },
  };
}

function parseDataUrl(value) {
  const match = String(value || "").match(
    /^data:([^;,]+)?(;base64)?,([\s\S]+)$/i,
  );

  if (!match) return null;

  const contentType = String(match[1] || "image/png").toLowerCase();
  const bytes = match[2]
    ? Buffer.from(match[3], "base64")
    : Buffer.from(decodeURIComponent(match[3]));

  return {
    valid:
      contentType.startsWith("image/") &&
      bytes.length > 0 &&
      bytes.length <= MAX_REFERENCE_BYTES,
    reason: contentType.startsWith("image/")
      ? "DATA_IMAGE_SIZE_INVALID"
      : "DATA_ASSET_NOT_IMAGE",
  };
}

async function validateImageReference(asset) {
  const url = assetUrl(asset);
  if (!url) {
    return { valid: false, reason: "REFERENCE_URL_MISSING" };
  }

  const data = parseDataUrl(url);
  if (data) return data;

  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    return { valid: false, reason: "REFERENCE_URL_INVALID" };
  }

  if (parsed.protocol !== "https:") {
    return { valid: false, reason: "REFERENCE_HTTPS_REQUIRED" };
  }

  try {
    const response = await fetch(parsed, {
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return {
        valid: false,
        reason: `REFERENCE_DOWNLOAD_FAILED_${response.status}`,
      };
    }

    const contentType = String(
      response.headers.get("content-type") || "",
    ).toLowerCase();
    if (!contentType.startsWith("image/")) {
      return { valid: false, reason: "REFERENCE_NOT_IMAGE" };
    }

    const declaredLength = Number(
      response.headers.get("content-length") || 0,
    );
    if (declaredLength > MAX_REFERENCE_BYTES) {
      return { valid: false, reason: "REFERENCE_TOO_LARGE" };
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_REFERENCE_BYTES) {
      return { valid: false, reason: "REFERENCE_SIZE_INVALID" };
    }

    return { valid: true, reason: null };
  } catch (error) {
    return {
      valid: false,
      reason: error?.message || "REFERENCE_VALIDATION_FAILED",
    };
  }
}

async function resolveGeneratedMaster(repairMaster = {}) {
  const assetId = repairMaster.output?.asset_id || null;
  const fresh = assetId
    ? await CreativeAssetsRuntime.get(assetId).catch(() => null)
    : null;
  const url = assetUrl(fresh || {}) ||
    repairMaster.output?.image_url ||
    repairMaster.output?.url ||
    repairMaster.output?.asset?.image_url ||
    repairMaster.output?.asset?.url ||
    null;

  if (!url) return null;

  return {
    ...(fresh || {}),
    id: fresh?.id || assetId || repairMaster.id,
    asset_id: fresh?.id || assetId || null,
    image_url: url,
    file_url: url,
    url,
    source_task_id: repairMaster.id,
    reference_role: "GENERATED_MASTER_STILL_UNDER_REVIEW",
  };
}

function requiredRoleCounts(repairMaster = {}) {
  const counts =
    repairMaster.metadata?.repair_preflight_resume_role_counts || {};

  return {
    venue: Number(counts.venue || 0),
    brand: Number(counts.brand || 0),
    identity: Number(counts.identity || 0),
  };
}

function validRoleCounts(references = []) {
  return {
    venue: references.filter((asset) => hasRole(asset, "VENUE")).length,
    brand: references.filter((asset) => (
      hasRole(asset, "BRAND") || hasRole(asset, "LOGO")
    )).length,
    identity: references.filter((asset) => (
      hasRole(asset, "IDENTITY") || hasRole(asset, "STAFF")
    )).length,
  };
}

function roleRequirementsSatisfied(required, valid) {
  return ["venue", "brand", "identity"].every((key) => (
    required[key] < 1 || valid[key] >= 1
  ));
}

async function resumeQaEvidence(input = {}, result = {}) {
  if (input.retry_preflight_blocked !== true) {
    return {
      resumed: false,
      reference_count: 0,
      rejected_reference_count: 0,
      required_role_counts: null,
      valid_role_counts: null,
    };
  }

  if (
    !SUCCESSFUL.has(result.master_still?.status) ||
    result.quality_review?.status !== "FAILED" ||
    result.quality_review?.error !==
      "CREATIVE_QA_VISUAL_REFERENCES_REQUIRED"
  ) {
    return {
      resumed: false,
      reference_count: 0,
      rejected_reference_count: 0,
      required_role_counts: null,
      valid_role_counts: null,
    };
  }

  const scope = {
    organization_id: input.organization_id,
    creative_project_id: input.creative_project_id,
  };
  const [repairMaster, repairQa] = await Promise.all([
    ProductionTaskRuntime.get(result.master_still.id, scope),
    ProductionTaskRuntime.get(result.quality_review.id, scope),
  ]);

  if (
    !repairMaster ||
    !repairQa ||
    repairQa.status !== "FAILED" ||
    repairQa.error !== "CREATIVE_QA_VISUAL_REFERENCES_REQUIRED" ||
    Number(repairQa.cost?.actual || 0) !== 0 ||
    repairQa.output?.provider_submission ||
    Number(repairQa.metadata?.qa_evidence_resume_attempt || 0) >= 1
  ) {
    return {
      resumed: false,
      reference_count: 0,
      rejected_reference_count: 0,
      required_role_counts: null,
      valid_role_counts: null,
    };
  }

  const generated = await resolveGeneratedMaster(repairMaster);
  if (!generated) {
    return {
      resumed: false,
      reference_count: 0,
      rejected_reference_count: 0,
      required_role_counts: null,
      valid_role_counts: null,
    };
  }

  const generatedUrl = String(assetUrl(generated));
  const generatedId = generated.id || generated.asset_id || null;
  const candidates = dedupe([
    ...list(repairMaster.input?.reference_assets),
    ...list(repairMaster.input?.assets),
  ]).filter((asset) => {
    const id = typeof asset === "string"
      ? asset
      : asset.id || asset.asset_id || null;
    const url = typeof asset === "string" ? null : assetUrl(asset);

    return (
      (!generatedId || String(id || "") !== String(generatedId)) &&
      (!url || String(url) !== generatedUrl)
    );
  });
  const refreshed = dedupe(
    await Promise.all(candidates.map(refreshAsset)),
  );
  const validations = await Promise.all(
    refreshed.map(async (asset) => ({
      asset,
      validation: await validateImageReference(asset),
    })),
  );
  const validReferences = validations
    .filter(({ validation }) => validation.valid)
    .map(({ asset }) => asset);
  const rejectedReferences = validations
    .filter(({ validation }) => !validation.valid)
    .map(({ asset, validation }) => ({
      asset_id:
        typeof asset === "string"
          ? asset
          : asset.id || asset.asset_id || null,
      reason: validation.reason,
    }));
  const requiredCounts = requiredRoleCounts(repairMaster);
  const validCounts = validRoleCounts(validReferences);

  if (
    validReferences.length < 1 ||
    !roleRequirementsSatisfied(requiredCounts, validCounts)
  ) {
    return {
      resumed: false,
      reference_count: validReferences.length,
      rejected_reference_count: rejectedReferences.length,
      required_role_counts: requiredCounts,
      valid_role_counts: validCounts,
    };
  }

  await ProductionTaskRuntime.update(
    repairQa.id,
    {
      status: "WAITING",
      error: null,
      input: {
        ...(repairQa.input || {}),
        image: generatedUrl,
        source_image: generatedUrl,
        assets: validReferences,
        reference_assets: validReferences,
        inspected_task_id: repairMaster.id,
      },
      timing: {
        ...(repairQa.timing || {}),
        started_at: null,
        completed_at: null,
      },
      metadata: {
        ...(repairQa.metadata || {}),
        attempt: 0,
        provider_status: "QA_EVIDENCE_RESUME_READY",
        structured_failure: null,
        qa_evidence_resume_attempt: 1,
        qa_evidence_reference_count: validReferences.length,
        qa_evidence_rejected_references: rejectedReferences,
        qa_evidence_required_role_counts: requiredCounts,
        qa_evidence_valid_role_counts: validCounts,
        qa_evidence_resumed_at: new Date().toISOString(),
      },
      worker_id: null,
      lease_expires_at: null,
    },
    scope,
  );

  return {
    resumed: true,
    reference_count: validReferences.length,
    rejected_reference_count: rejectedReferences.length,
    required_role_counts: requiredCounts,
    valid_role_counts: validCounts,
  };
}

export const CreativeMasterStillPilotQaEvidenceRecoveryRuntime = {
  async run(input = {}) {
    const first =
      await CreativeMasterStillPilotReferenceDeliveryRecoveryRuntime.run(
        input,
      );
    const recovery = await resumeQaEvidence(input, first);
    const result = recovery.resumed
      ? await CreativeMasterStillPilotReferenceDeliveryRecoveryRuntime.run(
          input,
        )
      : first;

    return {
      ...result,
      repair_attempt: {
        ...(result.repair_attempt || {}),
        qa_evidence_resumed: recovery.resumed,
        qa_evidence_reference_count:
          recovery.reference_count,
        qa_evidence_rejected_reference_count:
          recovery.rejected_reference_count,
        qa_evidence_required_role_counts:
          recovery.required_role_counts,
        qa_evidence_valid_role_counts:
          recovery.valid_role_counts,
      },
    };
  },
};
