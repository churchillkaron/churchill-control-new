import { redirect } from "next/navigation";

export default function PestControlRedirectPage({ params }) {
  const organizationId = encodeURIComponent(
    String(params?.organizationId || ""),
  );

  redirect(
    `/workspace/${organizationId}/operations/field-service`,
  );
}
