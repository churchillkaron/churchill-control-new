import { execute } from "@/lib/ubte/runtime/ExecutionEngine";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

const ACTION_MAP = {
  MOVE_GUESTS: "MoveGuests",
  CLOSE_TABLE: "CloseTable",
  TRANSFER_TABLE: "TransferTable",
  MERGE_TABLES: "MergeTables",
};

function errorResponse(error, status = 500) {
  return Response.json(
    {
      success: false,
      error,
    },
    { status }
  );
}

export async function POST(request) {
  try {
    const body = await request.json();
    const payload =
      body?.payload && typeof body.payload === "object" ? body.payload : {};
    const legacyAction = String(body?.action || "").trim().toUpperCase();
    const action = ACTION_MAP[legacyAction];
    const organizationId =
      payload.organizationId ||
      payload.organization_id ||
      body.organizationId ||
      body.organization_id ||
      null;

    if (!action) {
      return errorResponse(
        legacyAction
          ? `Unsupported POS table action: ${legacyAction}`
          : "Missing action",
        400
      );
    }

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return errorResponse(access.error, access.status || 403);
    }

    const canonicalPayload = {
      ...payload,
      organizationId: access.organizationId,
      organization_id: access.organizationId,
    };

    const result = await execute({
      organizationId: access.organizationId,
      domain: "restaurant",
      capability: "posTableActions",
      action,
      payload: canonicalPayload,
      actor: {
        id: access.user?.id || null,
        email: access.user?.email || null,
        staffAccountId:
          access.access?.staffAccountId || access.staff?.id || null,
        role: access.role || null,
      },
      runtime: {
        permissions: access.permissions || [],
        metadata: {
          authenticated: true,
          compatibilityRoute: "/api/pos/tables/action",
          legacyAction,
        },
      },
    });

    return Response.json({
      success: true,
      data: result.result,
      execution: {
        requestId: result.context?.requestId || null,
        correlationId: result.context?.correlationId || null,
        domain: result.domain,
        capability: result.capability,
        action: result.action,
      },
    });
  } catch (error) {
    console.error("POS TABLE ACTION ERROR", error);

    return errorResponse(
      error?.message || "POS table action failed",
      error?.status || 500
    );
  }
}
