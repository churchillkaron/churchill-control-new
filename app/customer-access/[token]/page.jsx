"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

export default function CustomerAccessPage() {
  const params = useParams();
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const token = String(params?.token || "").trim();
    if (!token) {
      setError("Customer access link is missing.");
      return;
    }
    fetch(`/api/customer-portal/access/${encodeURIComponent(token)}`, {
      method: "POST",
      cache: "no-store",
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.error || "Unable to open customer portal");
        }
        window.location.replace(payload.redirect || "/customer-portal");
      })
      .catch((accessError) => {
        if (active) setError(accessError?.message || "Unable to open customer portal");
      });
    return () => { active = false; };
  }, [params?.token]);

  return <main className="flex min-h-screen items-center justify-center bg-[#F7F3EC] px-5 text-[#171614]">
    <div className="w-full max-w-lg rounded-[24px] border border-black/[.07] bg-white p-7 text-center shadow-[0_18px_48px_rgba(48,35,22,.05)]">
      <div className="text-[8px] font-semibold uppercase tracking-[.18em] text-[#9A744B]">AVANTIQO CUSTOMER PORTAL</div>
      <h1 className="mt-3 text-[28px] font-medium tracking-[-.035em]">{error ? "This access link cannot be opened." : "Opening your secure customer portal…"}</h1>
      <p className="mt-3 text-[10px] leading-5 text-[#756E66]">{error || "The link is being exchanged for a private customer session. The original access token can only be used once."}</p>
    </div>
  </main>;
}
