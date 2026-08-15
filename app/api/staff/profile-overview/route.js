import { NextResponse } from "next/server";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import {
  localDateString,
  resolveOrganizationTimeContext,
} from "@/lib/shared/time/organizationTime";

function addDays(dateValue, days) {
  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeCurrency(value) {
  const currency = String(value || "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(currency) ? currency : null;
}

function compensationConfigured(profile) {
  if (!profile) return false;

  const salaryType = String(profile.salary_type || "").trim().toUpperCase();
  if (salaryType === "MONTHLY") {
    return Number(profile.monthly_salary || 0) > 0;
  }
  if (salaryType === "HOURLY") {
    return Number(profile.hourly_rate || 0) > 0;
  }

  return false;
}

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request });

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

    const { staff, organizationId } = context;
    const timeContext = await resolveOrganizationTimeContext({ organizationId });
    const businessDate = localDateString(new Date(), timeContext.timezone);
    const scheduleEndDate = addDays(businessDate, 14);

    const [
      partyResult,
      compensationResult,
      payrollResult,
      scheduleResult,
      attendanceResult,
      entityResult,
    ] = await Promise.all([
      staff.party_id
        ? supabaseAdmin
            .from("parties")
            .select("*")
            .eq("id", staff.party_id)
            .eq("organization_id", organizationId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin
        .from("employee_compensation_profiles")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("staff_account_id", staff.id)
        .lte("effective_from", businessDate)
        .or(`effective_to.is.null,effective_to.gte.${businessDate}`)
        .order("effective_from", { ascending: false }),
      supabaseAdmin
        .from("payroll_records")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("staff_id", staff.id)
        .order("payroll_month", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(24),
      supabaseAdmin
        .from("staff_schedules")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("staff_id", staff.id)
        .gte("shift_date", businessDate)
        .lte("shift_date", scheduleEndDate)
        .order("shift_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(30),
      supabaseAdmin
        .from("staff_attendance")
        .select("*")
        .eq("organization_id", organizationId)
        .eq("staff_id", staff.id)
        .order("shift_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30),
      supabaseAdmin
        .from("legal_entities")
        .select("id,legal_name,display_name,currency,is_default_accounting_entity,is_active")
        .eq("organization_id", organizationId),
    ]);

    for (const result of [
      partyResult,
      compensationResult,
      payrollResult,
      scheduleResult,
      attendanceResult,
      entityResult,
    ]) {
      if (result.error) throw result.error;
    }

    const entities = entityResult.data || [];
    const entityById = new Map(entities.map((entity) => [entity.id, entity]));
    const payroll = (payrollResult.data || []).map((record) => {
      const entity = entityById.get(record.entity_id) || null;
      return {
        ...record,
        currency_code: normalizeCurrency(entity?.currency),
        legal_entity: entity
          ? {
              id: entity.id,
              name: entity.display_name || entity.legal_name || entity.id,
              currency: normalizeCurrency(entity.currency),
            }
          : null,
      };
    });

    const activeProfiles = compensationResult.data || [];
    const latestPayrollEntityId = payroll[0]?.entity_id || null;
    const defaultEntity = entities.find(
      (entity) => entity.is_active !== false && entity.is_default_accounting_entity === true
    );

    const selectedProfile =
      activeProfiles.find((profile) => profile.entity_id === latestPayrollEntityId) ||
      (activeProfiles.length === 1 ? activeProfiles[0] : null) ||
      activeProfiles.find((profile) => profile.entity_id === defaultEntity?.id) ||
      activeProfiles[0] ||
      null;

    const selectedEntity = selectedProfile
      ? entityById.get(selectedProfile.entity_id) || null
      : null;

    const compensation = selectedProfile
      ? {
          ...selectedProfile,
          currency_code:
            normalizeCurrency(selectedEntity?.currency) ||
            normalizeCurrency(selectedProfile.currency),
          configured: compensationConfigured(selectedProfile),
          legal_entity: selectedEntity
            ? {
                id: selectedEntity.id,
                name:
                  selectedEntity.display_name ||
                  selectedEntity.legal_name ||
                  selectedEntity.id,
                currency: normalizeCurrency(selectedEntity.currency),
              }
            : null,
        }
      : null;

    return NextResponse.json({
      success: true,
      profile: {
        organizationId,
        availableOrganizationIds: context.availableOrganizationIds || [],
        timezone: timeContext.timezone,
        businessDate,
        staff,
        party: partyResult.data || null,
        compensation,
        payroll,
        upcomingSchedules: scheduleResult.data || [],
        recentAttendance: attendanceResult.data || [],
      },
    });
  } catch (error) {
    console.error("STAFF_PROFILE_OVERVIEW_ERROR", error);

    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to load staff profile",
      },
      { status: 500 }
    );
  }
}
