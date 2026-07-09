import CreativeWorkspaceRenderer from "@/components/creative/runtime/CreativeWorkspaceRenderer";
import { resolveCreativeStudioRuntime } from "@/lib/creative/studio/CreativeStudioRuntime";

export default async function Page({
  params,
}) {

  const runtime =
    await resolveCreativeStudioRuntime({

      organizationId:
        params.organizationId,

      workspace:
        params.workspace || [],

    });

  return (
    <CreativeWorkspaceRenderer
      runtime={runtime}
    />
  );

}
