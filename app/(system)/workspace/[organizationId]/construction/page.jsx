import { redirect } from "next/navigation";

export default async function LegacyConstructionPage({
  params,
}) {
  const resolvedParams = await params;
  const organizationId = encodeURIComponent(
    String(resolvedParams?.organizationId || "")
  );

  redirect(
    `/workspace/${organizationId}/operations/project-execution`
  );
}
