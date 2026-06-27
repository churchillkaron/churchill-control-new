import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getNextJENumber({
  organizationId,
  entityId,
}) {
  const { data, error } =
    await supabaseAdmin
      .from("journal_entries")
      .select("journal_number")
      .eq("organization_id", organizationId)
      .eq("entity_id", entityId)
      .order("created_at", {
        ascending: false,
      })
      .limit(1)
      .maybeSingle();

  if (error) {
    throw error;
  }

  const last =
    data?.journal_number
      ?.match(/\d+$/)?.[0] || "0";

  const next = String(
    Number(last) + 1
  ).padStart(8, "0");

  return `JE-${next}`;
}
