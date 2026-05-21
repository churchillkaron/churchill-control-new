export default function validateOrder(
  order
) {

  if (
    !order
  ) {

    return {

      success: false,

      error:
        "ORDER_REQUIRED",
    };
  }

  if (
    !Array.isArray(
      order.items
    ) ||
    order.items.length === 0
  ) {

    return {

      success: false,

      error:
        "ORDER_ITEMS_REQUIRED",
    };
  }

  for (const item of order.items) {

    if (
      !item.name
    ) {

      return {

        success: false,

        error:
          "ITEM_NAME_REQUIRED",
      };
    }

    if (
      Number(
        item.quantity || 0
      ) <= 0
    ) {

      return {

        success: false,

        error:
          "INVALID_QUANTITY",
      };
    }

    if (
      Number(
        item.price || 0
      ) < 0
    ) {

      return {

        success: false,

        error:
          "INVALID_PRICE",
      };
    }
  }

  return {

    success: true,
  };
}
