export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import {
  loadConversationAttachmentSet,
  persistConversationAttachmentAnalysis,
} from "@/lib/platform/runtime/ConversationAttachmentRuntime";
import {
  analyzeConversationAttachments,
  AVANTIQO_ATTACHMENT_ANALYSIS_VERSION,
} from "@/lib/platform/runtime/ConversationAttachmentAnalysisRuntime";

function text(value, maximum = 4000) {
  return String(value ?? "").trim().slice(0, maximum);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = text(body.organizationId || body.organization_id, 160);
    const attachmentSetId = text(body.attachment_set_id || body.attachmentSetId, 80);
    if (!organizationId || !attachmentSetId) {
      return NextResponse.json({ success: false, error: "organization_id and attachment_set_id required" }, { status: 400 });
    }
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error || "Access forbidden" }, { status: access.status || 403 });
    }
    const actor = { id: access.user?.id || access.userId || null };
    const context = { organizationId: access.organizationId || organizationId, actor };
    const loaded = await loadConversationAttachmentSet({ context, attachment_set_id: attachmentSetId });
    if (loaded.expired === true) {
      return NextResponse.json({ success: false, error: "Attachment set expired" }, { status: 410 });
    }
    if (loaded.found !== true) {
      return NextResponse.json({ success: false, error: "Attachment set not found" }, { status: 404 });
    }
    const analyzed = await analyzeConversationAttachments({
      files: loaded.files || [],
      context: { organizationId: context.organizationId, entityId: null, partyId: access.staff?.party_id || null },
    });
    await persistConversationAttachmentAnalysis({
      context,
      attachment_set_id: attachmentSetId,
      files: analyzed,
      analysis_version: AVANTIQO_ATTACHMENT_ANALYSIS_VERSION,
    });
    const files = analyzed.map((file) => ({
      id: file.id,
      name: file.name,
      mime_type: file.mime_type,
      size_bytes: file.size_bytes,
      sha256: file.sha256,
      analysis: file.analysis,
      exact_duplicate: file.exact_duplicate || null,
      authorization_effect: "NONE",
    }));
    return NextResponse.json({
      success: true,
      contract: "AVANTIQO_CONVERSATION_ATTACHMENT_ANALYSIS_API_V1",
      attachment_set_id: attachmentSetId,
      analysis_version: AVANTIQO_ATTACHMENT_ANALYSIS_VERSION,
      files,
      analyzed_count: files.filter((file) => file?.analysis?.status === "ANALYZED").length,
      authorization_effect: "NONE",
    }, { status: 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: text(error?.message || error, 700) || "Attachment analysis failed",
    }, { status: error?.status || 400 });
  }
}
