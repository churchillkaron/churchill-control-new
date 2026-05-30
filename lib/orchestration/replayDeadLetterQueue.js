import { supabase } from "@/lib/supabase";

export async function replayDeadLetterQueue({
  tenantId,
}) {
  const queue =
    await supabase
      .from(
        "orchestration_dead_letter_queue"
      )
      .select("*")
      .eq("tenant_id", tenantId)
      .eq(
        "replay_status",
        "pending"
      );

  const replayed = [];

  for (const row of queue.data || []) {
    await supabase
      .from(
        "orchestration_dead_letter_queue"
      )
      .update({
        replay_status:
          "replayed",
      })
      .eq("id", row.id);

    replayed.push(row.id);
  }

  return replayed;
}
