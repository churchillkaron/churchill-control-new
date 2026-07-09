import { execute } from "@/lib/ubte";

export async function runCreativeRender(task) {
  return execute({
    capability: task.capability,
    context: task.context,
    payload: task.payload
  });
}
