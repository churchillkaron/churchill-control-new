export function getPOSConfig(industry) {
  switch (industry) {

    case "restaurant":
      return {
        mode: "restaurant",
        features: {
          tables: true,
          modifiers: true,
          cookingLevels: true,
          kitchenRouting: true,
          customerRequired: false,
          barcode: false,
        },
      };

    case "retail":
      return {
        mode: "retail",
        features: {
          tables: false,
          modifiers: false,
          cookingLevels: false,
          kitchenRouting: false,
          customerRequired: false,
          barcode: true,
        },
      };

    case "hotel":
      return {
        mode: "hotel",
        features: {
          tables: false,
          modifiers: false,
          cookingLevels: false,
          kitchenRouting: false,
          customerRequired: true,
          roomCharge: true,
          barcode: false,
        },
      };

    case "bar":
      return {
        mode: "bar",
        features: {
          tables: true,
          modifiers: true,
          cookingLevels: false,
          kitchenRouting: true,
          customerRequired: false,
          barcode: false,
        },
      };

    default:
      return {
        mode: "generic",
        features: {
          tables: false,
          modifiers: false,
          cookingLevels: false,
          kitchenRouting: false,
          customerRequired: false,
          barcode: false,
        },
      };
  }
}
