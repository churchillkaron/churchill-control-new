import { registerWorkflow } from "@/lib/ubte/workflows/WorkflowRegistry";

export default registerWorkflow({
  id: "restaurant.dinnerService",
  domain: "restaurant",
  name: "Restaurant Dinner Service",
  version: "1.0.0",
  description:
    "Standard restaurant flow from opening a session to changing customer and preparing for ordering.",

  steps: [
    {
      id: "openSession",
      domain: "restaurant",
      capability: "session",
      action: "OpenSession",
    },
  ],
});
