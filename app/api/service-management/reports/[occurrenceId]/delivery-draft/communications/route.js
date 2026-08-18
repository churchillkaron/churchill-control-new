export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { resolveServiceManagementContext } from "@/lib/service-management/api/resolveServiceManagementContext";
import { createServiceReportCommunicationDraft } from "@/lib/service-management/runtime/ServiceReportCommunicationDraftRuntime";

function responseError(error, status = 500) {
  return Response.json(
    {
      success: false,
      error: error?.message || error || "Service report communication draft failed.",
    },
    { status: error?.status || status },
  );
}

function text(value) {
  return String(value ?? "").trim();
}

export async function POST(request, { params }) {
  try {
    const body = await request.json();
    const resolved = await resolveServiceManagementContext({
      request,
      input: body || {},
    });
    if (!resolved.success) {
      return responseError(resolved.error, resolved.status || 403);
    }

    const routeParams = await params;
    const occurrenceId = text(routeParams?.occurrenceId);
    if (!occurrenceId) {
      const error = new Error("occurrence_id required");
      error.status = 400;
      throw error;
    }

    const result = await createServiceReportCommunicationDraft({
      organizationId: resolved.context.organization_id,
      occurrenceId,
      conversationId: body?.conversationId || body?.conversation_id,
      entityId: resolved.context.entity_id,
      periodId: resolved.context.period_id,
      permissions: resolved.context.permissions,
      actorId: resolved.context.actor_id,
      actorPartyId:
        resolved.access?.staff?.party_id ||
        resolved.access?.staff?.partyId ||
        null,
      actorRole: resolved.context.role,
      callerRequest: request,
    });

    return Response.json(
      {
        success: true,
        ...result,
      },
      { status: 201 },
    );
  } catch (error) {
    return responseError(error);
  }
}
