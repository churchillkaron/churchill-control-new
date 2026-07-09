import processVendorPayment from "../capabilities/processVendorPayment";
import { runPaymentPriorityQueue } from "../workflows/runPaymentPriorityQueue";

export async function processVendorPaymentCommand(input) {
  return await processVendorPayment(input);
}

export async function runPaymentPriorityQueueCommand(input) {
  return await runPaymentPriorityQueue(input);
}
