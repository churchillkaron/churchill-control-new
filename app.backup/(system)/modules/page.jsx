"use client";

export const dynamic = "force-dynamic";

import PlatformSectionPage
  from "@/components/platform/PlatformSectionPage";

import {
  SYSTEM_REGISTRY,
} from "@/lib/shared/architecture/systemRegistry";

export default function BusinessPage() {

  return (

    <PlatformSectionPage

      title="Business"

      subtitle="Shared business modules and enterprise capabilities."

      domains={
        SYSTEM_REGISTRY
          .business
          .domains
      }

    />

  );

}
