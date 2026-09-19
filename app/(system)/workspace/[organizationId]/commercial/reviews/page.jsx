import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import ReviewFeed from "@/components/reviews/ReviewFeed";

export const dynamic = "force-dynamic";

export default function ReviewsPage({ params }) {
  const organizationId = params.organizationId;

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_0%,rgba(214,166,106,0.15),transparent_30%),linear-gradient(180deg,#12100d_0%,#070707_100%)] p-4 text-[#f4e5d1] lg:p-7">
      <div className="mx-auto max-w-[1680px]">
        <Link
          href={`/workspace/${organizationId}/commercial`}
          className="mb-5 inline-flex items-center gap-2 text-[11px] text-[#d8c2a6]/55 transition hover:text-[#f3dfc2]"
        >
          <ArrowLeft className="h-4 w-4" />
          Commercial
        </Link>

        <div className="mb-5">
          <div className="text-[10px] uppercase tracking-[0.32em] text-[#D6A66A]/80">
            Commercial / Reputation
          </div>
          <h1 className="mt-2 text-[34px] font-light tracking-[-0.045em] lg:text-[42px]">Reviews & Reputation</h1>
          <p className="mt-2 max-w-3xl text-[12px] leading-6 text-[#d6c0a4]/55">
            Monitor Google reviews, publish safe automatic replies, and route
            sensitive feedback to management.
          </p>
        </div>

        <ReviewFeed organizationId={organizationId} />
      </div>
    </main>
  );
}
