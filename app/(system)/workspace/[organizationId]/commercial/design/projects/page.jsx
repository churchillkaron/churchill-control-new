import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function OldCreativeProjectsPage({
  params,
}) {
  redirect(
    `/workspace/${params.organizationId}/commercial/design/projects`
  );
}
