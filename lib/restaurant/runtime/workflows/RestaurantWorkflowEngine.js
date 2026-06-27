import {
  RESTAURANT_WORKFLOWS,
} from "./RestaurantWorkflowRegistry";

export async function executeRestaurantWorkflow({

  workflow,

  payload,

  context,

}) {

  const loader =
    RESTAURANT_WORKFLOWS[
      workflow
    ];

  if (!loader) {
    throw new Error(
      `Unknown workflow: ${workflow}`
    );
  }

  const module =
    await loader();

  return module.execute({

    context,

    ...payload,

  });

}
