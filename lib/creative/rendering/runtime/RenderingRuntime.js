import { execute } from "@/lib/ubte";

export async function renderContent(task, context) {
  return execute({
    capability: task.capability,
    context,
    payload: task
  });
}
