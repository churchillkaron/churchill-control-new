export const dynamic = "force-dynamic";

import CreativeCodeStudio from "@/components/creative/code/CreativeCodeStudio";

export default async function CreativeCodePage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();

  return <CreativeCodeStudio organizationId={organizationId} />;
}
