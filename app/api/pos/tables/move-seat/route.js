import { execute } from "@/lib/ubte/runtime/ExecutionEngine";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";

export const dynamic = "force-dynamic";

function readOrganizationId(body) {
  return body?.organizationId ?? body?.organization_id ?? null;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const organizationId = readOrganizationId(body);

    const access = await requireOrganizationAccess({
      organizationId,
      request,
    });

    if (!access.success) {
      return Response.json(
        { success: false, error: access.error },
        { status: access.status || 403 }
      );
    }

    const result = await execute({
      organizationId: access.organizationId,
      domain: "restaurant",
      capability: "posTableActions",
      action: "MoveSeat",
      payload: {
        fromTableId: body.fromTableId,
        toTableId: body.toTableId,
        seatPosition: body.seatPosition,
      },
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
          compatibilityRoute: "/api/pos/tables/move-seat",
        },
      },
    });

    return Response.json({
      success: true,
      ...result.result,
      execution: result.context,
    });
  } catch (error) {
    console.error("[MOVE_SEAT]", error);

    return Response.json(
      {
        success: false,
        error: error?.message || "Move seat failed",
      },
      { status: error?.status || 500 }
    );
  }
}
