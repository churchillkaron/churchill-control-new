import { grantFinancePermission } from "@/lib/finance/security/capabilities/grantFinancePermission";
import { assignFinanceRole } from "@/lib/finance/security/capabilities/assignFinanceRole";
import { checkFinancePermission } from "@/lib/shared/auth/checkFinancePermission";
import { getFinanceSecurityOverview } from "@/lib/finance/security/reports/getFinanceSecurityOverview";

export async function grantPermission(command) {
  return await grantFinancePermission(command);
}

export async function assignRole(command) {
  return await assignFinanceRole(command);
}

export async function checkPermission(command) {
  return await checkFinancePermission(command);
}

export async function getOverview() {
  return await getFinanceSecurityOverview();
}
