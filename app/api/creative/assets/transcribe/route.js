export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

import {
  CreativeTranscriptRuntime,
} from "@/lib/creative/media/runtime/CreativeTranscriptRuntime";

function transcriptionInput(body = {}) {
  return {
    language: body.language || null,
    prompt: body.prompt || null,
    response_format: body.response_format || body.responseFormat || null,
    timestamp_granularities:
      body.timestamp_granularities ||
      body.timestampGranularities ||
      null,
    chunking_strategy:
      body.chunking_strategy ||
      body.chunkingStrategy ||
      null,
    temperature: body.temperature ?? null,
    name: body.name || null,
    description: body.description || null,
    tags: Array.isArray(body.tags) ? body.tags : [],
    version: body.version || 1,
  };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = body.organization_id || body.organizationId;
    const parentAssetNodeId =
      body.parent_asset_node_id ||
      body.parentAssetNodeId;

    if (!organizationId || !parentAssetNodeId) {
      return Response.json(
        {
          success: false,
          error: "organization_id and parent_asset_node_id required",
        },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({ organizationId });
    if (!access.success) {
      return Response.json(access, { status: access.status });
    }

    const result = await CreativeTranscriptRuntime.create({
      organization_id: organizationId,
      parent_asset_node_id: parentAssetNodeId,
      input: transcriptionInput(body),
      force: body.force === true,
    });

    return Response.json({
      success: true,
      ...result,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 },
    );
  }
}
