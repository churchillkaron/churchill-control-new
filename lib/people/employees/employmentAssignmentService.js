import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function required(value, name) {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${name} required`);
  return normalized;
}

function validDate(value, name) {
  const normalized = required(value, name);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error(`${name} must use YYYY-MM-DD format`);
  }
  return normalized;
}

export function payrollMonthRange(payrollMonth) {
  const month = required(payrollMonth, "payrollMonth");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("payrollMonth must use YYYY-MM format");
  }

  const start = `${month}-01`;
  const nextMonth = new Date(`${start}T00:00:00.000Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const endExclusive = nextMonth.toISOString().slice(0, 10);
  nextMonth.setUTCDate(0);

  return {
    start,
    end: nextMonth.toISOString().slice(0, 10),
    endExclusive,
  };
}

export async function loadEmploymentAssignmentsForPeriod({
  organizationId,
  entityId = null,
  staffId = null,
  startDate,
  endDate,
}) {
  const organization = required(organizationId, "organizationId");
  const start = validDate(startDate, "startDate");
  const end = validDate(endDate, "endDate");

  if (end < start) throw new Error("endDate must not be before startDate");

  let query = supabaseAdmin
    .from("employee_employment_assignments")
    .select(
      "id,organization_id,entity_id,staff_account_id,party_id,effective_from,effective_to,status,source_type,source_reference,notes,created_by_staff_id,ended_by_staff_id,ended_at,created_at,updated_at"
    )
    .eq("organization_id", organization)
    .lte("effective_from", end)
    .or(`effective_to.is.null,effective_to.gte.${start}`)
    .order("effective_from", { ascending: true });

  if (entityId) query = query.eq("entity_id", entityId);
  if (staffId) query = query.eq("staff_account_id", staffId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function loadEmploymentCohort({
  organizationId,
  entityId,
  startDate,
  endDate,
}) {
  const organization = required(organizationId, "organizationId");
  const entity = required(entityId, "entityId");
  const start = validDate(startDate, "startDate");
  const end = validDate(endDate, "endDate");

  const assignments = await loadEmploymentAssignmentsForPeriod({
    organizationId: organization,
    entityId: entity,
    startDate: start,
    endDate: end,
  });

  const staffIds = [...new Set(assignments.map((row) => row.staff_account_id).filter(Boolean))];
  if (!staffIds.length) {
    return {
      assignments,
      staff: [],
      staffIds: [],
      fullPeriodStaffIds: [],
      partialPeriodStaffIds: [],
      assignmentByStaff: new Map(),
    };
  }

  const { data: staffRows, error } = await supabaseAdmin
    .from("staff_accounts")
    .select("id,name,email,role,department,position,party_id,active,active_organization_id")
    .eq("active_organization_id", organization)
    .eq("active", true)
    .in("id", staffIds);

  if (error) throw error;

  const assignmentByStaff = new Map();
  for (const assignment of assignments) {
    if (!assignmentByStaff.has(assignment.staff_account_id)) {
      assignmentByStaff.set(assignment.staff_account_id, assignment);
    }
  }

  const staff = (staffRows || []).filter((member) => {
    const assignment = assignmentByStaff.get(member.id);
    return Boolean(assignment && assignment.party_id === member.party_id);
  });

  const fullPeriodStaffIds = [];
  const partialPeriodStaffIds = [];

  for (const member of staff) {
    const assignment = assignmentByStaff.get(member.id);
    const coversStart = assignment.effective_from <= start;
    const coversEnd = !assignment.effective_to || assignment.effective_to >= end;

    if (coversStart && coversEnd) fullPeriodStaffIds.push(member.id);
    else partialPeriodStaffIds.push(member.id);
  }

  return {
    assignments,
    staff,
    staffIds: staff.map((member) => member.id),
    fullPeriodStaffIds,
    partialPeriodStaffIds,
    assignmentByStaff,
  };
}

export async function assignEmployeeEmploymentEntity({
  organizationId,
  staffId,
  entityId,
  effectiveFrom,
  actorStaffId,
  notes = null,
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "assign_employee_employment_entity_atomic",
    {
      p_organization_id: required(organizationId, "organizationId"),
      p_staff_account_id: required(staffId, "staffId"),
      p_entity_id: required(entityId, "entityId"),
      p_effective_from: validDate(effectiveFrom, "effectiveFrom"),
      p_actor_staff_id: required(actorStaffId, "actorStaffId"),
      p_notes: String(notes || "").trim() || null,
    }
  );

  if (error) throw error;
  return data;
}

export async function endEmployeeEmploymentAssignment({
  organizationId,
  staffId,
  effectiveTo,
  actorStaffId,
}) {
  const { data, error } = await supabaseAdmin.rpc(
    "end_employee_employment_assignment_atomic",
    {
      p_organization_id: required(organizationId, "organizationId"),
      p_staff_account_id: required(staffId, "staffId"),
      p_effective_to: validDate(effectiveTo, "effectiveTo"),
      p_actor_staff_id: required(actorStaffId, "actorStaffId"),
    }
  );

  if (error) throw error;
  return data;
}
