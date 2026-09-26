export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  createOrReuseMusicVideoProject,
  handoffMusicMasterToVideoProject,
} from "@/lib/creative/video/runtime/CreativeMusicVideoHandoffRuntime.js";

const PERMISSIONS = Object.freeze(["creative.execute", "creative.production.run", "creative.*"]);
function text(value) { return String(value ?? "").trim(); }

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organization_id);
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    const access = await requireOrganizationAccess({ organizationId, request, requiredAnyPermission: PERMISSIONS });
    if (!access.success) return NextResponse.json({ success: false, error: access.error || "Forbidden" }, { status: access.status || 403 });
    const result = text(body.video_project_id)
      ? await handoffMusicMasterToVideoProject({
          organization_id: organizationId,
          music_project_id: body.music_project_id,
          video_project_id: body.video_project_id,
          master_asset_id: body.master_asset_id,
        })
      : await createOrReuseMusicVideoProject({
          organization_id: organizationId,
          music_project_id: body.music_project_id,
          master_asset_id: body.master_asset_id,
          force_new: body.force_new === true,
        });
    return NextResponse.json(result, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Music-video handoff failed" }, { status: 400 });
  }
}
