export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requireOrganizationAccess }
from "@/lib/platform/security/requireOrganizationAccess";

import * as CreativeAssetRepository
from "@/lib/creative/assets/repositories/CreativeAssetRepository";

import {
  CreativeAssetIntelligenceRuntime,
} from "@/lib/creative/assets/intelligence/runtime/CreativeAssetIntelligenceRuntime";

function mergedMetadata(asset = {}, intelligence = {}) {
  return {
    ...(asset.metadata || {}),
    technical: {
      ...(asset.metadata?.technical || {}),
      ...intelligence,
    },
    inspection_status: intelligence.status || null,
    inspection_reason: intelligence.reason || null,
    inspected_at: intelligence.analyzed_at || new Date().toISOString(),
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const assetId = body.asset_id || body.assetId;
    const organizationId = body.organization_id || body.organizationId;

    if (!assetId || !organizationId) {
      return Response.json(
        { success: false, error: "asset_id and organization_id required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({ organizationId });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const asset = await CreativeAssetRepository.get(assetId);
    if (!asset || asset.organization_id !== organizationId) {
      return Response.json(
        { success: false, error: "Asset not found" },
        { status: 404 },
      );
    }

    const intelligence = await CreativeAssetIntelligenceRuntime.analyze(
      asset,
      { policy: body.policy || {} },
    );
    const updated = await CreativeAssetRepository.update(asset.id, {
      metadata: mergedMetadata(asset, intelligence),
      analysis: {
        ...(asset.analysis || {}),
        technical_status: intelligence.status || null,
        technical_reason: intelligence.reason || null,
      },
    });

    return Response.json({
      success: true,
      asset: updated,
      intelligence,
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
