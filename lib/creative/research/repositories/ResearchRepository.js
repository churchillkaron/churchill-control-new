import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_research_reports";

const PROJECT_LINK_FIELDS = [
  "creative_project_id",
  "project_id",
  "creative_mission_id",
  "mission_id",
  "campaign_id",
];

function removeUnsupportedProjectAliases(values = {}) {
  const normalized = {
    ...values,
  };

  delete normalized.creative_project_id;
  delete normalized.project_id;

  return normalized;
}

function rowProjectLink(row = {}) {
  for (const field of PROJECT_LINK_FIELDS) {
    if (row[field]) return row[field];
  }

  return null;
}

function tableRowsExposeProjectLink(rows = []) {
  return rows.some((row) =>
    PROJECT_LINK_FIELDS.some((field) =>
      Object.prototype.hasOwnProperty.call(row, field),
    ),
  );
}

export async function create(report = {}) {
  const payload = removeUnsupportedProjectAliases(report);

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .insert(payload)
      .select()
      .single();

  if (error) throw error;

  return data;
}

export async function update(id, values = {}) {
  const payload = removeUnsupportedProjectAliases(values);

  delete payload.id;

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .update({
        ...payload,
        updated_at:
          new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();

  if (error) throw error;

  return data;
}

export async function get(id) {
  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .single();

  if (error) throw error;

  return data;
}

export async function list({
  organization_id,
  creative_project_id,
  project_id,
} = {}) {
  const resolvedProjectId =
    project_id || creative_project_id || null;

  const { data, error } =
    await supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("organization_id", organization_id)
      .order("created_at", {
        ascending: false,
      });

  if (error) throw error;

  const rows = data || [];

  if (!resolvedProjectId) return rows;

  if (!tableRowsExposeProjectLink(rows)) {
    return [];
  }

  return rows.filter((row) =>
    String(rowProjectLink(row) || "") ===
    String(resolvedProjectId),
  );
}
