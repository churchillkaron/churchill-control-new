import { supabase } from "@/lib/supabase";

export async function getOrganizationClients(firmOrganizationId) {
  if (!firmOrganizationId) return [];

  const { data, error } = await supabase
    .from("organization_clients")
    .select(`
      *,
      client:client_organization_id (*)
    `)
    .eq("firm_organization_id", firmOrganizationId)
    .eq("relationship_status", "active");

  if (error) {
    console.error("getOrganizationClients error:", error.message);
    return [];
  }

  return (data || []).map((row) => row.client).filter(Boolean);
}
