export const dynamic = "force-dynamic";

import CreativeWorkspaceRenderer from "@/components/creative/runtime/CreativeWorkspaceRenderer";
import { resolveCreativeStudioRuntime } from "@/lib/creative/studio/CreativeStudioRuntime";

export default async function CreativeStudioPage({ params }) {
  const resolvedParams = await params;
  const runtime = await resolveCreativeStudioRuntime({
    organizationId: resolvedParams?.organizationId,
    workspace: resolvedParams?.workspace || [],
  });

  return <CreativeWorkspaceRenderer runtime={runtime} />;
}
