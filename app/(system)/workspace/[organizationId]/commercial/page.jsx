export const dynamic = "force-dynamic";

import CommercialCommandCenter from "@/components/workspace/commercial/CommercialCommandCenter";

export default async function CommercialWorkspacePage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();

  return <CommercialCommandCenter organizationId={organizationId} />;
}
