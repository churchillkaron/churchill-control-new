export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getConversationTimeline, setConversationStatus } from "@/lib/commercial/communications/CommunicationService";
import {
  getInternalConversationTimeline,
  isInternalConversationId,
} from "@/lib/commercial/communications/InternalCommunicationAdapter";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function GET(request, { params }) {
  try {
    const resolved = await params;
    const conversationId = String(resolved?.conversationId || "").trim();
    const url = new URL(request.url);
    const organizationId = String(url.searchParams.get("organizationId") || url.searchParams.get("organization_id") || "").trim();
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });

    const snapshot = isInternalConversationId(conversationId)
      ? await getInternalConversationTimeline({
          organizationId: access.organizationId,
          staffId: access.staff?.id,
          conversationId,
          markRead: true,
        })
      : await getConversationTimeline({
          organizationId: access.organizationId,
          conversationId,
          markRead: true,
        });

    return NextResponse.json({ success: true, ...snapshot });
  } catch (error) {
    const message = error?.message || "Conversation lookup failed";
    const notFound = message === "CONVERSATION_NOT_FOUND" || message === "INTERNAL_CONVERSATION_NOT_FOUND";
    const forbidden = message === "INTERNAL_CONVERSATION_FORBIDDEN";
    return NextResponse.json({ success: false, error: message }, { status: notFound ? 404 : forbidden ? 403 : 500 });
  }
}

export async function PATCH(request, { params }) {
  try {
    const resolved = await params;
    const conversationId = String(resolved?.conversationId || "").trim();
    const body = await request.json();
    const organizationId = String(body?.organizationId || body?.organization_id || "").trim();
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    if (isInternalConversationId(conversationId)) {
      return NextResponse.json({ success: false, error: "Internal thread status is managed by the internal messaging domain" }, { status: 400 });
    }
    const conversation = await setConversationStatus({ organizationId: access.organizationId, conversationId, status: body?.status });
    return NextResponse.json({ success: true, conversation });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Conversation update failed" }, { status: 400 });
  }
}
