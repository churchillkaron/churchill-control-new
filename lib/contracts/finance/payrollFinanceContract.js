export async function payrollFinanceContract(event, financeGateway) {
  return financeGateway({
    type: event.type,
    payload: {
      ...event.payload,
      sourceModule: "payroll",
    },
  });
}
