import { resolveCreativeStudioRuntime } from "@/lib/creative/studio/CreativeStudioRuntime";
import StudioMain from "@/components/creative/ProductionStudio/StudioMain";

export default async function Page({ params }) {

  const runtime = await resolveCreativeStudioRuntime({
    organizationId: params.organizationId,
    workspace: params.workspace || [],
  });

  return <StudioMain runtime={runtime} />;
}
