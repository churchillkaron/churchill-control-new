import { redirect } from "next/navigation";

export default function LegacyWorkforceRedirect() {
  redirect("/staff/documents/upload");
}
