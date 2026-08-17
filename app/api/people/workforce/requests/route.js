export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  loadWorkforceRequestReviewQueue,
  reviewShiftSwapRequest,
  reviewTimeOffRequest,
} from "@/lib/people/workforce/workforceRequestRuntime";
import { resolveActiveLegalEntitySelection } from "@/lib/platform/runtime/resolveActiveLegalEntitySelection";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const MANAGE_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "ADMIN",
  "MANAGER",
  "HR_ADMIN",
  "PAYROLL_ADMIN",
]);

function roleOf(value) {
  return String(value || "").trim().toUpperCase();
}

function contextError(context) {
  return NextResponse.json(
    {
      success: false,
      error: context.error,
      code: context.code,
      availableOrganizationIds: context.availableOrganizationIds || [],
    },
    { status: context.status || 403 }
  );
}

async function managementContext(request, organizationId = null, entityId = null) {
  const context = await resolveAuthenticatedStaffContext({ request, organizationId });
  if (!context.success) return { response: contextError(context) };

  const role = roleOf(context.role || context.staff?.role);
  if (!MANAGE_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        {
          success: false,
          error: "Workforce request review permission required",
          code: "WORKFORCE_REQUEST_REVIEW_DENIED",
        },
        { status: 403 }
      ),
    };
  }

  const selection = await resolveActiveLegalEntitySelection({
    request,
    organizationId: context.organizationId,
    entityId,
  });

  return {
    organizationId: context.organizationId,
    entityId: selection.entity.id,
    entity: selection.entity,
    entities: selection.entities,
    manager: context.staff,
    role,
  };
}

async function assertRequestEntity({ organizationId, entityId, requestId, kind }) {
  const table =
    kind === "time_off"
      ? "staff_time_off_requests"
      : "staff_shift_swap_requests";

  const { data, error } = await supabaseAdmin
    .from(table)
    .select("id,entity_id")
    .eq("id", String(requestId || "").trim())
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    const notFound = new Error(
      "Workforce request was not found for the selected legal entity"
    );
    notFound.status = 404;
    notFound.code = "WORKFORCE_REQUEST_ENTITY_MISMATCH";
    throw notFound;
  }
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const requestedOrganizationId =
      String(url.searchParams.get("organizationId") || "").trim() || null;
    const requestedEntityId =
      String(url.searchParams.get("entityId") || "").trim() || null;

    const context = await managementContext(
      request,
      requestedOrganizationId,
      requestedEntityId
    );
    if (context.response) return context.response;

    const queue = await loadWorkforceRequestReviewQueue({
      organizationId: context.organizationId,
    });

    const entityTimeOff = (queue.timeOffRequests || []).filter(
      (row) => row.entity_id === context.entityId
    );
    const entitySwaps = (queue.swapRequests || []).filter(
      (row) => row.entity_id === context.entityId
    );
    const staffIds = new Set([
      ...entityTimeOff.map((row) => row.staff_id),
      ...entitySwaps.flatMap((row) => [
        row.requester_staff_id,
        row.target_staff_id,
      ]),
    ]);

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      entityId: context.entityId,
      entity: context.entity,
      entities: context.entities,
      role: context.role,
      timeOffRequests: entityTimeOff,
      swapRequests: entitySwaps,
      staff: (queue.staff || []).filter((row) => staffIds.has(row.id)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load workforce request review queue",
        code: error?.code || null,
      },
      { status: error?.status || 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const requestedOrganizationId =
      String(body?.organizationId || body?.organization_id || "").trim() || null;
    const requestedEntityId =
      String(body?.entityId || body?.entity_id || "").trim() || null;

    const context = await managementContext(
      request,
      requestedOrganizationId,
      requestedEntityId
    );
    if (context.response) return context.response;

    const kind = String(body?.kind || "").trim().toLowerCase();
    if (!["time_off", "shift_swap"].includes(kind)) {
      return NextResponse.json(
        { success: false, error: "kind must be time_off or shift_swap" },
        { status: 400 }
      );
    }

    await assertRequestEntity({
      organizationId: context.organizationId,
      entityId: context.entityId,
      requestId: body?.requestId,
      kind,
    });

    let reviewed;

    if (kind === "time_off") {
      reviewed = await reviewTimeOffRequest({
        organizationId: context.organizationId,
        requestId: body?.requestId,
        manager: context.manager,
        decision: body?.decision,
        notes: body?.notes,
      });
    } else {
      reviewed = await reviewShiftSwapRequest({
        organizationId: context.organizationId,
        requestId: body?.requestId,
        manager: context.manager,
        decision: body?.decision,
        notes: body?.notes,
      });
    }

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      entityId: context.entityId,
      request: reviewed,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to review workforce request",
        code: error?.code || null,
      },
      { status: error?.status || 500 }
    );
  }
}
