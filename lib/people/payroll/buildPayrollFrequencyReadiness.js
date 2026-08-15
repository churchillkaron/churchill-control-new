import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const SUPPORTED_PAYROLL_FREQUENCY = "MONTHLY";

function monthRange(payrollMonth) {
  const start = `${payrollMonth}-01`;
  const end = new Date(`${start}T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);

  const monthEnd = new Date(end);
  monthEnd.setUTCDate(0);

  return {
    start,
    end: end.toISOString().slice(0, 10),
    monthEnd: monthEnd.toISOString().slice(0, 10),
  };
}

export default async function buildPayrollFrequencyReadiness({
  organizationId,
  entityId,
  payrollMonth,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  if (!/^\d{4}-\d{2}$/.test(String(payrollMonth || ""))) {
    throw new Error("payrollMonth must use YYYY-MM format");
  }

  const range = monthRange(payrollMonth);
  const { data, error } = await supabaseAdmin
    .from("employee_compensation_profiles")
    .select("staff_account_id,payroll_frequency,effective_from,effective_to")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .lte("effective_from", range.monthEnd)
    .or(`effective_to.is.null,effective_to.gte.${range.start}`);

  if (error) throw error;

  const unsupported = (data || []).filter(
    (profile) =>
      String(profile.payroll_frequency || "").trim().toUpperCase() !==
      SUPPORTED_PAYROLL_FREQUENCY
  );

  if (!unsupported.length) {
    return {
      supportedPayrollFrequency: SUPPORTED_PAYROLL_FREQUENCY,
      unsupportedCount: 0,
      affectedStaffIds: [],
      blocker: null,
    };
  }

  const affectedStaffIds = [
    ...new Set(unsupported.map((profile) => profile.staff_account_id).filter(Boolean)),
  ];

  return {
    supportedPayrollFrequency: SUPPORTED_PAYROLL_FREQUENCY,
    unsupportedCount: unsupported.length,
    affectedStaffIds,
    blocker: {
      code: "PAYROLL_FREQUENCY_UNSUPPORTED",
      message: `${unsupported.length} effective compensation profile${unsupported.length === 1 ? " uses" : "s use"} a payroll frequency that the current monthly payroll engine does not support. Set payroll frequency to MONTHLY before preview or generation.`,
      count: unsupported.length,
      affectedStaff: affectedStaffIds.map((staffId) => ({ staffId })),
    },
  };
}
