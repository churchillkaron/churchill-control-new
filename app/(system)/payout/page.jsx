import { redirect } from "next/navigation";

export default function LegacyPayoutRedirect() {
  redirect("/payroll/payments");
}
