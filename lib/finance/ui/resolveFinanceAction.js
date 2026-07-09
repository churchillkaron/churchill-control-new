import { ERP_REGISTRY } from "@/lib/erp/registry";

export function resolveFinanceAction({ route, actionId }) {
  const action = ERP_REGISTRY.finance?.actions?.[actionId];

  if (!action) {
    throw new Error("FINANCE_ACTION_NOT_FOUND");
  }

  return action;
}
