import { createServerSupabase } from "@/lib/shared/supabase/server";
import { supabase } from "@/lib/supabase";

export async function createUnlockRequest(data) {
  const { data: request, error } = await supabase
    .from("period_lock_requests")
    .insert(data)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return request;
}
