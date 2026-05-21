import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function createSnapshot({
  tenant_id,
}) {
  try {
    const { data: sales } = await supabaseAdmin
      .from("daily_sales_items")
      .select("price");

    const revenue = (sales || []).reduce(
      (sum, item) => sum + Number(item.price || 0),
      0
    );

    const snapshot = {
      tenant_id,
      revenue,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabaseAdmin
      .from("executive_dashboard_snapshots")
      .insert([snapshot]);

    if (error) {
      throw error;
    }

    return {
      success: true,
      snapshot,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}
