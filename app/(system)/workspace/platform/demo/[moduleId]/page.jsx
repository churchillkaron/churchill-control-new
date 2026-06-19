"use client";

import { useParams } from "next/navigation";

export default function DemoModulePage() {
  const params = useParams();
  const moduleId = params?.moduleId;

  return (
    <div className="p-10 text-white">
      Demo module disabled: {moduleId}
    </div>
  );
}
