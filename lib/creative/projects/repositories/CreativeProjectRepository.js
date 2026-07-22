import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_project_state";

function canonicalProjectId(row = {}) {
  return (
    row.creative_project_id ||
    row.project_id ||
    row.id ||
    null
  );
}

function normalizeProject(row) {
  if (!row) return null;

  const projectId = canonicalProjectId(row);
  const stateId =
    row.state_id ||
    (row.creative_project_id && row.id !== projectId
      ? row.id
      : null);

  return {
    ...row,
    id: projectId,
    creative_project_id: projectId,
    state_id: stateId,
  };
}

async function findStoredProject(id) {
  if (!id) return null;

  const canonicalResult = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("creative_project_id", id)
    .maybeSingle();

  if (canonicalResult.error) {
    throw canonicalResult.error;
  }

  if (canonicalResult.data) {
    return canonicalResult.data;
  }

  const legacyResult = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (legacyResult.error) {
    throw legacyResult.error;
  }

  return legacyResult.data || null;
}

export async function create(project) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(project)
    .select()
    .single();

  if (error) throw error;

  return normalizeProject(data);
}

export async function update(id, values = {}) {
  const storedProject = await findStoredProject(id);

  if (!storedProject) {
    throw new Error("CREATIVE_PROJECT_NOT_FOUND");
  }

  const patch = {
    ...values,
  };

  delete patch.id;
  delete patch.state_id;

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", storedProject.id)
    .select()
    .single();

  if (error) throw error;

  return normalizeProject(data);
}

export async function archive(id) {
  return update(id, {
    archived: true,
    status: "ARCHIVED",
  });
}

export async function duplicate(id) {
  const original = await getById(id);
  const copyId = crypto.randomUUID();
  const copy = {
    ...original,
    id: copyId,
    creative_project_id: copyId,
    version: (original.version || 1) + 1,
    status: "DRAFT",
    archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  delete copy.state_id;
  delete copy.created_by;

  return create(copy);
}

export async function getById(id) {
  const data = await findStoredProject(id);

  if (!data) {
    throw new Error("CREATIVE_PROJECT_NOT_FOUND");
  }

  return normalizeProject(data);
}

export async function listByOrganization(organizationId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", {
      ascending: false,
    });

  if (error) throw error;

  return (data || []).map(normalizeProject);
}
