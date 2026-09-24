import { supabaseAdmin } from "../../../shared/supabase/admin.js";

const TABLE = "creative_projects";

function text(value) { return String(value ?? "").trim(); }
function transientReadError(value) {
  const message = text(value).toLowerCase();
  return /\b(408|425|429|500|502|503|504|520|521|522|523|524|525)\b/.test(message)
    || /pgrst002|schema cache|statement timeout|connection timeout|connection timed out|connection terminated|ssl handshake|web server is down|temporarily unavailable|fetch failed|network|abort/.test(message);
}
async function retryRead(makeQuery, label, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const result = await makeQuery(controller.signal);
      if (!result?.error) return result;
      lastError = result.error;
    } catch (error) {
      lastError = error;
    } finally {
      clearTimeout(timer);
    }
    if (!transientReadError(lastError?.message || lastError) || attempt === attempts) break;
    await new Promise((resolve) => setTimeout(resolve, Math.min(6000, 750 * (2 ** (attempt - 1)))));
  }
  throw new Error(label + ":" + text(lastError?.message || lastError));
}

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
  const { data } = await retryRead(
    (signal) => supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .abortSignal(signal),
    "CREATIVE_PROJECT_READ_FAILED",
  );
  return data;
}

export async function getByMission({ organization_id, creative_mission_id }) {
  if (!organization_id) throw new Error("organization_id required");
  if (!creative_mission_id) throw new Error("creative_mission_id required");

  const { data } = await retryRead(
    (signal) => supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("organization_id", organization_id)
      .eq("creative_mission_id", creative_mission_id)
      .eq("archived", false)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .abortSignal(signal),
    "CREATIVE_PROJECT_MISSION_READ_FAILED",
  );
  return data;
}

export async function listByOrganization(organizationId) {
  const { data } = await retryRead(
    (signal) => supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("organization_id", organizationId)
      .eq("archived", false)
      .order("created_at", { ascending: false })
      .abortSignal(signal),
    "CREATIVE_PROJECT_LIST_FAILED",
  );
  return data || [];
}
