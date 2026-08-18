import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function cleanText(value) {
  const text = String(value ?? "").trim();
  return text || null;
}

function dateOnly(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export async function getEmployeeOperationalEligibility({
  organizationId,
  staffId,
  entityId = null,
  at = new Date(),
}) {
  const organization_id = cleanText(organizationId);
  const staff_id = cleanText(staffId);
  const entity_id = cleanText(entityId);

  if (!organization_id || !staff_id) {
    return Object.freeze({
      eligible: false,
      reason: "organization-and-staff-required",
      employee: null,
      employment: null,
    });
  }

  const { data: employee, error: employeeError } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,name,position,department,active,active_organization_id")
    .eq("id", staff_id)
    .eq("active_organization_id", organization_id)
    .maybeSingle();

  if (employeeError) throw employeeError;
  if (!employee) {
    return Object.freeze({
      eligible: false,
      reason: "employee-not-in-organization",
      employee: null,
      employment: null,
    });
  }

  if (employee.active === false) {
    return Object.freeze({
      eligible: false,
      reason: "employee-inactive",
      employee,
      employment: null,
    });
  }

  const effectiveDate = dateOnly(at);
  let employmentQuery = supabaseAdmin
    .from("employee_employment_assignments")
    .select("id,organization_id,entity_id,staff_account_id,effective_from,effective_to,status")
    .eq("organization_id", organization_id)
    .eq("staff_account_id", staff_id)
    .lte("effective_from", effectiveDate)
    .or(`effective_to.is.null,effective_to.gte.${effectiveDate}`)
    .order("effective_from", { ascending: false })
    .limit(1);

  if (entity_id) employmentQuery = employmentQuery.eq("entity_id", entity_id);

  const { data: employments, error: employmentError } = await employmentQuery;
  if (employmentError) throw employmentError;

  const employment = employments?.[0] || null;
  if (!employment) {
    return Object.freeze({
      eligible: false,
      reason: entity_id ? "no-active-employment-in-entity" : "no-active-employment",
      employee,
      employment: null,
    });
  }

  if (cleanText(employment.status)?.toLowerCase() === "inactive") {
    return Object.freeze({
      eligible: false,
      reason: "employment-inactive",
      employee,
      employment,
    });
  }

  return Object.freeze({
    eligible: true,
    reason: "eligible",
    employee,
    employment,
  });
}

export default getEmployeeOperationalEligibility;
