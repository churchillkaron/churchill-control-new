import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function buildAIGovernanceEngine({
  tenant_id,
}) {

  try {

    const {
      data: approvals,
      error,
    } = await supabaseAdmin
      .from("approval_logs")
      .select(`
        id,
        category,
        status,
        requested_by,
        approved_by,
        amount,
        created_at
      `)
      .eq(
        "tenant_id",
        tenant_id
      )
      .limit(5000);

    if (error) {
      throw error;
    }

    let pending = 0;
    let approved = 0;
    let rejected = 0;

    const categories = {};

    for (const row of approvals || []) {

      if (
        row.status === "pending"
      ) {
        pending += 1;
      }

      if (
        row.status === "approved"
      ) {
        approved += 1;
      }

      if (
        row.status === "rejected"
      ) {
        rejected += 1;
      }

      const category =
        row.category || "UNKNOWN";

      if (
        !categories[category]
      ) {

        categories[category] = {

          category,

          total: 0,

          amount: 0,
        };
      }

      categories[
        category
      ].total += 1;

      categories[
        category
      ].amount += Number(
        row.amount || 0
      );
    }

    const approvalRate =
      approvals?.length > 0
        ? (
            (approved /
              approvals.length) *
            100
          ).toFixed(2)
        : 0;

    return {

      success: true,

      summary: {

        total_requests:
          approvals?.length || 0,

        pending,

        approved,

        rejected,

        approval_rate:
          approvalRate,
      },

      categories:
        Object.values(
          categories
        ).sort(
          (a, b) =>
            b.amount -
            a.amount
        ),

      recent_approvals:
        approvals?.slice(
          0,
          50
        ) || [],

      generated_at:
        new Date().toISOString(),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
