import { supabase } from "@/lib/supabase";

export async function createAuditLog(data) {
  const { error } = await supabase
    .from("audit_logs")
    .insert(data);

  if (error) {
    throw error;
  }

  return true;
}
