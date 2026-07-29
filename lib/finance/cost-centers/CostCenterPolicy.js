import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TYPES = new Set([
  "OPERATIONAL",
  "ADMINISTRATIVE",
  "SALES",
  "SERVICE",
  "PROJECT",
  "SHARED_SERVICE",
  "OTHER",
]);

const MISSING_SCHEMA_CODES = new Set([
  "42P01",
  "42703",
  "PGRST204",
  "PGRST205",
]);

function text(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function upper(value) {
  return text(value)?.toUpperCase() || null;
}

function normalizeCode(value) {
  const code = upper(value);
  if (!code) throw new Error("Cost Centre Code required");
  if (!/^[A-Z0-9][A-Z0-9._/-]{0,31}$/.test(code)) {
    throw new Error(
      "Cost Centre Code must use 1-32 letters, numbers, dot, dash, slash or underscore"
    );
  }
  return code;
}

function normalizeName(value) {
  const name = text(value);
  if (!name) throw new Error("Cost Centre Name required");
  if (name.length > 160) {
    throw new Error("Cost Centre Name cannot exceed 160 characters");
  }
  return name;
}

function normalizeType(value) {
  const type = upper(value || "OPERATIONAL");
  if (!TYPES.has(type)) {
    throw new Error("Select a supported Cost Centre Type");
  }
  return type;
}

function active(row = {}) {
  if (row.is_active === false || row.active === false || row.enabled === false) {
    return false;
  }
  return !["INACTIVE", "ARCHIVED", "DISABLED", "SUSPENDED"].includes(
    upper(row.status) || "ACTIVE"
  );
}

async function getCostCenter({ organizationId, costCenterId }) {
  if (!costCenterId) return null;
  const { data, error } = await supabaseAdmin
    .from("cost_centers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", costCenterId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Cost Centre not found");
  return data;
}

async function requireEntity({ organizationId, entityId }) {
  if (!entityId) throw new Error("Legal Entity required");
  const { data, error } = await supabaseAdmin
    .from("legal_entities")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", entityId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Legal Entity is outside organisation scope");
  if (!active(data)) throw new Error("Legal Entity is inactive");
  return data;
}

async function requireDepartment({ organizationId, entityId, departmentId }) {
  if (!departmentId) return null;
  const { data, error } = await supabaseAdmin
    .from("departments")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", departmentId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Department is outside organisation scope");
  if (data.entity_id && String(data.entity_id) !== String(entityId)) {
    throw new Error("Department belongs to another Legal Entity");
  }
  if (!active(data)) throw new Error("Department is inactive");
  return data;
}

async function requireManager({ organizationId, managerUserId }) {
  if (!managerUserId) return null;
  const { data: staff, error: staffError } = await supabaseAdmin
    .from("staff_accounts")
    .select("*")
    .eq("auth_user_id", managerUserId)
    .maybeSingle();
  if (staffError) throw staffError;
  if (!staff || !active(staff)) {
    throw new Error("Cost Centre Manager must be an active staff member");
  }

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("organization_users")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("staff_account_id", staff.id)
    .limit(1)
    .maybeSingle();
  if (membershipError) throw membershipError;

  if (
    !membership &&
    String(staff.active_organization_id || staff.organization_id || "") !==
      String(organizationId)
  ) {
    throw new Error("Cost Centre Manager is outside organisation scope");
  }
  if (membership && !active(membership)) {
    throw new Error("Cost Centre Manager membership is inactive");
  }
  return staff;
}

async function requireParent({
  organizationId,
  entityId,
  costCenterId,
  parentCostCenterId,
}) {
  if (!parentCostCenterId) return null;
  if (costCenterId && String(costCenterId) === String(parentCostCenterId)) {
    throw new Error("A Cost Centre cannot be its own parent");
  }

  const { data, error } = await supabaseAdmin
    .from("cost_centers")
    .select("id, entity_id, parent_cost_center_id, is_active")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId);
  if (error) throw error;

  const byId = new Map((data || []).map((row) => [String(row.id), row]));
  let current = byId.get(String(parentCostCenterId));
  if (!current) {
    throw new Error("Parent Cost Centre is outside the selected Legal Entity");
  }
  if (!active(current)) throw new Error("Parent Cost Centre is inactive");

  const visited = new Set();
  while (current) {
    const id = String(current.id);
    if (visited.has(id)) {
      throw new Error("Existing Cost Centre hierarchy contains a cycle");
    }
    visited.add(id);
    if (costCenterId && id === String(costCenterId)) {
      throw new Error("Cost Centre hierarchy cannot contain a cycle");
    }
    current = current.parent_cost_center_id
      ? byId.get(String(current.parent_cost_center_id)) || null
      : null;
  }
}

async function findDuplicate({
  organizationId,
  entityId,
  code,
  excludeId,
}) {
  let query = supabaseAdmin
    .from("cost_centers")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .ilike("code", code)
    .limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

async function countAccountingUsage({ organizationId, costCenterId }) {
  const sources = [
    ["journal_entry_lines", "cost_center_id"],
    ["general_ledger", "cost_center_id"],
    ["vendor_invoice_lines", "cost_center_id"],
    ["customer_invoice_lines", "cost_center_id"],
  ];
  let total = 0;
  for (const [table, column] of sources) {
    const { count, error } = await supabaseAdmin
      .from(table)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq(column, costCenterId);
    if (error) {
      if (MISSING_SCHEMA_CODES.has(String(error.code || ""))) continue;
      throw error;
    }
    total += count || 0;
  }
  return total;
}

export async function upsertFinanceCostCenter({
  organizationId,
  payload = {},
  actorId,
}) {
  if (!organizationId) throw new Error("organizationId required");

  const costCenterId = text(
    payload.id || payload.cost_center_id || payload.costCenterId
  );
  const existing = await getCostCenter({ organizationId, costCenterId });
  const entityId = text(
    payload.entity_id || payload.entityId || existing?.entity_id
  );
  const code = normalizeCode(
    payload.code !== undefined ? payload.code : existing?.code
  );
  const name = normalizeName(
    payload.name !== undefined ? payload.name : existing?.name
  );
  const type = normalizeType(
    payload.type !== undefined ? payload.type : existing?.type
  );
  const parentCostCenterId = text(
    payload.parent_cost_center_id !== undefined
      ? payload.parent_cost_center_id
      : payload.parentCostCenterId !== undefined
        ? payload.parentCostCenterId
        : existing?.parent_cost_center_id
  );
  const departmentId = text(
    payload.department_id !== undefined
      ? payload.department_id
      : payload.departmentId !== undefined
        ? payload.departmentId
        : existing?.department_id
  );
  const managerUserId = text(
    payload.manager_user_id !== undefined
      ? payload.manager_user_id
      : payload.managerUserId !== undefined
        ? payload.managerUserId
        : existing?.manager_user_id
  );
  const description = text(
    payload.description !== undefined
      ? payload.description
      : existing?.description
  );
  const isActive =
    payload.is_active !== undefined
      ? Boolean(payload.is_active)
      : existing?.is_active !== false;

  await requireEntity({ organizationId, entityId });
  await requireDepartment({ organizationId, entityId, departmentId });
  const manager = await requireManager({ organizationId, managerUserId });
  await requireParent({
    organizationId,
    entityId,
    costCenterId: existing?.id,
    parentCostCenterId,
  });

  if (
    await findDuplicate({
      organizationId,
      entityId,
      code,
      excludeId: existing?.id,
    })
  ) {
    throw new Error("Cost Centre Code already exists in this Legal Entity");
  }

  if (
    existing &&
    (String(existing.entity_id || "") !== String(entityId) ||
      upper(existing.code) !== code)
  ) {
    const usage = await countAccountingUsage({
      organizationId,
      costCenterId: existing.id,
    });
    if (usage > 0) {
      throw new Error(
        "Cost Centre Code and Legal Entity cannot change after accounting use"
      );
    }
  }

  const now = new Date().toISOString();
  const record = {
    organization_id: organizationId,
    entity_id: entityId,
    code,
    name,
    type,
    parent_cost_center_id: parentCostCenterId,
    department_id: departmentId,
    manager_user_id: managerUserId,
    manager: text(manager?.name) || text(manager?.email),
    description,
    is_active: isActive,
    updated_by: actorId || null,
    updated_at: now,
  };

  const query = existing
    ? supabaseAdmin
        .from("cost_centers")
        .update(record)
        .eq("organization_id", organizationId)
        .eq("id", existing.id)
    : supabaseAdmin.from("cost_centers").insert({
        ...record,
        created_by: actorId || null,
        created_at: now,
      });

  const { data, error } = await query.select().single();
  if (error) throw error;

  return { success: true, created: !existing, costCenter: data };
}

export async function setFinanceCostCenterActive({
  organizationId,
  costCenterId,
  isActive,
  actorId,
}) {
  if (!organizationId) throw new Error("organizationId required");
  const existing = await getCostCenter({ organizationId, costCenterId });
  const desired = Boolean(isActive);

  if (!desired) {
    const { count, error } = await supabaseAdmin
      .from("cost_centers")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("entity_id", existing.entity_id)
      .eq("parent_cost_center_id", existing.id)
      .or("is_active.eq.true,is_active.is.null");
    if (error) throw error;
    if ((count || 0) > 0) {
      throw new Error("Deactivate or reassign active child Cost Centres first");
    }
  }

  if (existing.is_active === desired) {
    return { success: true, changed: false, costCenter: existing };
  }

  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("cost_centers")
    .update({
      is_active: desired,
      archived_at: desired ? null : now,
      archived_by: desired ? null : actorId || null,
      updated_by: actorId || null,
      updated_at: now,
    })
    .eq("organization_id", organizationId)
    .eq("id", existing.id)
    .select()
    .single();
  if (error) throw error;

  return { success: true, changed: true, costCenter: data };
}

export async function listFinanceCostCenters({
  organizationId,
  entityId,
  includeInactive = false,
}) {
  if (!organizationId) throw new Error("organizationId required");
  if (!entityId) throw new Error("entityId required");
  await requireEntity({ organizationId, entityId });

  let query = supabaseAdmin
    .from("cost_centers")
    .select("*")
    .eq("organization_id", organizationId)
    .or(`entity_id.eq.${entityId},entity_id.is.null`)
    .order("code", { ascending: true })
    .order("name", { ascending: true });
  if (!includeInactive) {
    query = query.or("is_active.eq.true,is_active.is.null");
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row,
    scope_status: row.entity_id
      ? "ENTITY_SCOPED"
      : "LEGACY_ORGANISATION_SCOPE",
  }));
}

export const FINANCE_COST_CENTRE_TYPES = Object.freeze([...TYPES]);
