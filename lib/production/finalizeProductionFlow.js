import {
  processProductionOrder,
} from "./processProductionOrder";

import {
  postProductionCost,
} from "./postProductionCost";

export async function finalizeProductionFlow(
  supabase,
  orderItem,
  recipeItems
) {

  const result =
    await processProductionOrder(

      supabase,

      orderItem,

      recipeItems
    );

  if (
    !result.success
  ) {

    return {
      success: false,
    };

  }

  await postProductionCost(

    supabase,

    orderItem,

    result.totalCost
  );

  return {

    success: true,

    totalCost:
      result.totalCost,

    usage:
      result.usage,

  };

}
