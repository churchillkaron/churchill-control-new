"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export const dynamic = "force-dynamic";

export default function IntegrationsRedirect() {

  const router = useRouter();

  const { organizationId } = useParams();

  useEffect(() => {

    if (!organizationId) return;

    router.replace(
      `/workspace/${organizationId}/services/connected-services`
    );

  }, [organizationId, router]);

  return null;

}
