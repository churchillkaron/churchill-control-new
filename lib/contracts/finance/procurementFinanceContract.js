export async function procurementFinanceContract(event, financeGateway) {
  return financeGateway({
    type: event.type,
    payload: {
      ...event.payload,
      sourceModule: "procurement",
    },
  });
}
