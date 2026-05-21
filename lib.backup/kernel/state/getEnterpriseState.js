import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function getEnterpriseState({
  tenant_id,
}) {

  try {

    const [
      orders,
      jobs,
      approvals,
      events,
    ] = await Promise.all([

      supabaseAdmin
        .from("orders")
        .select("*", {
          count: "exact",
          head: true,
        }),

      supabaseAdmin
        .from("distributed_jobs")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "status",
          "PENDING"
        ),

      supabaseAdmin
        .from("governance_approvals")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "status",
          "PENDING"
        ),

      supabaseAdmin
        .from("event_bus")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq(
          "status",
          "PENDING"
        ),
    ]);

    return {

      success: true,

      state: {

        active_orders:
          orders.count || 0,

        pending_jobs:
          jobs.count || 0,

        pending_approvals:
          approvals.count || 0,

        pending_events:
          events.count || 0,

        generated_at:
          new Date().toISOString(),
      },
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
