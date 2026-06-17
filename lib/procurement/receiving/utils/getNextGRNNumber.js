import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export async function getNextGRNNumber({
  tenantId,
}) {

  const {
    data,
    error,
  } = await supabaseAdmin

    .from("goods_receipts")

    .select("grn_number")

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
    data?.grn_number
      ?.match(/\d+$/)?.[0] || "0";

  const nextNumber =
    String(
      Number(lastNumber) + 1
    ).padStart(
      8,
      "0"
    );

  return `GRN-${nextNumber}`;
}
