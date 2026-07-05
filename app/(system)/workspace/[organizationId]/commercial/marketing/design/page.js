import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function OldMarketingDesignStudioPage({
  params,
}) {
  redirect(
    `/workspace/${params.organizationId}/commercial/design`
  );
}
