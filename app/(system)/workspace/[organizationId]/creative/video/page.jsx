export const dynamic = "force-dynamic";

import CreativeSpecialistStudio from "@/components/creative/specialist/CreativeSpecialistStudio";
import { resolveCreativeStudioRuntime } from "@/lib/creative/studio/CreativeStudioRuntime";

export default async function CreativeVideoPage({ params }) {
  const resolvedParams = await params;
  const runtime = await resolveCreativeStudioRuntime({
    organizationId: resolvedParams?.organizationId,
    workspace: ["production"],
  });

  return <CreativeSpecialistStudio runtime={runtime} mode="video" />;
}
