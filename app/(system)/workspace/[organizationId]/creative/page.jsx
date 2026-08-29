export const dynamic = "force-dynamic";

import CreativeStudioHub from "@/components/creative/CreativeStudioHub";

export default async function CreativePage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();

  return <CreativeStudioHub organizationId={organizationId} />;
}
