import {
  platformRuntime,
} from "../runtime";

export async function executeCapability({

  provider,

  capability,

  context,

  payload,

  estimatedCost = 0,

  budget = "default",

}) {

  return platformRuntime.execute({

    provider,

    capability,

    context,

    payload,

    estimatedCost,

    budget,

  });

}
