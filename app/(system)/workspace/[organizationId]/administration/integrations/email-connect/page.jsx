import EmailIntegrationCard from "@/components/administration/integrations/EmailIntegrationCard";

export default async function EmailConnectPage({ params, searchParams }) {
  const resolved = await params;
  const organizationId = String(resolved?.organizationId || "").trim();
  const resolvedSearch = await searchParams;
  const onboarding = String(resolvedSearch?.onboarding || "") === "1";
  return <EmailIntegrationCard organizationId={organizationId} onboarding={onboarding} />;
}
