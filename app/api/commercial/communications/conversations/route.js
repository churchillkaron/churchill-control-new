export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCommunicationInbox, openConversation } from "@/lib/commercial/communications/CommunicationService";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function clean(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }
    const snapshot = await getCommunicationInbox({
      organizationId: access.organizationId,
      provider: clean(url.searchParams.get("provider")),
      search: clean(url.searchParams.get("search")),
    });
    return NextResponse.json({ success: true, organizationId: access.organizationId, ...snapshot });
  } catch (error) {
    return NextResponse.json({ success: false, error: error?.message || "Communications inbox failed" }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = clean(body?.organizationId || body?.organization_id);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }
    const conversation = await openConversation({
      organizationId: access.organizationId,
      connectionId: clean(body?.connectionId || body?.connection_id),
      recipientAddress: clean(body?.recipientAddress || body?.recipient_address),
      recipientName: clean(body?.recipientName || body?.recipient_name),
      subject: clean(body?.subject),
      customerPartyId: clean(body?.customerPartyId || body?.customer_party_id),
    });
    return NextResponse.json({ success: true, conversation }, { status: 201 });
  } catch (error) {
    const message = error?.message || "Conversation creation failed";
    const status = message.includes("REQUIRED") ? 400 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
