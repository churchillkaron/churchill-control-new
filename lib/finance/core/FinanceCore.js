/**
 * FINANCE CORE ACCESS LAYER (SINGLE ENTRY WRAPPER)
 * ALL FINANCE MUST PASS THROUGH HERE
 */

import { financeGateway } from "../gateway/financeGateway";

export async function postFinanceEvent(event) {
  return await financeGateway(event);
}
