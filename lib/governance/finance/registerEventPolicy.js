import { supabase } from "@/lib/supabase";

export async function registerEventPolicy(data) {
  const { data: policy, error } =
    await supabase
      .from(
        "accounting_event_policies"
      )
      .insert(data)
      .select()
      .single();

  if (error) {
    throw error;
  }

  return policy;
}
