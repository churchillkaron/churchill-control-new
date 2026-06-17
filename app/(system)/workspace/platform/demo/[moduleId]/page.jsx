"use client";

import { useParams } from "next/navigation";
import POSContent from "@/app/(system)/pos/POSContent";

export default function DemoModulePage() {
  const params = useParams();
  const moduleId = params?.moduleId;

  if (moduleId === "pos") {
    return <POSContent />;
  }

  return (
    <div className="p-10 text-white">
      Module not connected yet: {moduleId}
    </div>
  );
}
