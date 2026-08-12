import { NextResponse } from "next/server";

import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";
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

const BOOLEAN_KEYS = [
  "manager_approval_required",
  "use_schedule_expected_hours",
  "salary_proration_enabled",
  "lateness_deduction_enabled",
  "training_counts_as_worked",
  "sick_leave_counts_as_worked",
  "approved_leave_counts_as_worked",
  "public_holiday_counts_as_worked",
];

function normalizeRole(value) {
  return String(value || "").trim().toUpperCase();
}

function finiteNumber(value, label, { min = 0, max = null, required = false } = {}) {
  if (value === "" || value === null || typeof value === "undefined") {
    if (required) throw new Error(`${label} is required`);
    return undefined;
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number < min) {
    throw new Error(`${label} must be at least ${min}`);
  }
  if (max !== null && number > max) {
    throw new Error(`${label} must not exceed ${max}`);
  }

  return number;
}

export async function POST(request) {
  try {
    const body = await request.json();

    const context = await resolveAuthenticatedStaffContext({
      request,
      organizationId: body?.organizationId || body?.organization_id || null,
    });

    if (!context.success) {
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

    const incoming = nestedSettings || flatSettings;
    const country = String(incoming?.country || "").trim();
    const currency = String(incoming?.currency || "").trim().toUpperCase();

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

    const defaultHoursPerShift = finiteNumber(
      incoming?.default_hours_per_shift,
      "Default hours per shift",
      { min: 0.01, max: 24, required: true }
    );
    const defaultWorkingDaysPerWeek = finiteNumber(
      incoming?.default_working_days_per_week,
      "Default working days per week",
      { min: 0.01, max: 7, required: true }
    );
    const varianceThresholdHours = finiteNumber(
      incoming?.variance_threshold_hours,
      "Variance threshold hours",
      { min: 0 }
    );

    const existing = await loadOperationalSettings({
      organizationId: context.organizationId,
      domain: "PAYROLL",
    });

    const settings = {
      ...existing,
      ...incoming,
      country,
      currency,
      default_hours_per_shift: defaultHoursPerShift,
      default_working_days_per_week: defaultWorkingDaysPerWeek,
      variance_threshold_hours: varianceThresholdHours ?? 0,
    };

    for (const key of BOOLEAN_KEYS) {
      if (Object.prototype.hasOwnProperty.call(incoming || {}, key)) {
        settings[key] = Boolean(incoming[key]);
      }
    }

    const result = await saveOperationalSettings({
      organizationId: context.organizationId,
      domain: "PAYROLL",
      settings,
    });

    return NextResponse.json({
      success: true,
      organizationId: context.organizationId,
      settings: result?.settings || settings,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to save payroll settings",
      },
      { status: 400 }
    );
  }
}
