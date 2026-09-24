import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function OldMarketingDesignStudioPage({ params }) {
  const { organizationId } = await params;
  redirect(`/workspace/${organizationId}/commercial/design`);
}
