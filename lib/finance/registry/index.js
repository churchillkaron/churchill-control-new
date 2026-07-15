import AccountingWorkspace from "../workspaces/accounting";
import OrderToCashWorkspace from "../workspaces/orderToCash";

export default {
  title: "Finance",
  description:
    "Accounting, tax, treasury, reporting, compliance and accounting-firm operations.",

  groups: [
    AccountingWorkspace,
    OrderToCashWorkspace
  ]
};
