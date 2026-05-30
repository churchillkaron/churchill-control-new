import { supabase } from "@/lib/supabase";

export async function writeImmutableAudit(data) {
  const { error } = await supabase
    .from("immutable_audit_chain")
    .insert(data);

  if (error) {
    throw error;
  }

  return true;
}
