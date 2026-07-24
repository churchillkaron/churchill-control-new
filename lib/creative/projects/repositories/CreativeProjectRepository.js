import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_projects";

function normalizeProject(row) {
  if (!row) return null;

  return {
    ...row,
    version: row.version_number || 1,
  };
}

function sanitizeProjectPayload(project = {}) {
  const payload = {
    ...project,
  };

  delete payload.version;
  delete payload.state_id;
  delete payload.creative_project_id;

  return payload;
}

async function findStoredProject(id) {
  if (!id) return null;

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data || null;
}

export async function create(project) {
  const payload = sanitizeProjectPayload(project);

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(payload)
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

  const patch = sanitizeProjectPayload(values);

  delete patch.id;
  delete patch.created_at;
  delete patch.version_number;
  delete patch.version_parent_id;
  delete patch.version_created_at;

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
    revision_reason: "ARCHIVED",
  });
}

export async function duplicate(id) {
  const original = await getById(id);
  const now = new Date().toISOString();
  const copy = {
    ...original,
    id: crypto.randomUUID(),
    version_number: 1,
    version_parent_id: null,
    revision_reason: `DUPLICATED_FROM:${id}`,
    version_created_at: now,
    status: "DRAFT",
    archived: false,
    created_at: now,
    updated_at: now,
  };

  delete copy.version;
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
