import {
  postPaymentToLedger,
} from "@/lib/finance/accounting/postPaymentToLedger";

export async function paymentCompletedWorkflow({
  payment,
}) {

  await postPaymentToLedger({
    payment,
  });

}
