export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getCommunicationInbox, openConversation } from "@/lib/commercial/communications/CommunicationService";
import { syncMetaCommunicationHistory } from "@/lib/commercial/communications/CommunicationMetaInboxSyncRuntime";
import { listInternalConversations } from "@/lib/commercial/communications/InternalCommunicationAdapter";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

function clean(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function sortedConversations(rows = []) {
  return [...rows].sort((left, right) => {
    const leftTime = new Date(left?.last_message_at || left?.updated_at || left?.created_at || 0).getTime();
    const rightTime = new Date(right?.last_message_at || right?.updated_at || right?.created_at || 0).getTime();
    return rightTime - leftTime;
  });
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = clean(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json({ success: false, error: access.error }, { status: access.status || 403 });
    }

    let providerSync = null;
    if (url.searchParams.get("sync") === "1") {
      try {
        providerSync = await syncMetaCommunicationHistory({
          organizationId: access.organizationId,
        });
      } catch (syncError) {
        console.error("COMMUNICATION_META_HISTORY_SYNC_FAILED", {
          organizationId: access.organizationId,
          message: syncError?.message || "Meta inbox synchronization failed",
          code: syncError?.code || null,
          subcode: syncError?.subcode || null,
        });
        providerSync = {
          success: false,
          error: syncError?.message || "Meta inbox synchronization failed",
        };
      }
    }

    const requestedProvider = clean(url.searchParams.get("provider"));
    const includeExternal = requestedProvider !== "internal";
    const includeInternal = !requestedProvider || requestedProvider === "internal";

    const [snapshot, internalConversations] = await Promise.all([
      includeExternal
        ? getCommunicationInbox({
            organizationId: access.organizationId,
            provider: requestedProvider,
            search: clean(url.searchParams.get("search")),
          })
        : Promise.resolve({ conversations: [], connections: [] }),
      includeInternal
        ? listInternalConversations({
            organizationId: access.organizationId,
            staffId: access.staff?.id,
          })
        : Promise.resolve([]),
    ]);

    const internalConnection = includeInternal
      ? [{
          id: "internal",
          provider: "internal",
          family: "internal",
          label: "Internal",
          channelType: "internal",
          sendable: true,
          deliveryServiceId: null,
          deliveryCapability: null,
          name: "Internal team",
        }]
      : [];

    return NextResponse.json({
      success: true,
      organizationId: access.organizationId,
      providerSync,
      conversations: sortedConversations([
        ...(snapshot.conversations || []),
        ...internalConversations,
      ]),
      connections: [...internalConnection, ...(snapshot.connections || [])],
    });
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
