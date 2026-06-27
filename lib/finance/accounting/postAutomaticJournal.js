import { financeGateway } from "../gateway/financeGateway";

/**
 * AUTO JOURNAL → EVENT ONLY ENTRY
 */

export async function postAutomaticJournal(payload) {
  return await financeGateway({
    type: "AUTO_JOURNAL",
    payload
  });
}
