import { supabase } from "@/lib/supabase";

export async function getEventGraph({
  tenantId,
}) {
  const { data: routes, error } =
    await supabase
      .from("accounting_event_routes")
      .select("*")
      .eq("tenant_id", tenantId)
      .eq("is_active", true);

  if (error) {
    throw error;
  }

  return {
    nodes:
      [...new Set([
        ...routes.map(
          (r) =>
            r.parent_event_type
        ),
        ...routes.map(
          (r) =>
            r.child_event_type
        ),
      ])],
    edges:
      routes.map((r) => ({
        from:
          r.parent_event_type,
        to:
          r.child_event_type,
        order:
          r.execution_order,
      })),
  };
}
