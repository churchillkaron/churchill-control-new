import { supabase } from "@/lib/supabase";

export async function validateStateTransition({
  entityType,
  currentState,
  nextState,
}) {
  const rule =
    await supabase
      .from(
        "orchestration_state_rules"
      )
      .select("*")
      .eq("entity_type", entityType)
      .eq(
        "current_state",
        currentState
      )
      .eq(
        "allowed_next_state",
        nextState
      )
      .single();

  return !!rule.data;
}
