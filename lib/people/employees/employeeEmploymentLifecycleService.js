import {
  createEmployeeRecord,
  loadEmployeeDirectory,
  setEmployeeActiveStatus,
} from "@/lib/people/employees/employeeDirectoryService";
import {
  assignEmployeeEmploymentEntity,
  endEmployeeEmploymentAssignment,
} from "@/lib/people/employees/employmentAssignmentService";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";

function dateValue(value, fallback = null) {
  const normalized = String(value || fallback || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    throw new Error("Employment effective date must use YYYY-MM-DD format");
  }
  return normalized;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function assertActiveEntity({ organizationId, entityId }) {
  const id = String(entityId || "").trim();

  let query = supabaseAdmin
    .from("legal_entities")
    .select("id,legal_name,display_name,code,country,currency,is_default_accounting_entity")
    .eq("organization_id", organizationId)
    .eq("is_active", true);

  if (id) {
    const { data, error } = await query.eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Legal entity is not active in this organization");
    return data;
  }

  const { data, error } = await query
    .order("is_default_accounting_entity", { ascending: false })
    .order("legal_name", { ascending: true })
    .limit(2);

  if (error) throw error;
  const entities = data || [];
  if (!entities.length) {
    throw new Error("No active legal entity is configured for employee employment");
  }
  if (entities.length > 1) {
    throw new Error(
      "Legal entity selection is required because this organization has multiple active legal entities"
    );
  }
  return entities[0];
}

export async function loadEmployeeDirectoryWithEmployment({ organizationId }) {
  const directory = await loadEmployeeDirectory({ organizationId });
  const date = today();

  const [assignmentResult, entityResult] = await Promise.all([
    supabaseAdmin
      .from("employee_employment_assignments")
      .select("id,entity_id,staff_account_id,party_id,effective_from,effective_to,status,source_type")
      .eq("organization_id", organizationId)
      .lte("effective_from", date)
      .or(`effective_to.is.null,effective_to.gte.${date}`),
    supabaseAdmin
      .from("legal_entities")
      .select("id,legal_name,display_name,code,country,currency,is_active,is_default_accounting_entity")
      .eq("organization_id", organizationId)
      .order("is_default_accounting_entity", { ascending: false })
      .order("legal_name", { ascending: true }),
  ]);

  if (assignmentResult.error) throw assignmentResult.error;
  if (entityResult.error) throw entityResult.error;

  const entityById = new Map((entityResult.data || []).map((entity) => [entity.id, entity]));
  const assignmentByStaff = new Map(
    (assignmentResult.data || []).map((assignment) => [
      String(assignment.staff_account_id),
      assignment,
    ])
  );

  const employees = (directory.employees || []).map((employee) => {
    const assignment = assignmentByStaff.get(String(employee.id)) || null;
    const entity = assignment ? entityById.get(assignment.entity_id) || null : null;

    return {
      ...employee,
      employment: assignment
        ? {
            ...assignment,
            entity: entity
              ? {
                  id: entity.id,
                  name: entity.display_name || entity.legal_name || entity.code || entity.id,
                  code: entity.code || null,
                  country: entity.country || null,
                  currency: entity.currency || null,
                }
              : null,
          }
        : null,
    };
  });

  const activeEmployees = employees.filter((employee) => employee.active !== false);

  return {
    ...directory,
    employees,
    entities: (entityResult.data || []).filter((entity) => entity.is_active !== false),
    summary: {
      ...(directory.summary || {}),
      employmentUnassigned: activeEmployees.filter((employee) => !employee.employment).length,
    },
  };
}

export async function createEmployeeWithEmployment({
  organizationId,
  name,
  email,
  position = null,
  department = null,
  entityId,
  effectiveFrom = null,
  actingStaffId,
}) {
  const entity = await assertActiveEntity({ organizationId, entityId });
  const effectiveDate = dateValue(effectiveFrom, today());
  if (!actingStaffId) throw new Error("Authenticated staff actor is required");

  const created = await createEmployeeRecord({
    organizationId,
    name,
    email,
    position,
    department,
  });

  try {
    const employment = await assignEmployeeEmploymentEntity({
      organizationId,
      staffId: created.staff.id,
      entityId: entity.id,
      effectiveFrom: effectiveDate,
      actorStaffId: actingStaffId,
      notes: "Initial legal employer assignment",
    });

    return { ...created, employment, entity };
  } catch (error) {
    try {
      await setEmployeeActiveStatus({
        organizationId,
        staffId: created.staff.id,
        active: false,
        actingStaffId,
      });
    } catch {
      // The original assignment failure is the actionable error.
    }
    throw error;
  }
}

export async function setEmployeeActiveWithEmployment({
  organizationId,
  staffId,
  active,
  actingStaffId,
  entityId = null,
  effectiveDate = null,
}) {
  if (active) {
    const entity = await assertActiveEntity({ organizationId, entityId });
    const startDate = dateValue(effectiveDate, today());

    const result = await setEmployeeActiveStatus({
      organizationId,
      staffId,
      active: true,
      actingStaffId,
    });

    try {
      const employment = await assignEmployeeEmploymentEntity({
        organizationId,
        staffId,
        entityId: entity.id,
        effectiveFrom: startDate,
        actorStaffId: actingStaffId,
        notes: "Employee reactivation legal employer assignment",
      });
      return { ...result, employment, entity };
    } catch (error) {
      try {
        await setEmployeeActiveStatus({
          organizationId,
          staffId,
          active: false,
          actingStaffId,
        });
      } catch {
        // Preserve the assignment error.
      }
      throw error;
    }
  }

  const endDate = dateValue(effectiveDate, today());
  const result = await setEmployeeActiveStatus({
    organizationId,
    staffId,
    active: false,
    actingStaffId,
  });

  await endEmployeeEmploymentAssignment({
    organizationId,
    staffId,
    effectiveTo: endDate,
    actorStaffId: actingStaffId,
  });

  return result;
}

export async function transferEmployeeLegalEntity({
  organizationId,
  staffId,
  entityId,
  effectiveFrom,
  actingStaffId,
  notes = null,
}) {
  const entity = await assertActiveEntity({ organizationId, entityId });
  const startDate = dateValue(effectiveFrom);

  if (!startDate.endsWith("-01")) {
    throw new Error(
      "Legal-employer transfers must start on the first day of a month until split-period payroll is supported"
    );
  }

  const employment = await assignEmployeeEmploymentEntity({
    organizationId,
    staffId,
    entityId: entity.id,
    effectiveFrom: startDate,
    actorStaffId: actingStaffId,
    notes,
  });

  return { employment, entity };
}
