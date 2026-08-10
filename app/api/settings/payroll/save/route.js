import { NextResponse } from "next/server";

import saveOperationalSettings from "@/lib/settings/saveOperationalSettings";
import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";

const MANAGE_ROLES = new Set([
  "OWNER",
  "SUPER_ADMIN",
  "MANAGER",
  "HR_ADMIN",
  "PAYROLL_ADMIN",
  "ACCOUNTING_ADMIN",
]);

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

export async function POST(request) {
  try {
    const body = await request.json();

    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId:
        body?.organizationId || body?.organization_id || null,
    });

    if (!context.success) {
      return NextResponse.json(
        {
          success: false,
          error: context.error,
          code: context.code,
          availableOrganizationIds:
            context.availableOrganizationIds || [],
        },
        { status: context.status || 403 }
      );
    }

    const role = normalizeRole(context.role || context.staff?.role);

    if (!MANAGE_ROLES.has(role)) {
      return NextResponse.json(
        {
          success: false,
          error: "Payroll settings management permission required",
          code: "PAYROLL_SETTINGS_PERMISSION_REQUIRED",
        },
        { status: 403 }
      );
    }

    const {
      organizationId,
      organization_id,
      settings: nestedSettings,
      ...flatSettings
    } = body || {};

    const settings = nestedSettings || flatSettings;
    const country = String(settings?.country || "").trim();
    const currency = String(settings?.currency || "").trim().toUpperCase();

    if (!country) {
      return NextResponse.json(
        { success: false, error: "Payroll country is required" },
        { status: 400 }
      );
    }

    if (!/^[A-Z]{3}$/.test(currency)) {
      return NextResponse.json(
        { success: false, error: "Payroll currency must be a 3-letter code" },
        { status: 400 }
      );
    }

    const result = await saveOperationalSettings({
      organizationId: context.organizationId,
      domain: "PAYROLL",
      settings: {
        ...settings,
        country,
        currency,
      },
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      settings: result?.settings || {},
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to save payroll settings",
      },
      { status: 500 }
    );
  }
}
