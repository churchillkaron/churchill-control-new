
/**
 * PARTITIONED EVENT STORE
 * SaaS-safe event isolation layer
 */

import { supabase } from "@/lib/shared/supabase/client";

export async function getEvents(organizationId) {

  const { data } = await supabase
    .from("pos_event_log")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: true });

  return data || [];
}

