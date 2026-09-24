export const dynamic = "force-dynamic";

import CreativeStudioHub from "@/components/creative/CreativeStudioHub";
import CreativeWorkspaceRenderer from "@/components/creative/runtime/CreativeWorkspaceRenderer";
import { resolveCreativeStudioRuntime } from "@/lib/creative/studio/CreativeStudioRuntime";

export default async function Page({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();
  const workspace = Array.isArray(resolvedParams?.workspace)
    ? resolvedParams.workspace
    : [];

  if (workspace.length === 0) {
    return <CreativeStudioHub organizationId={organizationId} />;
  }

  const runtime = await resolveCreativeStudioRuntime({
    organizationId,
    workspace,
  });

  return <CreativeWorkspaceRenderer runtime={runtime} />;
}
