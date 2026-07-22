import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "creative_strategies";

function sanitizeStrategyPayload(values = {}, { update = false } = {}) {
  const payload = {
    ...values,
  };

  // research_id is a legacy orchestration field and is not a physical column
  // on the canonical creative_strategies table. Preserve its lineage inside
  // metadata instead of sending an invalid PostgREST column.
  if (Object.prototype.hasOwnProperty.call(payload, "research_id")) {
    payload.metadata = {
      ...(payload.metadata || {}),
      research_id: payload.research_id || null,
    };
    delete payload.research_id;
  }

  delete payload.version;
  delete payload.state_id;

  if (update) {
    delete payload.id;
    delete payload.created_at;
    delete payload.created_by;
  }

  return payload;
}

export async function create(document) {
  const payload = sanitizeStrategyPayload(document);

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function update(id, values = {}) {
  const payload = sanitizeStrategyPayload(values, {
    update: true,
  });

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .update({
      ...payload,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function get(id) {
  const { data, error } = await supabaseAdmin
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
}) {
  let query = supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .order("created_at");

  if (creative_project_id) {
    query = query.eq(
      "creative_project_id",
      creative_project_id,
    );
  }

  const { data, error } = await query;

  if (error) throw error;
  return data || [];
}
