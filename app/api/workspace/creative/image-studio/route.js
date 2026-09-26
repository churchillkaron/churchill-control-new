export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  loadImageStudioWorkspace,
} from "@/lib/creative/stills/repositories/CreativeImageStudioWorkspaceRepository.js";
import {
  executeImageStudioWorkspaceAction,
} from "@/lib/creative/stills/actions/CreativeImageStudioWorkspaceActions.js";

function clean(value) { return String(value ?? "").trim(); }

async function authorizeProject({ organizationId, projectId }) {
  const { data, error } = await supabaseAdmin
    .from("creative_projects")
    .select("id,organization_id,production_type,archived,metadata")
    .eq("id", projectId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.archived) return null;
  return data;
}
async function authorizedScope(request, body = null) {
  const url = new URL(request.url);
  const organizationId = clean(body?.organization_id || body?.organizationId || url.searchParams.get("organization_id") || url.searchParams.get("organizationId"));
  const projectId = clean(body?.project_id || body?.projectId || url.searchParams.get("project_id") || url.searchParams.get("projectId"));
  if (!organizationId || !projectId) {
    return { error: NextResponse.json({ success: false, error: "organization_id and project_id required" }, { status: 400 }) };
  }
  const access = await requireOrganizationAccess({ organizationId, request });
  if (!access.success) {
    return { error: NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 }) };
  }
  const project = await authorizeProject({ organizationId: access.organizationId, projectId });
  if (!project) {
    return { error: NextResponse.json({ success: false, error: "Creative project not found in organization" }, { status: 404 }) };
  }
  return { organizationId: access.organizationId, projectId, project };
}

export async function GET(request) {
  try {
    const scope = await authorizedScope(request);
    if (scope.error) return scope.error;
    const workspace = await loadImageStudioWorkspace({
      organization_id: scope.organizationId,
      creative_project_id: scope.projectId,
      entity_id: null,
    });
    return NextResponse.json({ success: true, workspace });
  } catch (error) {
    console.error("CREATIVE_IMAGE_STUDIO_WORKSPACE_LOAD_FAILED", error);
    return NextResponse.json({ success: false, error: error?.message || "Unable to load Image Studio workspace" }, { status: 500 });
  }
}
export async function POST(request) {
  try {
    const body = await request.json();
    const scope = await authorizedScope(request, body);
    if (scope.error) return scope.error;
    const result = await executeImageStudioWorkspaceAction({
      ...body,
      organization_id: scope.organizationId,
      project_id: scope.projectId,
      actor_id: body.actor_id || null,
      project: scope.project,
    });
    return NextResponse.json({ success: true, result });
  } catch (error) {
    console.error("CREATIVE_IMAGE_STUDIO_WORKSPACE_ACTION_FAILED", error);
    const message = error?.message || "Unable to update Image Studio workspace";
    const status = /IMAGE_STUDIO_(?:ARTBOARD|LAYER)_CONFLICT/.test(message) ? 409 : /required|unsupported|invalid/i.test(message) ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
