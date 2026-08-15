export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import { NextResponse } from "next/server";

import {
  createEmployeeRecord,
  loadEmployeeDirectory,
  setEmployeeActiveStatus,
  updateEmployeeRecord,
} from "@/lib/people/employees/employeeDirectoryService";
import activateStaffPortalAccess from "@/lib/people/identity/activateStaffPortalAccess";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

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

  if (!resolved.success) {
    return { response: contextResponse(resolved) };
  }

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
    : /permission|required|cannot|already|inactive|workflow/i.test(message)
      ? 400
      : 500;

  return NextResponse.json(
    { success: false, error: message },
    { status }
  );
}

export async function GET(request) {
  try {
    const ctx = await managementContext(request);
    if (ctx.response) return ctx.response;

    const directory = await loadEmployeeDirectory({
      organizationId: ctx.organizationId,
    });

    return NextResponse.json({
      success: true,
      organizationId: ctx.organizationId,
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
      const result = await createEmployeeRecord({
        organizationId: ctx.organizationId,
        name: body?.name,
        email: body?.email,
        position: body?.position,
        department: body?.department,
      });

      return NextResponse.json({
        success: true,
        employee: result.staff,
        party: result.party,
        message: "Employee created. Portal access and compensation can now be configured separately.",
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
      const result = await setEmployeeActiveStatus({
        organizationId: ctx.organizationId,
        staffId,
        active: body?.active,
        actingStaffId: ctx.staff?.id || null,
      });

      return NextResponse.json({
        success: true,
        employee: result.staff,
        message: body?.active ? "Employee reactivated." : "Employee deactivated.",
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
