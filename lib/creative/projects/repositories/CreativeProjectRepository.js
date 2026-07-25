import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_projects";

export async function create(project) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(project)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function update(id, values) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      ...values,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function archive(id) {
  return update(id, {
    archived: true,
    status: "ARCHIVED",
  });
}

export async function duplicate(id) {
  const original = await getById(id);
  const now = new Date().toISOString();
  const copy = {
    ...original,
    id: crypto.randomUUID(),
    creative_mission_id: null,
    version: Number(original.version || 1) + 1,
    status: "DRAFT",
    archived: false,
    created_at: now,
    updated_at: now,
  };

  delete copy.created_by;
  return create(copy);
}

export async function getById(id) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getByMission({ organization_id, creative_mission_id }) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_mission_id) throw new Error("creative_mission_id required");

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .eq("creative_mission_id", creative_mission_id)
    .eq("archived", false)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listByOrganization(organizationId) {
  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("archived", false)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data || [];
}
