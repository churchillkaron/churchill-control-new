import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildExecutiveSnapshot({
  tenant_id,
}) {

  try {

    const {
      data: sales,
    } = await supabaseAdmin
      .from("daily_sales_items")
      .select("price")
      .eq(
        "tenant_id",
        tenant_id
      );

    const revenue =
      (sales || []).reduce(
        (sum, item) =>
          sum +
          Number(
            item.price || 0
          ),
        0
      );

    const snapshot = {
      tenant_id,
      revenue,
      generated_at:
        new Date().toISOString(),
    };

    await supabaseAdmin
      .from(
        "executive_snapshots"
      )
      .insert([snapshot]);

    return {
      success: true,
      snapshot,
    };

  } catch (error) {

    return {
      success: false,
      error:
        error.message,
    };
  }
}
