import { createClient } from "@supabase/supabase-js";

const desiredUnits = Object.freeze([
  { code: "KITCHEN", name: "Kitchen", description: "Kitchen operations and production." },
  { code: "BAR", name: "Bar", description: "Bar operations and beverage service." },
  { code: "RESTAURANT", name: "Restaurant", description: "Restaurant floor and dining service." },
  { code: "BREAKFAST", name: "Breakfast", description: "Breakfast operations and service." },
]);

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function active(row = {}) {
  if (row.active === false || row.is_active === false || row.enabled === false) return false;
  return ![
    "INACTIVE",
    "DISABLED",
    "ARCHIVED",
    "SUSPENDED",
    "TERMINATED",
    "REVOKED",
  ].includes(upper(row.status || "ACTIVE"));
}

function searchable(row = {}) {
  return Object.entries(row)
    .filter(([key]) => !key.toLowerCase().includes("id"))
    .map(([, value]) => (typeof value === "string" ? value : ""))
    .join(" ")
    .toLowerCase();
}

function isChurchill(row = {}) {
  const value = searchable(row);
  return value.includes("churchill") || value.includes("karon");
}

async function selectAll(supabase, table) {
  const { data, error } = await supabase.from(table).select("*").limit(10000);
  if (error) throw new Error(`${table}: ${error.message}`);
  return data || [];
}

async function optionalSelectAll(supabase, table) {
  const { data, error } = await supabase.from(table).select("*").limit(10000);
  return error ? [] : data || [];
}

async function tableColumns({ url, serviceRoleKey, table, rows }) {
  const columns = new Set(Object.keys(rows?.[0] || {}));

  try {
    const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/openapi+json",
      },
    });

    if (response.ok) {
      const specification = await response.json();
      const schema =
        specification?.definitions?.[table] ||
        specification?.components?.schemas?.[table] ||
        null;

      for (const column of Object.keys(schema?.properties || {})) columns.add(column);
    }
  } catch {
    // Existing live rows remain a safe schema source if OpenAPI discovery is unavailable.
  }

  if (!columns.size) throw new Error(`Could not discover the live ${table} schema.`);
  return columns;
}

function projectPayload(payload, columns, requiredColumns = []) {
  for (const column of requiredColumns) {
    if (!columns.has(column)) {
      throw new Error(`Live schema is missing required column ${column}.`);
    }
  }

  return Object.fromEntries(
    Object.entries(payload).filter(([column, value]) => columns.has(column) && value !== undefined),
  );
}

function uniquePairs(rows) {
  const pairs = new Map();
  for (const row of rows) {
    const organizationId = text(row.organization_id);
    const entityId = text(row.entity_id);
    if (!organizationId || !entityId) continue;
    pairs.set(`${organizationId}:${entityId}`, {
      organization_id: organizationId,
      entity_id: entityId,
    });
  }
  return [...pairs.values()];
}

async function resolveTargetPairs(supabase, departments) {
  const [organizations, legalEntities, profiles] = await Promise.all([
    optionalSelectAll(supabase, "organizations"),
    optionalSelectAll(supabase, "legal_entities"),
    optionalSelectAll(supabase, "finance_organization_profiles"),
  ]);

  const churchillOrganizationIds = new Set(
    [...organizations, ...legalEntities, ...profiles]
      .filter(isChurchill)
      .map((row) => text(row.organization_id || row.id))
      .filter(Boolean),
  );

  const generalDepartments = departments.filter(
    (row) => active(row) && upper(row.name) === "GENERAL DEPARTMENT",
  );

  let targets = uniquePairs(
    generalDepartments.filter((row) => churchillOrganizationIds.has(text(row.organization_id))),
  );

  if (!targets.length) {
    const allGeneralTargets = uniquePairs(generalDepartments);
    if (allGeneralTargets.length === 1) targets = allGeneralTargets;
  }

  if (!targets.length) {
    throw new Error(
      "Could not safely resolve the Churchill organisation and legal entity from General Department.",
    );
  }

  return targets;
}

async function resolveResponsibleOwner(supabase, organizationId) {
  const staff = await optionalSelectAll(supabase, "staff_accounts");
  let candidates = staff.filter(
    (row) => active(row) && text(row.active_organization_id) === text(organizationId),
  );

  if (!candidates.length) {
    const memberships = (await optionalSelectAll(supabase, "organization_users")).filter(
      (row) =>
        active(row) &&
        text(row.organization_id) === text(organizationId) &&
        text(row.staff_account_id),
    );
    const memberIds = new Set(memberships.map((row) => text(row.staff_account_id)));
    candidates = staff.filter((row) => active(row) && memberIds.has(text(row.id)));
  }

  candidates.sort((left, right) => {
    const priority = (row) => {
      const value = searchable(row);
      if (value.includes("patric")) return 0;
      if (value.includes("owner") || value.includes("admin")) return 1;
      return 2;
    };
    return priority(left) - priority(right);
  });

  return candidates[0]?.id || null;
}

function matchesUnit(row, desired) {
  return upper(row.code) === desired.code || upper(row.name) === desired.code;
}

async function ensureDepartment({
  supabase,
  target,
  desired,
  departments,
  departmentColumns,
}) {
  const existing = departments.find(
    (row) =>
      text(row.organization_id) === target.organization_id &&
      text(row.entity_id) === target.entity_id &&
      matchesUnit(row, desired),
  );

  const now = new Date().toISOString();
  const payload = projectPayload(
    {
      organization_id: target.organization_id,
      entity_id: target.entity_id,
      code: desired.code,
      name: desired.name,
      description: text(existing?.description) || desired.description,
      status: "ACTIVE",
      is_active: true,
      active: true,
      updated_at: now,
    },
    departmentColumns,
    ["organization_id", "entity_id", "name"],
  );

  if (existing) {
    const { data, error } = await supabase
      .from("departments")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(`Department ${desired.name}: ${error.message}`);
    return data;
  }

  const insertPayload = projectPayload(
    { ...payload, created_at: now },
    departmentColumns,
    ["organization_id", "entity_id", "name"],
  );
  const { data, error } = await supabase
    .from("departments")
    .insert(insertPayload)
    .select("*")
    .single();
  if (error) throw new Error(`Department ${desired.name}: ${error.message}`);
  departments.push(data);
  return data;
}

async function ensureCostCentre({
  supabase,
  target,
  desired,
  department,
  responsibleOwnerId,
  costCentres,
  costCentreColumns,
}) {
  for (const required of ["organization_id", "entity_id", "code", "name", "department_id"] ) {
    if (!costCentreColumns.has(required)) {
      throw new Error(`Cost Centre live schema is missing required column ${required}.`);
    }
  }

  const existing = costCentres.find(
    (row) =>
      text(row.organization_id) === target.organization_id &&
      text(row.entity_id) === target.entity_id &&
      matchesUnit(row, desired),
  );

  const now = new Date().toISOString();
  const payload = projectPayload(
    {
      organization_id: target.organization_id,
      entity_id: target.entity_id,
      code: desired.code,
      name: desired.name,
      type: "OPERATIONAL",
      department_id: department.id,
      manager_user_id: existing?.manager_user_id || responsibleOwnerId || null,
      manager: existing?.manager || null,
      description: text(existing?.description) || desired.description,
      is_active: true,
      active: true,
      updated_at: now,
    },
    costCentreColumns,
    ["organization_id", "entity_id", "code", "name", "department_id"],
  );

  if (existing) {
    const { data, error } = await supabase
      .from("cost_centers")
      .update(payload)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(`Cost Centre ${desired.name}: ${error.message}`);
    return data;
  }

  const insertPayload = projectPayload(
    { ...payload, created_at: now },
    costCentreColumns,
    ["organization_id", "entity_id", "code", "name", "department_id"],
  );
  const { data, error } = await supabase
    .from("cost_centers")
    .insert(insertPayload)
    .select("*")
    .single();
  if (error) throw new Error(`Cost Centre ${desired.name}: ${error.message}`);
  costCentres.push(data);
  return data;
}

async function verify(supabase, target) {
  const [{ data: departments, error: departmentError }, { data: costCentres, error: costError }] =
    await Promise.all([
      supabase
        .from("departments")
        .select("*")
        .eq("organization_id", target.organization_id)
        .eq("entity_id", target.entity_id),
      supabase
        .from("cost_centers")
        .select("*")
        .eq("organization_id", target.organization_id)
        .eq("entity_id", target.entity_id),
    ]);

  if (departmentError) throw departmentError;
  if (costError) throw costError;

  for (const desired of desiredUnits) {
    const department = (departments || []).find((row) => active(row) && matchesUnit(row, desired));
    const costCentre = (costCentres || []).find((row) => active(row) && matchesUnit(row, desired));
    if (!department) throw new Error(`${desired.name} Department verification failed.`);
    if (!costCentre) throw new Error(`${desired.name} Cost Centre verification failed.`);
    if (text(costCentre.department_id) !== text(department.id)) {
      throw new Error(`${desired.name} Cost Centre is not linked to its Department.`);
    }
  }
}

async function main() {
  if (process.env.VERCEL_ENV !== "production") {
    console.log("Finance production master-data bootstrap skipped outside Vercel production.");
    return;
  }

  const url = text(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !serviceRoleKey) {
    throw new Error("Production Supabase service credentials are unavailable to Vercel.");
  }

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const departments = await selectAll(supabase, "departments");
  const costCentres = await selectAll(supabase, "cost_centers");
  const [departmentColumns, costCentreColumns] = await Promise.all([
    tableColumns({ url, serviceRoleKey, table: "departments", rows: departments }),
    tableColumns({ url, serviceRoleKey, table: "cost_centers", rows: costCentres }),
  ]);
  const targets = await resolveTargetPairs(supabase, departments);

  for (const target of targets) {
    const responsibleOwnerId = await resolveResponsibleOwner(supabase, target.organization_id);
    if (costCentreColumns.has("manager_user_id") && !responsibleOwnerId) {
      throw new Error("No active Responsible Owner could be resolved for the Churchill organisation.");
    }

    for (const desired of desiredUnits) {
      const department = await ensureDepartment({
        supabase,
        target,
        desired,
        departments,
        departmentColumns,
      });
      await ensureCostCentre({
        supabase,
        target,
        desired,
        department,
        responsibleOwnerId,
        costCentres,
        costCentreColumns,
      });
    }

    await verify(supabase, target);
  }

  console.log(`Finance production master data verified for ${targets.length} legal entity target(s).`);
}

main().catch((error) => {
  console.error(`Finance production master-data bootstrap failed: ${error.message}`);
  process.exit(1);
});
