import {
  getWorkflow,
} from "@/lib/workflows/registerWorkflow";

export async function runWorkflow({

  key,

  payload = {},

}) {

  const workflow =
    getWorkflow(key);

  if (!workflow) {

    throw new Error(
      `Workflow not found: ${key}`
    );

  }

  console.log(
    "[WORKFLOW_RUN]",
    key
  );

  return await workflow(
    payload
  );

}
