export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import {
  cancelWorkforceCalendarDay,
  createWorkforceCalendarDay,
  loadWorkforceCalendar,
} from "@/lib/people/workforce/workforceCalendarRuntime";
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

async function managementContext(request, requestedOrganizationId = null) {
  const context = await resolveAuthenticatedStaffContext({
    request,
    organizationId: requestedOrganizationId || null,
  });
  if (!context.success) return { response: contextError(context) };

  const role = roleOf(context.role || context.staff?.role);
  if (!MANAGE_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Workforce calendar management permission required" },
        { status: 403 }
      ),
    };
  }

  return {
    organizationId: context.organizationId,
    manager: context.staff,
    role,
  };
}

async function loadEntities(organizationId) {
  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select("id,legal_name,display_name,code,country,currency,timezone,is_default_accounting_entity")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("is_default_accounting_entity", { ascending: false })
    .order("legal_name", { ascending: true });
  if (error) throw error;
  return data || [];
}

function monthRange(month) {
  if (!/^\d{4}-\d{2}$/.test(String(month || ""))) {
    throw new Error("month must use YYYY-MM format");
  }
  const start = `${month}-01`;
  const end = new Date(`${start}T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return { start, end: end.toISOString().slice(0, 10) };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const ctx = await managementContext(
      request,
      url.searchParams.get("organizationId") || null
    );
    if (ctx.response) return ctx.response;

    const entities = await loadEntities(ctx.organizationId);
    const requestedEntityId = String(url.searchParams.get("entityId") || "").trim();
    const entity = requestedEntityId
      ? entities.find((row) => row.id === requestedEntityId)
      : entities.find((row) => row.is_default_accounting_entity) || entities[0] || null;

    if (!entity) {
      return NextResponse.json(
        { success: false, error: "No active legal entity is configured for workforce calendar" },
        { status: 409 }
      );
    }
    if (requestedEntityId && !entity) {
      return NextResponse.json(
        { success: false, error: "Selected legal entity is not available in this organization" },
        { status: 404 }
      );
    }

    const month = url.searchParams.get("month") || new Date().toISOString().slice(0, 7);
    const range = monthRange(month);
    const days = await loadWorkforceCalendar({
      organizationId: ctx.organizationId,
      entityId: entity.id,
      startDate: range.start,
      endDate: range.end,
      includeCancelled: true,
    });

    return NextResponse.json({
      success: true,
      organizationId: ctx.organizationId,
      role: ctx.role,
      month,
      entity,
      entities,
      days,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to load workforce calendar", code: error?.code || null },
      { status: error?.status || 400 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const ctx = await managementContext(
      request,
      String(body?.organizationId || body?.organization_id || "").trim() || null
    );
    if (ctx.response) return ctx.response;

    const entities = await loadEntities(ctx.organizationId);
    const entityId = String(body?.entityId || body?.entity_id || "").trim();
    if (!entities.some((row) => row.id === entityId)) {
      return NextResponse.json(
        { success: false, error: "Selected legal entity is not available in this organization" },
        { status: 404 }
      );
    }

    const day = await createWorkforceCalendarDay({
      organizationId: ctx.organizationId,
      entityId,
      staff: ctx.manager,
      calendarDate: body?.calendarDate,
      dayType: body?.dayType,
      name: body?.name,
      notes: body?.notes,
      sourceType: "MANUAL",
      sourceReference: body?.sourceReference,
    });

    return NextResponse.json({ success: true, day });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to create workforce calendar day", code: error?.code || null },
      { status: error?.status || 400 }
    );
  }
}

export async function DELETE(request) {
  try {
    const url = new URL(request.url);
    const ctx = await managementContext(
      request,
      url.searchParams.get("organizationId") || null
    );
    if (ctx.response) return ctx.response;

    const entityId = String(url.searchParams.get("entityId") || "").trim();
    const calendarDayId = String(url.searchParams.get("id") || "").trim();
    if (!entityId || !calendarDayId) {
      return NextResponse.json(
        { success: false, error: "entityId and calendar day id are required" },
        { status: 400 }
      );
    }

    const day = await cancelWorkforceCalendarDay({
      organizationId: ctx.organizationId,
      entityId,
      staff: ctx.manager,
      calendarDayId,
    });

    return NextResponse.json({ success: true, day });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error?.message || "Unable to cancel workforce calendar day", code: error?.code || null },
      { status: error?.status || 400 }
    );
  }
}
