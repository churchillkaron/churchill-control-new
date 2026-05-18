import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function analyzeKitchenEfficiency({
  tenant_id,
}) {

  try {

    const {
      data: tickets,
      error,
    } = await supabaseAdmin
      .from("kitchen_tickets")
      .select("*")
      .eq(
        "tenant_id",
        tenant_id
      );

    if (error) {
      throw error;
    }

    const totalTickets =
      tickets?.length || 0;

    const completed =
      (tickets || []).filter(
        (
          ticket
        ) =>
          ticket.status ===
          "READY"
      ).length;

    const efficiency =
      totalTickets > 0
        ? (
            completed /
            totalTickets
          ) * 100
        : 0;

    return {

      success: true,

      total_tickets:
        totalTickets,

      completed,

      kitchen_efficiency:
        Number(
          efficiency.toFixed(2)
        ),
    };

  } catch (error) {

    return {

      success: false,

      error:
        error.message,
    };
  }
}
