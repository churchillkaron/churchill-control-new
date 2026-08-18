import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function CompletedServicesRedirect({ params }) {
  const organizationId = String(params?.organizationId || "").trim();
  redirect(
    `/workspace/${encodeURIComponent(organizationId)}/operations/field-service/service-reports`,
  );
}
