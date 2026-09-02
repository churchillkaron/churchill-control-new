export const dynamic = "force-dynamic";

import CreativeSpecialistStudio from "@/components/creative/specialist/CreativeSpecialistStudio";
import { resolveCreativeStudioRuntime } from "@/lib/creative/studio/CreativeStudioRuntime";

export default async function CreativeImagePage({ params }) {
  const resolvedParams = await params;
  const runtime = await resolveCreativeStudioRuntime({
    organizationId: resolvedParams?.organizationId,
    workspace: ["assets"],
  });

  return <CreativeSpecialistStudio runtime={runtime} mode="image" />;
}
