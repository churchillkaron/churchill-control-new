import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function approvePurchaseOrder({
  organization_id,
  organizationId,
  purchase_order_id,
  approved_by = "MANAGER",
}) {

  try {

    const resolvedOrganizationId =
      organization_id || organizationId;

    if (!resolvedOrganizationId) {
      throw new Error("organization_id required");
    }

    const {
      data,
      error,
    } = await supabaseAdmin
      .from("purchase_orders")
      .update({

        status:
          "APPROVED",

        approved_by,

        approved_at:
          new Date().toISOString(),
      })
      .eq(
        "organization_id",
        resolvedOrganizationId
      )
      .eq(
        "id",
        purchase_order_id
      )
      .select()
      .single();

    if (error) {
      throw error;
    }

    return {

      success: true,

      purchase_order:
        data,
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
