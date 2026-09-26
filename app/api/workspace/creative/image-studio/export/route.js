export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import * as CreativeAssetRepository from "@/lib/creative/assets/repositories/CreativeAssetRepository.js";
import { CreativeAssetGraphRuntime } from "@/lib/creative/assets/graph/runtime/CreativeAssetGraphRuntime.js";
import {
  loadImageStudioWorkspace,
  createImageStudioExport,
} from "@/lib/creative/stills/repositories/CreativeImageStudioWorkspaceRepository.js";
import { renderImageStudioMaster } from "@/lib/creative/stills/runtime/CreativeImageStudioExportRuntime.js";
import { assessImageStudioComposition } from "@/lib/creative/stills/runtime/CreativeImageStudioQualityPreflightRuntime.js";
import { CreativeStillReleaseCertificationRuntime } from "@/lib/creative/stills/runtime/CreativeStillReleaseCertificationRuntime.js";

const BUCKET = "creative-assets";
const clean = (value) => String(value ?? "").trim();

function imageStudioRenderEvidence(rendered={}){
  return {
    format:rendered.format||null,
    mime_type:rendered.mime_type||null,
    file_extension:rendered.file_extension||null,
    width:rendered.width||null,
    height:rendered.height||null,
    source_orientation:rendered.source_orientation||null,
    color_management:rendered.color_management||null,
    typography:rendered.typography||null,
    effects:rendered.effects||null,
    adjustments:rendered.adjustments||null,
    retouch:rendered.retouch||null,
    edge_integration:rendered.edge_integration||null,
    contact_realism:rendered.contact_realism||null,
    texture_integration:rendered.texture_integration||null,
    adjustment_layers:rendered.adjustment_layers||null,
    masks:rendered.masks||null,
  };
}

async function persistMaster({ organizationId, projectId, artboard, rendered, preflight }) {
  const exportId = crypto.randomUUID();
  const checksum = crypto.createHash("sha256").update(rendered.bytes).digest("hex");
  const renderEvidence=imageStudioRenderEvidence(rendered);
  const filename = `image-studio-${artboard.id}-${exportId}.${rendered.file_extension}`;
  const storagePath = `${organizationId}/image-studio/${projectId}/${artboard.id}/${filename}`;
  const storageReference = `storage://${BUCKET}/${storagePath}`;
  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(storagePath, rendered.bytes, {
    contentType: rendered.mime_type,
    cacheControl: "3600",
    upsert: false,
    metadata: {
      contract: rendered.contract,
      checksum,
      image_studio_master: true,
      creative_project_id: projectId,
      artboard_id: artboard.id,
      quality_score: String(preflight.score),
    },
  });
  if (uploadError) throw uploadError;

  const asset = await CreativeAssetRepository.create({
    organization_id: organizationId,
    creative_project_id: projectId,
    asset_type: "IMAGE_MASTER",
    file_url: storageReference,
    image_url: storageReference,
    thumbnail_url: storageReference,
    file_name: filename,
    name: `${artboard.name || "Image Studio"} master`,
    title: artboard.name || "Image Studio master",
    description: "Deterministic Image Studio release master.",
    tags: ["image-studio", "master", rendered.format.toLowerCase()],
    ai_generated: false,
    metadata: {
      storage_bucket: BUCKET,
      storage_path: storagePath,
      checksum,
      mime_type: rendered.mime_type,
      width: rendered.width,
      height: rendered.height,
      artboard_id: artboard.id,
      deterministic_export_contract: rendered.contract,
      render_evidence: renderEvidence,
      quality_preflight: preflight,
      publication_ready: preflight.release_ready === true,
      verified: preflight.release_ready === true,
      verification_status: preflight.release_ready === true ? "APPROVED" : "BLOCKED",
    },
  });

  const graphNodes = await CreativeAssetGraphRuntime.attachCanonicalAssets({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_asset_ids: [asset.id],
  });

  const stillRelease = await CreativeStillReleaseCertificationRuntime.certify({
    organization_id: organizationId,
    creative_project_id: projectId,
    creative_asset_id: asset.id,
    storage_reference: storageReference,
    checksum,
    artboard_id: artboard.id,
    name: asset.name,
    mime_type: rendered.mime_type,
    width: rendered.width,
    height: rendered.height,
    quality_preflight: preflight,
  });

  await createImageStudioExport({
    id: exportId,
    organization_id: organizationId,
    creative_project_id: projectId,
    artboard_id: artboard.id,
    asset_id: asset.id,
    export_type: rendered.format,
    status: "COMPLETED",
    settings: { width: rendered.width, height: rendered.height, mime_type: rendered.mime_type, format:rendered.format, color_space:rendered.color_management?.output_color_space||null, density_dpi:rendered.color_management?.output_density_dpi||null },
    evidence: {
      contract: rendered.contract,
      deterministic: true,
      checksum,
      storage_reference: storageReference,
      creative_asset_id: asset.id,
      creative_asset_node_ids: graphNodes.map((node) => node.id),
      still_release_certification: {
        contract: stillRelease.contract,
        passed: stillRelease.passed,
        blocker: stillRelease.blocker || null,
        master_asset_node_id: stillRelease.master?.id || null,
        release_readiness_report_id: stillRelease.readiness?.id || null,
        release_package_id: stillRelease.package?.id || null,
        derivative_asset_node_ids: (stillRelease.derivatives || []).map((item) => item.render_asset_node_id),
        channels: stillRelease.channels || [],
      },
      quality_preflight: preflight,
      render_evidence: renderEvidence,
    },
    completed_at: new Date().toISOString(),
  });

  return { asset, graphNodes, stillRelease, exportId, checksum, storageReference };
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body.organization_id);
    const projectId = clean(body.project_id);
    const artboardId = clean(body.artboard_id);
    if (!organizationId || !projectId || !artboardId) {
      return NextResponse.json({ success: false, error: "organization_id, project_id and artboard_id required" }, { status: 400 });
    }
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }

    const { data: project, error: projectError } = await supabaseAdmin
      .from("creative_projects")
      .select("id,organization_id,archived")
      .eq("id", projectId)
      .eq("organization_id", access.organizationId)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project || project.archived) {
      return NextResponse.json({ success: false, error: "Creative project not found in organization" }, { status: 404 });
    }
    const workspace = await loadImageStudioWorkspace({
      organization_id: access.organizationId,
      creative_project_id: projectId,
    });
    const artboard = workspace.artboards.find((item) => item.id === artboardId);
    if (!artboard) {
      return NextResponse.json({ success: false, error: "Artboard not found" }, { status: 404 });
    }

    const layers = workspace.layers.filter((item) => item.artboard_id === artboardId);
    const comments = workspace.comments.filter((item) => item.artboard_id === artboardId);
    const preflight = assessImageStudioComposition({ artboard, layers, comments });

    if (!preflight.release_ready) {
      await createImageStudioExport({
        id: crypto.randomUUID(),
        organization_id: access.organizationId,
        creative_project_id: projectId,
        artboard_id: artboardId,
        export_type: String(body.format || "PNG").toUpperCase(),
        status: "BLOCKED",
        settings: { requested_format: body.format || "PNG" },
        evidence: {
          quality_preflight: preflight,
          blocked_by: preflight.contract,
        },
      });
      return NextResponse.json({
        success: false,
        error: "IMAGE_STUDIO_EXPORT_PREFLIGHT_BLOCKED",
        preflight,
      }, { status: 409 });
    }

    const rendered = await renderImageStudioMaster({
      organization_id: access.organizationId,
      creative_project_id: projectId,
      artboard,
      layers,
      format: body.format || "PNG",
    });
    const persisted = await persistMaster({
      organizationId: access.organizationId,
      projectId,
      artboard,
      rendered,
      preflight,
    });
    return new NextResponse(rendered.bytes, {
      status: 200,
      headers: {
        "content-type": rendered.mime_type,
        "content-disposition": `attachment; filename="${persisted.asset.file_name || `image-studio-${artboardId}.${rendered.file_extension}`}"`,
        "x-avantiqo-contract": rendered.contract,
        "x-avantiqo-quality-score": String(preflight.score),
        "x-avantiqo-creative-asset-id": persisted.asset.id,
        "x-avantiqo-master-checksum": persisted.checksum,
      },
    });
  } catch (error) {
    console.error("CREATIVE_IMAGE_STUDIO_EXPORT_FAILED", error);
    return NextResponse.json({
      success: false,
      error: error?.message || "Unable to export Image Studio master",
    }, { status: 500 });
  }
}
// Contract marker retained for compatibility: status:"BLOCKED"
