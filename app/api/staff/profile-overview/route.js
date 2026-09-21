import { NextResponse } from "next/server";
import { staffApiErrorResponse } from "@/lib/people/portal/StaffApiError";

import resolveAuthenticatedStaffContext from "@/lib/people/runtime/resolveAuthenticatedStaffContext";
import { loadEmploymentAssignmentsForPeriod } from "@/lib/people/employees/employmentAssignmentService";
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

function maskedIdentifier(value, visible = 4) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  if (normalized.length <= visible) return normalized;
  return `${"•".repeat(Math.min(8, normalized.length - visible))}${normalized.slice(-visible)}`;
}

function compensationConfigured(profile) {
  if (!profile) return false;

  const salaryType = String(profile.salary_type || "").trim().toUpperCase();
  if (salaryType === "MONTHLY") return Number(profile.monthly_salary || 0) > 0;
  if (salaryType === "HOURLY") return Number(profile.hourly_rate || 0) > 0;
  return false;
}

export async function GET(request) {
  try {
    const context = await resolveAuthenticatedStaffContext({ request, allowIncompleteActivation: true });

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
      employmentAssignments,
    ] = await Promise.all([
      staff.party_id
        ? supabaseAdmin.from("parties").select("id,display_name,email,phone,address").eq("id", staff.party_id).eq("organization_id", organizationId).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin
        .from("employee_compensation_profiles")
        .select("id,entity_id,party_id,salary_type,monthly_salary,hourly_rate,payroll_frequency,currency,effective_from,effective_to")
        .eq("organization_id", organizationId)
        .eq("staff_account_id", staff.id)
        .lte("effective_from", businessDate)
        .or(`effective_to.is.null,effective_to.gte.${businessDate}`)
        .order("effective_from", { ascending: false }),
      supabaseAdmin
        .from("payroll_records")
        .select("id,entity_id,party_id,staff_id,payroll_month,status,payout_status,final_salary,gross_salary,deductions,tax_amount,social_security,base_salary,overtime_pay,service_charge_bonus,approved_hours,overtime_hours,worked_hours,leave_payout,payment_reference,payout_date,employee_acknowledged,employee_acknowledged_at,employee_dispute,dispute_resolved,dispute_resolution_notes,review_required,review_status,created_at")
        .eq("organization_id", organizationId)
        .eq("staff_id", staff.id)
        .order("payroll_month", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(24),
      supabaseAdmin
        .from("staff_schedules")
        .select("id,shift_date,start_time,end_time,status,shift_type,department,section")
        .eq("organization_id", organizationId)
        .eq("staff_id", staff.id)
        .gte("shift_date", businessDate)
        .lte("shift_date", scheduleEndDate)
        .order("shift_date", { ascending: true })
        .order("start_time", { ascending: true })
        .limit(30),
      supabaseAdmin
        .from("staff_attendance")
        .select("id,shift_date,actual_start,actual_end,attendance_status,late_minutes,created_at")
        .eq("organization_id", organizationId)
        .eq("staff_id", staff.id)
        .order("shift_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(30),
      supabaseAdmin
        .from("legal_entities")
        .select("id,legal_name,display_name,currency,is_default_accounting_entity,is_active")
        .eq("organization_id", organizationId),
      loadEmploymentAssignmentsForPeriod({
        organizationId,
        staffId: staff.id,
        startDate: businessDate,
        endDate: businessDate,
      }),
    ]);

    for (const result of [partyResult, compensationResult, payrollResult, scheduleResult, attendanceResult, entityResult]) {
      if (result.error) throw result.error;
    }

    const entities = entityResult.data || [];
    const entityById = new Map(entities.map((entity) => [entity.id, entity]));
    const payroll = (payrollResult.data || []).map((record) => {
      const entity = entityById.get(record.entity_id) || null;
      return {
        id: record.id,
        entity_id: record.entity_id || null,
        payroll_month: record.payroll_month || null,
        status: record.status || null,
        payout_status: record.payout_status || null,
        final_salary: record.final_salary ?? null,
        gross_salary: record.gross_salary ?? null,
        deductions: record.deductions ?? null,
        tax_amount: record.tax_amount ?? null,
        social_security: record.social_security ?? null,
        base_salary: record.base_salary ?? null,
        overtime_pay: record.overtime_pay ?? null,
        service_charge_bonus: record.service_charge_bonus ?? null,
        approved_hours: record.approved_hours ?? null,
        overtime_hours: record.overtime_hours ?? null,
        worked_hours: record.worked_hours ?? null,
        leave_payout: record.leave_payout ?? null,
        payment_reference: record.payment_reference || null,
        payout_date: record.payout_date || null,
        employee_acknowledged: record.employee_acknowledged === true,
        employee_acknowledged_at: record.employee_acknowledged_at || null,
        employee_dispute: record.employee_dispute || null,
        dispute_resolved: record.dispute_resolved === true,
        dispute_resolution_notes: record.dispute_resolution_notes || null,
        review_required: record.review_required === true,
        review_status: record.review_status || null,
        currency_code: normalizeCurrency(entity?.currency),
        legal_entity: entity
          ? {
              name: entity.display_name || entity.legal_name || "Legal entity",
              currency: normalizeCurrency(entity.currency),
            }
          : null,
      };
    });

    const currentEmployment =
      (employmentAssignments || []).find(
        (assignment) =>
          assignment.staff_account_id === staff.id &&
          assignment.party_id === staff.party_id &&
          assignment.effective_from <= businessDate &&
          (!assignment.effective_to || assignment.effective_to >= businessDate)
      ) || null;

    const currentEntity = currentEmployment
      ? entityById.get(currentEmployment.entity_id) || null
      : null;

    const activeProfiles = compensationResult.data || [];
    const selectedProfile = currentEmployment
      ? activeProfiles.find(
          (profile) =>
            profile.entity_id === currentEmployment.entity_id &&
            profile.party_id === staff.party_id
        ) || null
      : null;

    const compensation = selectedProfile
      ? {
          salary_type: selectedProfile.salary_type || null,
          monthly_salary: selectedProfile.monthly_salary ?? null,
          hourly_rate: selectedProfile.hourly_rate ?? null,
          payroll_frequency: selectedProfile.payroll_frequency || null,
          currency: normalizeCurrency(selectedProfile.currency),
          effective_from: selectedProfile.effective_from || null,
          effective_to: selectedProfile.effective_to || null,
          currency_code: normalizeCurrency(currentEntity?.currency) || normalizeCurrency(selectedProfile.currency),
          configured: compensationConfigured(selectedProfile),
          legal_entity: currentEntity
            ? {
                name: currentEntity.display_name || currentEntity.legal_name || "Legal entity",
                currency: normalizeCurrency(currentEntity.currency),
              }
            : null,
        }
      : null;

    return NextResponse.json({
      success: true,
      profile: {
        timezone: timeContext.timezone,
        businessDate,
        staff: {
          auth_linked: Boolean(staff.auth_user_id),
          name: staff.name || null,
          email: staff.email || null,
          role: staff.role || null,
          position: staff.position || null,
          department: staff.department || null,
          profile_picture: staff.profile_picture || null,
          payroll_frequency: staff.payroll_frequency || null,
          bank_name: staff.bank_name || null,
          bank_account_masked: maskedIdentifier(staff.bank_account),
          tax_id_masked: maskedIdentifier(staff.tax_id),
        },
        party: partyResult.data
          ? {
              display_name: partyResult.data.display_name || null,
              email: partyResult.data.email || null,
              phone: partyResult.data.phone || null,
              address: partyResult.data.address || null,
            }
          : null,
        employment: currentEmployment
          ? {
              effective_from: currentEmployment.effective_from || null,
              effective_to: currentEmployment.effective_to || null,
              legal_entity: currentEntity
                ? {
                    name: currentEntity.display_name || currentEntity.legal_name || "Legal entity",
                    currency: normalizeCurrency(currentEntity.currency),
                  }
                : null,
            }
          : null,
        compensation,
        payroll,
        upcomingSchedules: (scheduleResult.data || []).map((row) => ({
          id: row.id,
          shift_date: row.shift_date || null,
          start_time: row.start_time || null,
          end_time: row.end_time || null,
          status: row.status || null,
          shift_type: row.shift_type || null,
          department: row.department || null,
          section: row.section || null,
        })),
        recentAttendance: (attendanceResult.data || []).map((row) => ({
          id: row.id,
          shift_date: row.shift_date || null,
          actual_start: row.actual_start || null,
          actual_end: row.actual_end || null,
          attendance_status: row.attendance_status || null,
          late_minutes: row.late_minutes ?? 0,
        })),
      },
    });
  } catch (error) {
    console.error("STAFF_PROFILE_OVERVIEW_ERROR", error);

    return staffApiErrorResponse(error, "Unable to load staff profile");
  }
}
