export const dynamic = "force-dynamic";

import CreativeSpecialistStudio from "@/components/creative/specialist/CreativeSpecialistStudio";
import { resolveCreativeStudioRuntime } from "@/lib/creative/studio/CreativeStudioRuntime";

export default async function CreativeVideoPage({ params, searchParams }) {
  const resolvedParams = await params;
  const resolvedSearchParams = await searchParams;
  const requestedProjectId =
    resolvedSearchParams?.project_id ||
    resolvedSearchParams?.creative_project_id ||
    resolvedSearchParams?.projectId ||
    null;
  const runtime = await resolveCreativeStudioRuntime({
    organizationId: resolvedParams?.organizationId,
    pageId: requestedProjectId,
    workspace: ["production"],
  });

  return <CreativeSpecialistStudio runtime={runtime} mode="video" />;
}
