import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function SocialPublishingRedirect({ params }) {
  const organizationId = String(params?.organizationId || "").trim();
  if (!organizationId) redirect("/workspace");
  redirect(`/workspace/${organizationId}/commercial/marketing/campaigns`);
}
