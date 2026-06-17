import { createPayment } from "./lib/pos/createPayment.js";

async function run() {
  try {
    const result = await createPayment({
      tenantId: "cbdc9308-5515-4d38-8e64-edae68dd5872",
      tableNumber: "101",
      paymentMethod: "CASH",
      cashierName: "TEST",
      paidAmount: 1000,
    });

    console.log(
      JSON.stringify(result, null, 2)
    );
  } catch (error) {
    console.error(error);
  }
}

run();
