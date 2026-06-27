import {
  executeRestaurantWorkflow,
} from "../workflows/RestaurantWorkflowEngine";

export async function executeRestaurantCapability({

  workflow,

  context,

  payload,

}) {

  return await executeRestaurantWorkflow({

    workflow,

    context,

    payload,

  });

}
