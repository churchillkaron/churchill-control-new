import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function getNextGRNNumber({
  organizationId,
  organization_id,
}) {

  const resolvedOrganizationId =
    organizationId || organization_id;

  if (!resolvedOrganizationId) {
    throw new Error("organization_id required");
  }

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("goods_receipts")
    .select("grn_number")
    .eq(
      "organization_id",
      resolvedOrganizationId
    )
    .order("created_at", {
      ascending: false,
    })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const lastNumber =
    data?.grn_number?.match(/\d+$/)?.[0] || "0";

  const nextNumber =
    String(
      Number(lastNumber) + 1
    ).padStart(8, "0");

  return `GRN-${nextNumber}`;
}
