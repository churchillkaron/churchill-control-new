export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { deliverCommunicationMessage } from "@/lib/commercial/communications/CommunicationDeliveryRuntime";
import { queueOutboundMessage } from "@/lib/commercial/communications/CommunicationService";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = String(body?.organizationId || body?.organization_id || "").trim();
    const conversationId = String(body?.conversationId || body?.conversation_id || "").trim();
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    if (!conversationId) return NextResponse.json({ success: false, error: "conversationId required" }, { status: 400 });

    const queued = await queueOutboundMessage({
      organizationId: access.organizationId,
      conversationId,
      body: body?.body,
      subject: body?.subject,
      sentByPartyId: access.staff?.party_id || null,
    });
    const message = await deliverCommunicationMessage({
      organizationId: access.organizationId,
      conversationId,
      message: queued,
      partyId: access.staff?.party_id || null,
    });

    return NextResponse.json({
      success: true,
      message,
      deliveryPending: message.status === "QUEUED",
      deliveryFailed: message.status === "FAILED",
    }, { status: 201 });
  } catch (error) {
    const message = error?.message || "Message creation failed";
    return NextResponse.json({ success: false, error: message }, { status: message.includes("REQUIRED") ? 400 : 500 });
  }
}
