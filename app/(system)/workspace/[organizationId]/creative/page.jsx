export const dynamic = "force-dynamic";

import WorkspaceHeader from "@/components/workspace/WorkspaceHeader";
import WorkspaceModuleGrid from "@/components/workspace/WorkspaceModuleGrid";
import { getWorkspaceMeta } from "@/lib/platform/registry/erpRegistry";

export default async function CreativePage({ params }) {
  const resolvedParams = await params;
  const organizationId = String(resolvedParams?.organizationId || "").trim();
  const workspace = getWorkspaceMeta("creative");

  return (
    <>
      <WorkspaceHeader
        workspace="Creative"
        title={workspace?.title || "Creative"}
        description={
          workspace?.description ||
          "One front door for design, image, video, voice, music, code, web and marketing work."
        }
      />
      <WorkspaceModuleGrid
        workspace="creative"
        organizationId={organizationId}
      />
    </>
  );
}
