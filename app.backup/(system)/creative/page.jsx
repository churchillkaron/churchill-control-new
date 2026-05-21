"use client";

export const dynamic = "force-dynamic";

import PlatformSectionPage
  from "@/components/platform/PlatformSectionPage";

import {
  SYSTEM_REGISTRY,
} from "@/lib/shared/architecture/systemRegistry";

export default function CreativePage() {

  return (

    <PlatformSectionPage

      title="Creative"

      subtitle="Creative systems, media infrastructure and design operations."

      domains={
        SYSTEM_REGISTRY
          .creative
          .domains
      }

    />

  );

}
