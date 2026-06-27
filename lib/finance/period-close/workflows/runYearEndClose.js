import { financeGateway } from "@/lib/finance/runtime/financeGateway";

/**
 * YEAR END → EVENT ONLY ENTRY
 */

export default async function runYearEndClose(payload) {
  return await financeGateway({
    type: "YEAR_END_CLOSE",
    payload
  });
}
