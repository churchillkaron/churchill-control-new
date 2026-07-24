export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 600;

import { NextResponse } from "next/server";

import {
  CreativeDirectorRuntime,
} from "@/lib/creative/director/runtime/CreativeDirectorRuntime";
import {
  CreativeUniversalProductionRuntime,
} from "@/lib/creative/production/runtime/CreativeUniversalProductionRuntime";
import {
  CreativeProductionHandoffRuntime,
} from "@/lib/creative/production/runtime/CreativeProductionHandoffRuntime";
import {
  CreativeProjectRuntime,
} from "@/lib/creative/projects/runtime/CreativeProjectRuntime";
import {
  CreativeAssetGraphRuntime,
} from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime";
import {
  CreativeAssetsRuntime,
} from "@/lib/creative/assets/runtime/CreativeAssetsRuntime";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

function list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

function normalizeReleaseMode(value) {
  const mode = String(value || "MANUAL").trim().toUpperCase();
  return ["AUTOMATIC", "AUTO_AFTER_AI_QA", "AUTO"].includes(mode)
    ? "AUTOMATIC"
    : "MANUAL";
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

function isImageEvidence(asset = {}) {
  const type = String(
    asset.type ||
    asset.asset_type ||
    asset.metadata?.asset_type ||
    "",
  ).toUpperCase();
  const mime = String(
    asset.mime_type ||
    asset.technical?.mime_type ||
    asset.metadata?.mime_type ||
    "",
  ).toLowerCase();

  if (asset.isVideo === true) return false;
  if (mime.startsWith("video/") || mime.startsWith("audio/")) return false;
  if (["VIDEO", "AUDIO", "VOICE", "MUSIC", "SFX"].includes(type)) {
    return false;
  }

  return Boolean(assetUrl(asset));
}

function normalizeDirectorEvidence(asset = {}) {
  const url = assetUrl(asset);
  const intelligence = asset.intelligence || {};
  const metadata = asset.metadata || {};

  return {
    ...asset,
    id: asset.id || asset.asset_id || asset.creative_asset_id || null,
    asset_id: asset.asset_id || asset.id || asset.creative_asset_id || null,
    image_url: asset.image_url || url,
    file_url: asset.file_url || url,
    thumbnail_url: asset.thumbnail_url || url,
    url,
    tags: list(asset.tags).length
      ? list(asset.tags)
      : list(intelligence.tags),
    analysis: {
      ...(intelligence || {}),
      ...(asset.analysis || {}),
    },
    reference_roles: [
      ...new Set([
        ...list(asset.reference_roles),
        ...list(asset.reference_role),
        ...list(metadata.reference_roles),
        ...list(metadata.reference_role),
        ...list(metadata.evidence_roles),
        ...list(metadata.evidence_role),
      ].filter(Boolean).map(String)),
    ],
    approved_reference:
      asset.approved_reference === true ||
      asset.review?.approved === true ||
      String(asset.status || "").toUpperCase() === "APPROVED",
    metadata: {
      ...metadata,
      project_evidence_hydrated: true,
      project_evidence_source:
        metadata.reference_source ||
        metadata.evidence_role ||
        "CREATIVE_ASSET_NODE",
    },
  };
}

async function resolveProjectEvidence({
  organization_id,
  creative_project_id,
  supplied_assets = [],
}) {
  const supplied = list(supplied_assets)
    .map(normalizeDirectorEvidence)
    .filter(isImageEvidence);

  if (supplied.length) return supplied;

  const nodes = await CreativeAssetGraphRuntime.list({
    organization_id,
    creative_project_id,
  });
  const hydrated = await Promise.all(
    list(nodes).map(async (node) => {
      try {
        return await CreativeAssetsRuntime.get(node.id);
      } catch {
        return node;
      }
    }),
  );

  const evidence = hydrated
    .filter(Boolean)
    .map(normalizeDirectorEvidence)
    .filter(isImageEvidence);
  const unique = new Map();

  for (const asset of evidence) {
    const key = String(asset.id || asset.asset_id || asset.url || "");
    if (!key || unique.has(key)) continue;
    unique.set(key, asset);
  }

  return [...unique.values()];
}

function summarizeUnsuccessfulResult({
  result,
  organization_id,
  creative_project_id,
  universal,
  release_mode,
  evidence_assets,
}) {
  const production = result?.production || null;
  const failedTasks = Array.isArray(production?.tasks)
    ? production.tasks.filter((task) =>
        ["FAILED", "SKIPPED", "REJECTED", "BLOCKED"].includes(
          String(task?.status || "").toUpperCase(),
        ),
      )
    : [];

  return {
    event: "CREATIVE_DIRECTOR_EXECUTION_UNSUCCESSFUL",
    organization_id,
    creative_project_id,
    universal,
    release_mode,
    evidence_asset_count: evidence_assets.length,
    evidence_asset_ids: evidence_assets
      .map((asset) => asset.id || asset.asset_id)
      .filter(Boolean),
    result_success: result?.success ?? null,
    reason: result?.reason || result?.error || null,
    code: result?.code || null,
    details: result?.details || null,
    production: production
      ? {
          complete: production.complete ?? null,
          failed: production.failed ?? null,
          blocked: production.blocked ?? null,
          tasks_materialized: production.tasks_materialized ?? null,
          lifecycle: production.lifecycle || null,
          queue: production.queue || null,
          failures: production.failures || null,
          blocked_tasks: production.blocked_tasks || null,
          failed_tasks: failedTasks,
        }
      : null,
    pipeline: result?.pipeline
      ? {
          creative_mission_id:
            result.pipeline.creative_mission_id || null,
          creative_project_id:
            result.pipeline.creative_project_id || creative_project_id,
          storyboard_contract:
            result.pipeline.storyboard_contract || null,
          production_graph_id:
            result.pipeline.graph?.id ||
            result.pipeline.production_graph?.id ||
            null,
          execution_id: result.pipeline.execution?.id || null,
          production_lifecycle:
            result.pipeline.production_lifecycle || null,
        }
      : null,
    observed_at: new Date().toISOString(),
  };
}

export async function POST(req) {
  try {
    const body = await req.json();
    const organization_id = body.organization_id || body.organizationId || null;
    const creative_project_id =
      body.creative_project_id || body.creativeProjectId || null;

    if (!organization_id) {
      return NextResponse.json(
        { success: false, error: "organization_id required" },
        { status: 400 },
      );
    }
    if (!creative_project_id) {
      return NextResponse.json(
        { success: false, error: "creative_project_id required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId: organization_id,
    });
    if (!access.success) {
      return NextResponse.json(access, { status: access.status });
    }

    const project = await CreativeProjectRuntime.get(creative_project_id);
    if (!project) {
      return NextResponse.json(
        { success: false, error: "CREATIVE_PROJECT_NOT_FOUND" },
        { status: 404 },
      );
    }
    if (project.organization_id !== organization_id) {
      return NextResponse.json(
        { success: false, error: "CREATIVE_PROJECT_ORGANIZATION_MISMATCH" },
        { status: 403 },
      );
    }

    const release_mode = normalizeReleaseMode(
      body.release_mode || body.releaseMode,
    );
    const evidence_assets = await resolveProjectEvidence({
      organization_id,
      creative_project_id,
      supplied_assets: body.assets || body.reference_assets || [],
    });
    const executionInput = {
      ...body,
      organization_id,
      creative_project_id,
      creative_mission_id:
        body.creative_mission_id ||
        body.mission_id ||
        project.creative_mission_id ||
        project.id,
      project,
      assets: evidence_assets,
      reference_assets: evidence_assets,
      release_mode,
    };

    const universal = CreativeUniversalProductionRuntime.isUniversalProject(project);
    const result = universal
      ? await CreativeUniversalProductionRuntime.execute({
          organization_id,
          creative_project_id,
          max_cycles: body.max_cycles || 1,
        })
      : await CreativeDirectorRuntime.execute(executionInput);

    let autonomous_handoff = null;
    if (
      result?.success !== false &&
      result?.production &&
      creative_project_id
    ) {
      autonomous_handoff = await CreativeProductionHandoffRuntime.activate({
        organization_id,
        creative_project_id,
        approved_by:
          body.approved_by ||
          body.approvedBy ||
          access.user?.id ||
          access.user_id ||
          null,
        approval_source:
          body.approval_source ||
          "AUTHENTICATED_CREATIVE_PRODUCTION_START",
        release_mode,
        production: result.production,
      });
    }

    const success = result?.success !== false;
    if (!success) {
      console.error(
        "creative director execution returned unsuccessful result",
        JSON.stringify(
          summarizeUnsuccessfulResult({
            result,
            organization_id,
            creative_project_id,
            universal,
            release_mode,
            evidence_assets,
          }),
          null,
          2,
        ),
      );
    }

    return NextResponse.json(
      {
        success,
        ...result,
        universal,
        release_mode,
        evidence_asset_count: evidence_assets.length,
        autonomous_handoff,
      },
      { status: success ? 200 : 422 },
    );
  } catch (error) {
    console.error(
      "creative director execution failed",
      JSON.stringify(
        {
          message: error?.message || "Creative production failed",
          code: error?.code || null,
          details: error?.details || null,
          stack: error?.stack || null,
          observed_at: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Creative production failed",
        code: error?.code || null,
        details: error?.details || null,
      },
      { status: 500 },
    );
  }
}
