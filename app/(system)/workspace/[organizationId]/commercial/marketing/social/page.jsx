import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SocialPublishingRedirect({ params }) {
  const resolved = await params;
  const organizationId = String(resolved?.organizationId || "").trim();
  if (!organizationId) redirect("/workspace");
  redirect(`/workspace/${organizationId}/commercial/marketing/campaigns`);
}
