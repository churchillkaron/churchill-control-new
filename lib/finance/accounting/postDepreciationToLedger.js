import { financeGateway } from "../gateway/financeGateway";

/**
 * DEPRECIATION → EVENT ONLY ENTRY
 */

export async function postDepreciationToLedger(payload) {
  return await financeGateway({
    type: "DEPRECIATION_POSTED",
    payload
  });
}
