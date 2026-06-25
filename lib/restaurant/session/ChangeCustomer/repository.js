import { getServiceSupabase } from "@/lib/shared/supabase/service";
import { getActiveTableSession } from "@/lib/restaurant/services/getActiveTableSession";

export async function repository({
  context,
  payload,
}) {
  const supabase =
    getServiceSupabase();

  let session = null;

  if (payload.sessionId) {
    const {
      data,
      error,
    } = await supabase
      .from("table_sessions")
      .select("*")
      .eq(
        "organization_id",
        context.organizationId
      )
      .eq(
        "id",
        payload.sessionId
      )
      .single();

    if (error) {
      throw error;
    }

    session = data;
  } else {
    session =
      await getActiveTableSession({
        organizationId:
          context.organizationId,
        tableId:
          payload.tableId,
        tableNumber:
          payload.tableNumber,
      });
  }

  if (!session?.id) {
    throw new Error(
      "Active session not found"
    );
  }

  const {
    data,
    error,
  } = await supabase
    .from("table_sessions")
    .update({
      customer_id:
        payload.customerId,
      customer_name:
        payload.customerName,
      customer_email:
        payload.customerEmail,
      customer_phone:
        payload.customerPhone,
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "organization_id",
      context.organizationId
    )
    .eq(
      "id",
      session.id
    )
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
