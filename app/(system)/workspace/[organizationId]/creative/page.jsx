import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function CreativePage({
  params,
}) {
  redirect(
    `/workspace/${params.organizationId}/commercial/design?workspace=mission_control`
  );
}
