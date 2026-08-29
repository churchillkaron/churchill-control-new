export const dynamic = "force-dynamic";

import CreativeWorkspaceRenderer from "@/components/creative/runtime/CreativeWorkspaceRenderer";
import { resolveCreativeStudioRuntime } from "@/lib/creative/studio/CreativeStudioRuntime";

export default async function CreativeMusicPage({ params }) {
  const resolvedParams = await params;
  const runtime = await resolveCreativeStudioRuntime({
    organizationId: resolvedParams?.organizationId,
    workspace: ["music"],
  });

  return <CreativeWorkspaceRenderer runtime={runtime} />;
}
