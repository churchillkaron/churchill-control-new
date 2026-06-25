import { supabase } from "@/lib/shared/supabase/client";
import loadOperationalSettings from "@/lib/settings/loadOperationalSettings";
import { getActiveTableSession } from "@/lib/restaurant/services/getActiveTableSession";

export async function mergeTables({
  organizationId,
  sourceTableId,
  targetTableId,
  mergedBy = "SYSTEM",
}) {
  if (!organizationId) {
    throw new Error("organizationId required");
  }

  if (!sourceTableId || !targetTableId) {
    throw new Error("sourceTableId and targetTableId required");
  }

  const settings = await loadOperationalSettings({
    organizationId,
    domain: "TABLES",
  });

  if (!settings?.allow_table_merge) {
    throw new Error("Table merge disabled");
  }

  const sourceSession = await getActiveTableSession({
    organizationId,
    tableId: sourceTableId,
  });

  const targetSession = await getActiveTableSession({
    organizationId,
    tableId: targetTableId,
  });

  if (!sourceSession || !targetSession) {
    throw new Error("Sessions not found");
  }

  await supabase
    .from("orders")
    .update({
      table_id: targetTableId,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("table_id", sourceTableId);

  await supabase
    .from("order_items")
    .update({
      table_id: targetTableId,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("table_id", sourceTableId);

  const mergedRevenue =
    Number(sourceSession.revenue || 0) +
    Number(targetSession.revenue || 0);

  const mergedOrders =
    Number(sourceSession.orders || 0) +
    Number(targetSession.orders || 0);

  await supabase
    .from("table_sessions")
    .update({
      revenue: mergedRevenue,
      orders: mergedOrders,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", targetSession.id);

  await supabase
    .from("restaurant_table_merges")
    .insert({
      organization_id: organizationId,
      master_table_id: targetTableId,
      merged_table_id: sourceTableId,
      merged_by: mergedBy,
      created_at: new Date().toISOString(),
    });

  await supabase
    .from("restaurant_tables")
    .update({
      status: "MERGED",
      active_session_id: targetSession.id,
      current_guests: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", sourceTableId);

  await supabase
    .from("restaurant_tables")
    .update({
      status: "OCCUPIED",
      active_session_id: targetSession.id,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", organizationId)
    .eq("id", targetTableId);

  return {
    success: true,
    sourceTableId,
    targetTableId,
    sessionId: targetSession.id,
  };
}
