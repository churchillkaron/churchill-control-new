export async function restaurantFinanceContract(event, financeGateway) {
  return financeGateway({
    type: event.type,
    payload: {
      ...event.payload,
      sourceModule: "restaurant",
    },
  });
}
