export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { execute as executeCapability } from "@/lib/ubte/runtime/ExecutionEngine";

function text(value) {
  return String(value ?? "").trim();
}

export async function POST(request, { params }) {
  try {
    const body = await request.json().catch(() => ({}));
    const organizationId = text(body?.organizationId || body?.organization_id);
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) {
      return NextResponse.json(
        { success: false, error: access.error },
        { status: access.status || 403 },
      );
    }

    if (body?.confirmed !== true) {
      return NextResponse.json(
        { success: false, error: "COMMUNICATION_SEND_CONFIRMATION_REQUIRED" },
        { status: 400 },
      );
    }

    const routeParams = await params;
    const conversationId = text(routeParams?.conversationId);
    const messageId = text(routeParams?.messageId);
    if (!conversationId || !messageId) {
      return NextResponse.json(
        { success: false, error: "COMMUNICATION_DRAFT_REFERENCE_REQUIRED" },
        { status: 400 },
      );
    }

    const execution = await executeCapability({
      organizationId: access.organizationId,
      domain: "commercial",
      capability: "communication",
      action: "sendDraftMessage",
      payload: {
        conversation_id: conversationId,
        message_id: messageId,
      },
      actor: {
        id: access.user?.id || null,
        partyId: access.staff?.party_id || access.staff?.partyId || null,
        role: access.role || null,
      },
      runtime: {
        permissions: access.permissions || [],
        callerRequest: request,
        metadata: {
          source: "COMMUNICATIONS_WORKSPACE",
          conversationallyConfirmed: true,
          operatorAuthorizationMode: "user_confirmed",
          operatorAuthorizationOriginMode: "user_confirmed",
        },
      },
    });

    return NextResponse.json({
      success: true,
      ...execution.result,
    });
  } catch (error) {
    const message = error?.message || "Communication draft send failed";
    const status = error?.status || (message.includes("REQUIRED") ? 400 : 500);
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
