export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { createConversationAttachmentSet } from "@/lib/platform/runtime/ConversationAttachmentRuntime";

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const organizationId = text(formData.get("organizationId") || formData.get("organization_id"), 160);
    if (!organizationId) return NextResponse.json({ success: false, error: "organization_id required" }, { status: 400 });
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error || "Access forbidden" }, { status: access.status || 403 });
    const files = formData.getAll("files").filter((item) => item && typeof item.arrayBuffer === "function");
    if (!files.length) return NextResponse.json({ success: false, error: "attachments required" }, { status: 400 });
    const result = await createConversationAttachmentSet({
      context: { organizationId: access.organizationId || organizationId, actor: { id: access.user?.id || access.userId || null } },
      files,
    });
    return NextResponse.json({
      success: true,
      contract: "AVANTIQO_CONVERSATION_ATTACHMENT_API_V1",
      attachment_set_id: result.attachment_set_id,
      expires_at: result.expires_at,
      files: result.files,
      analysis_required: result.files.some((file) => file?.analysis?.requires_content_analysis === true),
      authorization_effect: "NONE",
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: text(error?.message || error, 700) || "Attachment upload failed",
    }, { status: error?.status || 400 });
  }
}
