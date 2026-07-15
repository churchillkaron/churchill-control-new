import {
  registerFinanceBillingHandler,
} from "@/lib/platform/contracts/finance/FinanceBillingContract";

import {
  financeGateway,
} from "@/lib/finance/runtime/financeGateway";

registerFinanceBillingHandler(
  financeGateway
);
