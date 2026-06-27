/**
 * FINANCE CORE ACCESS LAYER (SINGLE ENTRY WRAPPER)
 * ALL FINANCE MUST PASS THROUGH HERE
 */

import { financeGateway } from "@/lib/finance/runtime/financeGateway";

export async function postFinanceEvent(event) {
  return await financeGateway(event);
}
