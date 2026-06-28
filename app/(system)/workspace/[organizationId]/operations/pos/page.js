"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import StationaryPOSUI from "./StationaryPOS_UI";

export default function POSPage() {
  return (
    <Suspense fallback={null}>
      <StationaryPOSUI />
    </Suspense>
  );
}
