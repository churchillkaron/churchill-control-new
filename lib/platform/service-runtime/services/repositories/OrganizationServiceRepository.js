import { supabaseAdmin } from "../../../../shared/supabase/admin.js";

const TABLE = "organization_services";

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

export async function listByOrganization(organization_id) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  const { data } = await retryRead(
    (signal) => supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("organization_id", organization_id)
      .order("created_at", { ascending: true })
      .abortSignal(signal),
    "ORGANIZATION_SERVICES_LIST_FAILED",
  );

  return data || [];
}

export async function getByService({
  organization_id,
  service_id,
}) {
  if (!organization_id) {
    throw new Error("organization_id required");
  }

  if (!service_id) {
    throw new Error("service_id required");
  }

  const { data } = await retryRead(
    (signal) => supabaseAdmin
      .from(TABLE)
      .select("*")
      .eq("organization_id", organization_id)
      .eq("service_id", service_id)
      .maybeSingle()
      .abortSignal(signal),
    "ORGANIZATION_SERVICE_READ_FAILED",
  );

  return data;
}

export async function save(record) {
  if (!record.organization_id) {
    throw new Error("organization_id required");
  }

  if (!record.service_id) {
    throw new Error("service_id required");
  }

  const payload = {
    ...record,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .upsert(payload, {
      onConflict: "organization_id,service_id",
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}
