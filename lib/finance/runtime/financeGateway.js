import {
  assertFinanceGatewayOnly,
  authorizeFinanceGatewayContext,
} from "./FinanceEntryLock.js";
import { emitAccountingEvent } from "@/lib/finance/general-ledger/events/emitAccountingEvent";

export async function financeGateway(event) {
  const context = authorizeFinanceGatewayContext({});
  assertFinanceGatewayOnly(context);

  const {
    type,
    payload = {},
  } = event || {};

  if (!type) {
    throw new Error("finance