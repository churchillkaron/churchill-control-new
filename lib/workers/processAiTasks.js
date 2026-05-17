import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export default async function processAiTasks() {
  const { data: tasks, error } = await supabaseAdmin
    .from("ai_agent_tasks")
    .select("*")
    .eq("status", "pending")
    .limit(10);

  if (error) {
    throw error;
  }

  const results = [];

  for (const task of tasks || []) {
    await supabaseAdmin
      .from("ai_agent_tasks")
      .update({
        status: "processing",
        started_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    console.log("AI_TASK_PROCESSING", task.type);

    await supabaseAdmin
      .from("ai_agent_tasks")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", task.id);

    results.push({
      id: task.id,
      type: task.type,
      status: "completed",
    });
  }

  return {
    success: true,
    processed: results.length,
    results,
  };
}
