import { createClient } from "@supabase/supabase-js";

const desiredUnits = Object.freeze([
  {
    code: "KITCHEN",
    name: "Kitchen",
    description: "Kitchen operations and production.",
  },
  {
    code: "BAR",
    name: "Bar",
    description: "Bar operations and beverage service.",
  },
  {
    code: "RESTAURANT",
    name: "Restaurant",
    description: "Restaurant floor and dining service.",
  },
  {
    code: "BREAKFAST",
    name: "Breakfast",
    description: "Breakfast operations and service.",
  },
]);

function text(value) {
  return String(value ?? "").trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

function active(row = {}) {
  if (row.active === false || row.is_active === false || row.enabled === false) {
    return false;
  }

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
  if (error) return [];
  return data || [];
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
    generalDepartments.filter((row) =>
      churchillOrganizationIds.has(text(row.organization_id)),
    ),
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
  const direct = await optionalSelectAll(supabase, "staff_accounts");
  let candidates = direct.filter(
    (row) =>
      active(row) &&
      text(row.active_organization_id) === text(organizationId),
  );

  if (!candidates.length) {
    const memberships = (await optionalSelectAll(supabase, "organization_users"))
      .filter(
        (row) =>
          active(row) &&
          text(row.organization_id) === text(organizationId) &&
          text(row.staff_account_id),
      );
    const memberIds = new Set(memberships.map((row) => text(row.staff_account_id)));
    candidates = direct.filter((row) => active(row) && memberIds.has(text(row.id)));
  }

  candidates.sort((left, right) => {
    const leftText = searchable(left);
    const rightText = searchable(right);
    const leftPriority = leftText.includes("patric")
      ? 0
      : leftText.includes("owner") || leftText.includes("admin")
        ? 1
        : 2;
    const rightPriority = rightText.includes("patric")
      ? 0
      : rightText.includes("owner") || rightText.includes("admin")
        ? 1
        : 2;
    return leftPriority - rightPriority;
  });

  return candidates[0]?.id || null;
}

async function ensureDepartment(supabase, target, desired, departments) {
  const existing = departments.find(
    (row) =>
      text(row.organization_id) === target.organization_id &&
      text(row.entity_id) === target.entity_id &&
      (upper(row.code) === desired.code || upper(row.name) === desired.code),
  );

  const payload = {
    organization_id: target.organization_id,
    entity_id: target.entity_id,
    code: desired.code,
    name: desired.name,
    description: text(existing?.description) || desired.description,
    status: "ACTIVE",
    is_active: true,
    updated_at: new Date().toISOString(),
  };

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

  const { data, error } = await supabase
    .from("departments")
    .insert({ ...payload, created_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error) throw new Error(`Department ${desired.name}: ${error.message}`);
  return data;
}

async function ensureCostCentre(
  supabase,
  target,
  desired,
  department,
  responsibleOwnerId,
  costCentres,
) {
  const existing = costCentres.find(
    (row) =>
      text(row.organization_id) === target.organization_id &&
      text(row.entity_id) === target.entity_id &&
      (upper(row.code) === desired.code || upper(row.name) === desired.code),
  );

  const payload = {
    organization_id: target.organization_id,
    entity_id: target.entity_id,
    code: desired.code,
    name: desired.name,
    type: "OPERATIONAL",
    department_id: department.id,
    manager_user_id: existing?.manager_user_id || responsibleOwnerId || null,
    description: text(existing?.description) || desired.description,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

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

  const { data, error } = await supabase
    .from("cost_centers")
    .insert({ ...payload, created_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error) throw new Error(`Cost Centre ${desired.name}: ${error.message}`);
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
    const department = (departments || []).find(
      (row) => active(row) && upper(row.code || row.name) === desired.code,
    );
    const costCentre = (costCentres || []).find(
      (row) => active(row) && upper(row.code || row.name) === desired.code,
    );

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
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  const departments = await selectAll(supabase, "departments");
  const costCentres = await selectAll(supabase, "cost_centers");
  const targets = await resolveTargetPairs(supabase, departments);

  for (const target of targets) {
    const responsibleOwnerId = await resolveResponsibleOwner(
      supabase,
      target.organization_id,
    );

    for (const desired of desiredUnits) {
      const department = await ensureDepartment(
        supabase,
        target,
        desired,
        departments,
      );
      await ensureCostCentre(
        supabase,
        target,
        desired,
        department,
        responsibleOwnerId,
        costCentres,
      );
    }

    await verify(supabase, target);
  }

  console.log(
    `Finance production master data verified for ${targets.length} legal entity target(s).`,
  );
}

main().catch((error) => {
  console.error(`Finance production master-data bootstrap failed: ${error.message}`);
  process.exit(1);
});
