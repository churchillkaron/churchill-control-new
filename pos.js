"use client";

import { Suspense } from "react";
import POSContent from "./POSContent";

export default function POSPage() {
  return (
    <Suspense fallback={null}>
      <POSContent />
    </Suspense>
  );
}
