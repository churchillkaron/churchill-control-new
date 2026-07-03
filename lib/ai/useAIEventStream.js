import { supabase } from "@/lib/shared/supabase/client";

export async function useAIEventStream() {
  const { data, error } = await supabase
    .from("ai_events")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) throw error;

  return data;
}
