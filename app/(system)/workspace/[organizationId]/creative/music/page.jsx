export const dynamic = "force-dynamic";

import CreativeSpecialistStudio from "@/components/creative/specialist/CreativeSpecialistStudio";
import { resolveCreativeStudioRuntime } from "@/lib/creative/studio/CreativeStudioRuntime";

export default async function CreativeMusicPage({ params, searchParams }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const runtime = await resolveCreativeStudioRuntime({
    organizationId: resolvedParams?.organizationId,
    pageId: resolvedSearchParams?.project || null,
    workspace: ["music"],
  });

  return <CreativeSpecialistStudio runtime={runtime} mode="music" />;
}
