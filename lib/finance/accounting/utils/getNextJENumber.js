import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function getNextJENumber({
  tenantId,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin

    .from("journal_entries")

    .select("entry_number")

    .eq(
      "tenant_id",
      tenantId
    )

    .order(
      "created_at",
      {
        ascending: false,
      }
    )

    .limit(1)

    .maybeSingle();

  if (error) {
    throw error;
  }

  const lastNumber =
    data?.entry_number
      ?.match(/\d+$/)?.[0] || "0";

  const nextNumber =
    String(
      Number(lastNumber) + 1
    ).padStart(
      8,
      "0"
    );

  return `JE-${nextNumber}`;
}
