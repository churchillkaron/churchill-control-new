import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function OldNewCreativeProjectPage({
  params,
}) {
  redirect(
    `/workspace/${params.organizationId}/commercial/design/projects?action=create_project`
  );
}
