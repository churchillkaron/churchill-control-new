export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  createEmployeeWithEmployment,
  loadEmployeeDirectoryWithEmployment,
  setEmployeeActiveWithEmployment,
  transferEmployeeLegalEntity,
} from "@/lib/people/employees/employeeEmploymentLifecycleService";
import { updateEmployeeRecord } from "@/lib/people/employees/employeeDirectoryService";
import activateStaffPortalAccess from "@/lib/people/identity/activateStaffPortalAccess";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

const ACTIVE_ENTITY_COOKIE = "avantiqo_active_entity_id";

const MANAGE_ROLES = new Set([
  "OWNER",
  "ORGANIZATION_OWNER",
  "ORG_OWNER",
  "PLATFORM_OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "HR_ADMIN",
]);

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

function contextResponse(context) {
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

async function managementContext(request) {
  const resolved = await resolveAuthenticatedStaffContext({ request });

  if (!resolved.success) return { response: contextResponse(resolved) };

  const role = normalizeRole(resolved.role || resolved.staff?.role);
  if (!MANAGE_ROLES.has(role)) {
    return {
      response: NextResponse.json(
        { success: false, error: "Employee management permission required" },
        { status: 403 }
      ),
    };
  }

  return {
    role,
    staff: resolved.staff,
    organizationId: resolved.organizationId,
  };
}

function requestCookie(request, name) {
  const cookieHeader = String(request?.headers?.get?.("cookie") || "");

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      return decodeURIComponent(rawValue.join("=") || "").trim() || null;
    }
  }

  return null;
}

function resolveEntityId(request, explicitEntityId = null) {
  return (
    String(explicitEntityId || "").trim() ||
    requestCookie(request, ACTIVE_ENTITY_COOKIE) ||
    null
  );
}

function resolveRedirectOrigin(request) {
  const configuredOrigin = String(process.env.NEXT_PUBLIC_APP_URL || "").trim();

  if (configuredOrigin) {
    try {
      return new URL(configuredOrigin).origin;
    } catch {
      // Fall back to the current request origin.
    }
  }

  return new URL(request.url).origin;
}

function errorResponse(error, fallback = "Employee directory action failed") {
  const message = error?.message || fallback;
  const status = /not found/i.test(message)
    ? 404
    : /permission|required|cannot|already|inactive|workflow|legal entity|employment|first day/i.test(
          message
        )
      ? 400
      : 500;

  return NextResponse.json(
    { success: false, error: message, code: error?.code || null },
    { status }
  );
}

export async function GET(request) {
  try {
    const ctx = await managementContext(request);
    if (ctx.response) return ctx.response;

    const directory = await loadEmployeeDirectoryWithEmployment({
      organizationId: ctx.organizationId,
    });

    return NextResponse.json({
      success: true,
      organizationId: ctx.organizationId,
      activeEntityId: resolveEntityId(request),
      role: ctx.role,
      ...directory,
    });
  } catch (error) {
    console.error("PEOPLE_DIRECTORY_LIST_ERROR", error);
    return errorResponse(error, "Unable to load employee directory");
  }
}

export async function POST(request) {
  try {
    const ctx = await managementContext(request);
    if (ctx.response) return ctx.response;

    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "create_employee").trim().toLowerCase();

    if (action === "create_employee") {
      const result = await createEmployeeWithEmployment({
        organizationId: ctx.organizationId,
        name: body?.name,
        email: body?.email,
        position: body?.position,
        department: body?.department,
        entityId: resolveEntityId(request, body?.entityId),
        effectiveFrom: body?.effectiveFrom,
        actingStaffId: ctx.staff?.id || null,
      });

      return NextResponse.json({
        success: true,
        employee: result.staff,
        party: result.party,
        employment: result.employment,
        entity: result.entity,
        message:
          "Employee created with a legal employer assignment. Portal access and compensation can now be configured.",
      });
    }

    if (action === "send_activation") {
      const staffId = String(body?.staffId || "").trim();
      if (!staffId) {
        return NextResponse.json(
          { success: false, error: "staffId required" },
          { status: 400 }
        );
      }

      const redirectTo = new URL(
        "/login#type=recovery",
        resolveRedirectOrigin(request)
      ).toString();

      const activation = await activateStaffPortalAccess({
        staffId,
        organizationId: ctx.organizationId,
        redirectTo,
      });

      return NextResponse.json({
        success: true,
        activation,
        message: "Secure staff portal setup link sent.",
      });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported employee directory action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("PEOPLE_DIRECTORY_ACTION_ERROR", error);
    return errorResponse(error, "Unable to update employee directory");
  }
}

export async function PATCH(request) {
  try {
    const ctx = await managementContext(request);
    if (ctx.response) return ctx.response;

    const body = await request.json().catch(() => ({}));
    const staffId = String(body?.staffId || "").trim();
    const action = String(body?.action || "update_profile").trim().toLowerCase();

    if (!staffId) {
      return NextResponse.json(
        { success: false, error: "staffId required" },
        { status: 400 }
      );
    }

    if (action === "update_profile") {
      const result = await updateEmployeeRecord({
        organizationId: ctx.organizationId,
        staffId,
        name: body?.name,
        email: body?.email,
        position: body?.position,
        department: body?.department,
      });

      return NextResponse.json({
        success: true,
        employee: result.staff,
        party: result.party,
        message: "Employee profile updated.",
      });
    }

    if (action === "set_active") {
      const result = await setEmployeeActiveWithEmployment({
        organizationId: ctx.organizationId,
        staffId,
        active: body?.active,
        actingStaffId: ctx.staff?.id || null,
        entityId: body?.active
          ? resolveEntityId(request, body?.entityId)
          : body?.entityId || null,
        effectiveDate: body?.effectiveDate || null,
      });

      return NextResponse.json({
        success: true,
        employee: result.staff,
        employment: result.employment || null,
        entity: result.entity || null,
        message: body?.active
          ? "Employee reactivated with a legal employer assignment."
          : "Employee deactivated and legal employer assignment ended.",
      });
    }

    if (action === "transfer_entity") {
      const result = await transferEmployeeLegalEntity({
        organizationId: ctx.organizationId,
        staffId,
        entityId: body?.entityId,
        effectiveFrom: body?.effectiveFrom,
        actingStaffId: ctx.staff?.id || null,
        notes: body?.notes || null,
      });

      return NextResponse.json({
        success: true,
        employment: result.employment,
        entity: result.entity,
        message: "Legal employer transfer scheduled from the month boundary.",
      });
    }

    return NextResponse.json(
      { success: false, error: "Unsupported employee directory update" },
      { status: 400 }
    );
  } catch (error) {
    console.error("PEOPLE_DIRECTORY_UPDATE_ERROR", error);
    return errorResponse(error, "Unable to update employee");
  }
}
