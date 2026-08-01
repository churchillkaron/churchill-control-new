"use client";

export const dynamic = "force-dynamic";

import { Suspense } from "react";
import POSWorkspace from "./POSWorkspace";

export default function POSPage() {
  return (
    <Suspense fallback={null}>
      <POSWorkspace />
    </Suspense>
  );
}
