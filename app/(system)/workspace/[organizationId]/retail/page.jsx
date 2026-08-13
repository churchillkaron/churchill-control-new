import { redirect } from "next/navigation";

export default function RetailLegacyRedirect({ params }) {
  redirect(
    `/workspace/${params.organizationId}/operations/retail`
  );
}
