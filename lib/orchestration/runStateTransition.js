import { supabase } from "@/lib/supabase";

import { validateStateTransition } from "./validateStateTransition";

export async function runStateTransition({
  tenantId,
  entityType,
  entityId,
  currentState,
  nextState,
  transitionAction,
  transitionedBy,
}) {
  const valid =
    await validateStateTransition({
      entityType,
      currentState,
      nextState,
    });

  if (!valid) {
    throw new Error(
      "Invalid state transition"
    );
  }

  const { data, error } =
    await supabase
      .from(
        "orchestration_state_transitions"
      )
      .insert({
        tenant_id: tenantId,
        entity_type: entityType,
        entity_id: entityId,
        previous_state:
          currentState,
        next_state: nextState,
        transition_action:
          transitionAction,
        transitioned_by:
          transitionedBy,
      })
      .select()
      .single();

  if (error) {
    throw error;
  }

  return data;
}
