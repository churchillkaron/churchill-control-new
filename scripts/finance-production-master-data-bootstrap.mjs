import { createClient } from "@supabase/supabase-js";

const DEPARTMENT = Object.freeze({
  code: "FOOD_BEVERAGE",
  name: "Food & Beverage",
  description: "Food and beverage operations.",
});

const COST_CENTRES = Object.freeze([
  { code: "KITCHEN", name: "Kitchen", description: "Kitchen operations and production." },
  { code: "BAR", name: "Bar", description: "Bar operations and beverage service." },
  { code: "RESTAURANT", name: "Restaurant Service", description: "Restaurant floor and dining service." },
  { code: "BREAKFAST", name: "Breakfast", description: "Breakfast operations and service." },
]);

const DUPLICATE_DEPARTMENT_CODES = new Set(COST_CENTRES.map((row) => row.code));

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function active(row = {}) {
  if (row.active === false || row.is_active === false || row.enabled === false) return false;
  return !["INACTIVE", "DISABLED", "ARCHIVED", "SUSPENDED", "TERMINATED"].includes(
    upper(row.status || "ACTIVE"),
  );
}

function searchable(row = {}) {
  return Object.entries(row)
    .filter(([key]) => !key.toLowerCase().includes("id"))
    .map(([, value]) => (typeof value === "string" ? value : ""))
    .join(" ")
    .toLowerCase();
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

async function discoverColumns({ url, serviceRoleKey, table, rows }) {
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
    // Existing rows remain the fallback schema source.
  }
  if (!columns.size) throw new Error(`Could not discover live ${table} schema.`);
  return columns;
}

function payloadFor(columns, values, required = []) {
  for (const column of required) {
    if (!columns.has(column)) throw new Error(`Live schema is missing required column ${column}.`);
  }
  return Object.fromEntries(
    Object.entries(values).filter(([column, value]) => columns.has(column) && value !== undefined),
  );
}

function uniqueTargets(rows) {
  const targets = new Map();
  for (const row of rows) {
    const organizationId = text(row.organization_id);
    const entityId = text(row.entity_id);
    if (!organizationId || !entityId) continue;
    targets.set(`${organizationId}:${entityId}`, {
      organization_id: organizationId,
      entity_id: entityId,
    });
  }
  return [...targets.values()];
}

async function resolveTargets(supabase, departments, costCentres) {
  const [organizations, legalEntities, profiles] = await Promise.all([
    optionalSelectAll(supabase, "organizations"),
    optionalSelectAll(supabase, "legal_entities"),
    optionalSelectAll(supabase, "finance_organization_profiles"),
  ]);

  const churchillOrganizationIds = new Set(
    [...organizations, ...legalEntities, ...profiles]
      .filter((row) => {
        const value = searchable(row);
        return value.includes("churchill") || value.includes("karon");
      })
      .map((row) => text(row.organization_id || row.id))
      .filter(Boolean),
  );

  const candidates = [...departments, ...costCentres].filter(
    (row) => churchillOrganizationIds.has(text(row.organization_id)),
  );
  let targets = uniqueTargets(candidates);

  if (!targets.length) {
    const generalDepartments = departments.filter(
      (row) => active(row) && upper(row.name) === "GENERAL DEPARTMENT",
    );
    targets = uniqueTargets(generalDepartments);
  }

  if (targets.length !== 1) {
    throw new Error(`Expected one Churchill organisation/entity target, found ${targets.length}.`);
  }
  return targets;
}

async function resolveResponsibleOwner(supabase, organizationId) {
  const staff = await optionalSelectAll(supabase, "staff_accounts");
  const memberships = await optionalSelectAll(supabase, "organization_users");
  const memberIds = new Set(
    memberships
      .filter((row) => active(row) && text(row.organization_id) === text(organizationId))
      .map((row) => text(row.staff_account_id))
      .filter(Boolean),
  );

  const candidates = staff
    .filter(
      (row) =>
        active(row) &&
        (text(row.active_organization_id || row.organization_id) === text(organizationId) ||
          memberIds.has(text(row.id))),
    )
    .sort((left, right) => {
      const rank = (row) => {
        const value = searchable(row);
        if (value.includes("patric")) return 0;
        if (value.includes("owner") || value.includes("admin")) return 1;
        return 2;
      };
      return rank(left) - rank(right);
    });

  return candidates[0] || null;
}

async function ensureDepartment({ supabase, target, rows, columns }) {
  const existing = rows.find(
    (row) =>
      text(row.organization_id) === target.organization_id &&
      text(row.entity_id) === target.entity_id &&
      (upper(row.code) === DEPARTMENT.code || upper(row.name) === upper(DEPARTMENT.name)),
  );
  const now = new Date().toISOString();
  const values = payloadFor(
    columns,
    {
      organization_id: target.organization_id,
      entity_id: target.entity_id,
      code: DEPARTMENT.code,
      name: DEPARTMENT.name,
      description: DEPARTMENT.description,
      status: "ACTIVE",
      is_active: true,
      active: true,
      updated_at: now,
    },
    ["organization_id", "entity_id", "name"],
  );

  if (existing) {
    const { data, error } = await supabase
      .from("departments")
      .update(values)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(`Food & Beverage Department: ${error.message}`);
    return data;
  }

  const { data, error } = await supabase
    .from("departments")
    .insert(payloadFor(columns, { ...values, created_at: now }, ["organization_id", "entity_id", "name"]))
    .select("*")
    .single();
  if (error) throw new Error(`Food & Beverage Department: ${error.message}`);
  rows.push(data);
  return data;
}

async function ensureCostCentre({
  supabase,
  target,
  desired,
  department,
  owner,
  rows,
  columns,
}) {
  const existing = rows.find(
    (row) =>
      text(row.organization_id) === target.organization_id &&
      text(row.entity_id) === target.entity_id &&
      upper(row.code) === desired.code,
  );
  const now = new Date().toISOString();
  const values = payloadFor(
    columns,
    {
      organization_id: target.organization_id,
      entity_id: target.entity_id,
      code: desired.code,
      name: desired.name,
      type: "OPERATIONAL",
      department_id: department.id,
      parent_cost_center_id: null,
      manager_user_id: existing?.manager_user_id || owner?.id || null,
      manager: existing?.manager || owner?.full_name || owner?.name || owner?.email || null,
      description: desired.description,
      is_active: true,
      active: true,
      updated_at: now,
    },
    ["organization_id", "entity_id", "code", "name", "department_id"],
  );

  if (existing) {
    const { data, error } = await supabase
      .from("cost_centers")
      .update(values)
      .eq("id", existing.id)
      .select("*")
      .single();
    if (error) throw new Error(`${desired.name} Cost Centre: ${error.message}`);
    return data;
  }

  const { data, error } = await supabase
    .from("cost_centers")
    .insert(
      payloadFor(
        columns,
        { ...values, created_at: now },
        ["organization_id", "entity_id", "code", "name", "department_id"],
      ),
    )
    .select("*")
    .single();
  if (error) throw new Error(`${desired.name} Cost Centre: ${error.message}`);
  rows.push(data);
  return data;
}

async function removeDuplicateDepartments({ supabase, target, departments, columns, keepId }) {
  const duplicates = departments.filter(
    (row) =>
      text(row.organization_id) === target.organization_id &&
      text(row.entity_id) === target.entity_id &&
      text(row.id) !== text(keepId) &&
      (DUPLICATE_DEPARTMENT_CODES.has(upper(row.code)) ||
        DUPLICATE_DEPARTMENT_CODES.has(upper(row.name)) ||
        upper(row.name) === "RESTAURANT SERVICE"),
  );

  for (const row of duplicates) {
    const { error: deleteError } = await supabase.from("departments").delete().eq("id", row.id);
    if (!deleteError) continue;

    const archive = payloadFor(columns, {
      status: "ARCHIVED",
      is_active: false,
      active: false,
      updated_at: new Date().toISOString(),
    });
    const { error: archiveError } = await supabase
      .from("departments")
      .update(archive)
      .eq("id", row.id);
    if (archiveError) {
      throw new Error(`Could not remove duplicate Department ${row.name}: ${archiveError.message}`);
    }
  }
}

async function verify(supabase, target, departmentId) {
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

  const foodAndBeverage = (departments || []).filter(
    (row) => active(row) && text(row.id) === text(departmentId),
  );
  if (foodAndBeverage.length !== 1) throw new Error("Food & Beverage Department verification failed.");

  const activeDuplicateDepartments = (departments || []).filter(
    (row) =>
      active(row) &&
      text(row.id) !== text(departmentId) &&
      (DUPLICATE_DEPARTMENT_CODES.has(upper(row.code)) ||
        DUPLICATE_DEPARTMENT_CODES.has(upper(row.name)) ||
        upper(row.name) === "RESTAURANT SERVICE"),
  );
  if (activeDuplicateDepartments.length) {
    throw new Error("Duplicate Kitchen/Bar/Restaurant/Breakfast Departments remain active.");
  }

  for (const desired of COST_CENTRES) {
    const row = (costCentres || []).find(
      (costCentre) => active(costCentre) && upper(costCentre.code) === desired.code,
    );
    if (!row) throw new Error(`${desired.name} Cost Centre verification failed.`);
    if (text(row.department_id) !== text(departmentId)) {
      throw new Error(`${desired.name} is not assigned to Food & Beverage.`);
    }
    if (text(row.parent_cost_center_id)) {
      throw new Error(`${desired.name} must not have a Parent Cost Centre.`);
    }
    if (upper(row.type || "OPERATIONAL") !== "OPERATIONAL") {
      throw new Error(`${desired.name} must be Operational.`);
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
  if (!url || !serviceRoleKey) throw new Error("Production Supabase credentials unavailable.");

  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const departments = await selectAll(supabase, "departments");
  const costCentres = await selectAll(supabase, "cost_centers");
  const [departmentColumns, costCentreColumns] = await Promise.all([
    discoverColumns({ url, serviceRoleKey, table: "departments", rows: departments }),
    discoverColumns({ url, serviceRoleKey, table: "cost_centers", rows: costCentres }),
  ]);
  const targets = await resolveTargets(supabase, departments, costCentres);

  for (const target of targets) {
    const owner = await resolveResponsibleOwner(supabase, target.organization_id);
    if (costCentreColumns.has("manager_user_id") && !owner) {
      throw new Error("No active Responsible Owner found for Churchill.");
    }

    const department = await ensureDepartment({
      supabase,
      target,
      rows: departments,
      columns: departmentColumns,
    });

    for (const desired of COST_CENTRES) {
      await ensureCostCentre({
        supabase,
        target,
        desired,
        department,
        owner,
        rows: costCentres,
        columns: costCentreColumns,
      });
    }

    await removeDuplicateDepartments({
      supabase,
      target,
      departments,
      columns: departmentColumns,
      keepId: department.id,
    });
    await verify(supabase, target, department.id);
  }

  console.log("Finance Cost Centre structure verified: Food & Beverage with four operational Cost Centres.");
}

main().catch((error) => {
  console.error(`Finance production master-data bootstrap failed: ${error.message}`);
  process.exit(1);
});
