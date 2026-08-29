export const dynamic = "force-dynamic";

import CreativeWorkspaceRenderer from "@/components/creative/runtime/CreativeWorkspaceRenderer";
import { resolveCreativeStudioRuntime } from "@/lib/creative/studio/CreativeStudioRuntime";

export default async function CreativeImagePage({ params }) {
  const resolvedParams = await params;
  const runtime = await resolveCreativeStudioRuntime({
    organizationId: resolvedParams?.organizationId,
    workspace: ["production"],
  });

  return <CreativeWorkspaceRenderer runtime={runtime} />;
}
