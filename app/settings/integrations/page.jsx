import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LegacyIntegrationsRedirect({ searchParams }) {
  const resolvedSearchParams = await searchParams;
  const organizationId = String(
    resolvedSearchParams?.organizationId || resolvedSearchParams?.organization_id || "",
  ).trim();

  if (!organizationId) {
    redirect("/");
  }

  redirect(
    `/workspace/${encodeURIComponent(organizationId)}/administration/integrations#google-business`,
  );
}
