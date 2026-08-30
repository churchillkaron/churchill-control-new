export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  createDeveloperAttachmentSet,
} from "@/lib/platform/runtime/DeveloperAttachmentRuntime";
import {
  requireOrganizationAccess,
} from "@/lib/platform/security/requireOrganizationAccess";

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organizationId || body.organization_id, 160);
    if (!organizationId) {
      return NextResponse.json(
        { success: false, error: "organization_id required" },
        { status: 400 },
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error || "Access forbidden" },
        { status: access.status || 403 },
      );
    }

    const attachments = list(body.attachments);
    if (!attachments.length) {
      return NextResponse.json(
        { success: false, error: "attachments required" },
        { status: 400 },
      );
    }

    const result = await createDeveloperAttachmentSet({
      context: {
        organizationId: access.organizationId || organizationId,
        actor: {
          id: access.user?.id || access.userId || null,
        },
      },
      attachments,
    });

    return NextResponse.json(
      {
        success: true,
        contract: "AVANTIQO_DEVELOPER_ATTACHMENT_API_V1",
        attachment_set_id: result.attachment_set_id,
        expires_at: result.expires_at,
        files: result.files,
        read_only_evidence: true,
        authorization_effect: "NONE",
        production_deploy_authority: false,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: text(error?.message || error, 700) || "Developer attachment upload failed",
      },
      { status: error?.status || 400 },
    );
  }
}
