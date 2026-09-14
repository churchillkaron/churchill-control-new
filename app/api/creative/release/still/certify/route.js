export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { loadImageStudioWorkspace } from "@/lib/creative/stills/repositories/CreativeImageStudioWorkspaceRepository";
import { CreativeStillReleaseCertificationRuntime } from "@/lib/creative/stills/runtime/CreativeStillReleaseCertificationRuntime";

const text = (value) => String(value ?? "").trim();

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id || body.organizationId);
    const projectId = text(body.creative_project_id || body.creativeProjectId || body.project_id);
    const exportId = text(body.export_id || body.exportId);
    const creativeAssetId = text(body.creative_asset_id || body.creativeAssetId);
    if (!organizationId || !projectId || (!exportId && !creativeAssetId)) {
      return Response.json({ success: false, error: "organization_id, creative_project_id and export_id or creative_asset_id required" }, { status: 400 });
    }

    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return Response.json(access, { status: access.status });

    const workspace = await loadImageStudioWorkspace({ organization_id: access.organizationId, creative_project_id: projectId });
    const row = (workspace.exports || []).find((entry) =>
      (exportId && text(entry.id) === exportId) ||
      (creativeAssetId && text(entry.evidence?.creative_asset_id || entry.asset_id) === creativeAssetId),
    );
    if (!row || row.status !== "COMPLETED") {
      return Response.json({ success: false, error: "COMPLETED_IMAGE_STUDIO_EXPORT_REQUIRED" }, { status: 404 });
    }

    const evidence = row.evidence || {};
    const settings = row.settings || {};
    const result = await CreativeStillReleaseCertificationRuntime.certify({
      organization_id: access.organizationId,
      creative_project_id: projectId,
      creative_asset_id: evidence.creative_asset_id || row.asset_id,
      storage_reference: evidence.storage_reference,
      checksum: evidence.checksum,
      artboard_id: row.artboard_id,
      mime_type: settings.mime_type,
      width: settings.width,
      height: settings.height,
      quality_preflight: evidence.quality_preflight,
    });

    return Response.json({ success: true, ...result });
  } catch (error) {
    return Response.json({ success: false, error: error.message }, { status: 500 });
  }
}
