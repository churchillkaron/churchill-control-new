import { financeGateway } from "../gateway/financeGateway";

/**
 * YEAR END → EVENT ONLY ENTRY
 */

export default async function runYearEndClose(payload) {
  return await financeGateway({
    type: "YEAR_END_CLOSE",
    payload
  });
}
