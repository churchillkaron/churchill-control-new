"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export const dynamic = "force-dynamic";

export default function Success() {
  const params = useSearchParams();

  useEffect(() => {
    const session = params.get("session_id");

    if (session) {
      console.log("Session:", session);
    }
  }, [params]);

  return (
    <div className="min-h-screen flex items-center justify-center text-white">
      <h1>Payment Success</h1>
    </div>
  );
}