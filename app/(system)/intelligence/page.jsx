import { redirect } from "next/navigation";

export default function LegacyIntelligencePage({ searchParams }) {
  const organizationId = String(searchParams?.organizationId || "").trim();
  if (organizationId) {
    redirect(`/workspace/${encodeURIComponent(organizationId)}/ai`);
  }
  redirect("/start");
}
