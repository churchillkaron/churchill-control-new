import { supabase } from "@/lib/supabase";

export async function registerEventSchema(data) {
  const { data: schema, error } =
    await supabase
      .from("accounting_event_schemas")
      .insert(data)
      .select()
      .single();

  if (error) {
    throw error;
  }

  return schema;
}
