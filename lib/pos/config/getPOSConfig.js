export function getPOSConfig(industry) {
  switch (industry) {

    case "restaurant":
      return {
        mode: "restaurant",
        features: {
          tables: true,
          modifiers: true,
          productionOptions: true,
          fulfillmentRouting: true,
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
          productionOptions: false,
          fulfillmentRouting: false,
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
          productionOptions: false,
          fulfillmentRouting: false,
          customerRequired: true,
          roomCharge: true,
          barcode: false,
        },
      };

    case "food_service":
      return {
        mode: "food_service",
        features: {
          tables: true,
          modifiers: true,
          productionOptions: false,
          fulfillmentRouting: true,
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
          productionOptions: false,
          fulfillmentRouting: false,
          customerRequired: false,
          barcode: false,
        },
      };
  }
}
