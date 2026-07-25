import { supabaseAdmin } from "@/lib/shared/supabase/admin";

const TABLE = "marketing_publish_targets";
const SECRET_KEY = /(token|secret|password|credential|api[_-]?key|private[_-]?key)/i;

function assertNoSecrets(value, path = "target") {
  if (!value || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value)) {
    if (SECRET_KEY.test(key)) {
      throw new Error(`MARKETING_PUBLISH_TARGET_SECRET_FIELD_FORBIDDEN:${path}.${key}`);
    }
    assertNoSecrets(entry, `${path}.${key}`);
  }
}

export async function getById({ organization_id, id }) {
  if (!organization_id) throw new Error("organization_id required");
  if (!id) throw new Error("publish target id required");

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

export async function getActiveById({ organization_id, id }) {
  const target = await getById({ organization_id, id });
  if (!target || target.status !== "ACTIVE") return null;
  assertNoSecrets(target.account_reference);
  assertNoSecrets(target.metadata);
  return target;
}

export async function listActive({ organization_id }) {
  if (!organization_id) throw new Error("organization_id required");

  const { data, error } = await supabaseAdmin
    .from(TABLE)
    .select("*")
    .eq("organization_id", organization_id)
    .eq("status", "ACTIVE")
    .order("name", { ascending: true });

  if (error) throw error;
  for (const target of data || []) {
    assertNoSecrets(target.account_reference);
    assertNoSecrets(target.metadata);
  }
  return data || [];
}
