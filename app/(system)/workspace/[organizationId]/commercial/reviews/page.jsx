import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import ReviewFeed from "@/components/reviews/ReviewFeed";

export const dynamic = "force-dynamic";

export default function ReviewsPage({ params }) {
  const organizationId = params.organizationId;

  return (
    <main className="min-h-screen bg-black p-6 text-white lg:p-10">
      <div className="mx-auto max-w-6xl">
        <Link
          href={`/workspace/${organizationId}/commercial`}
          className="mb-8 inline-flex items-center gap-2 text-sm text-white/40 transition hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Commercial
        </Link>

        <div className="mb-9">
          <div className="text-xs uppercase tracking-[0.3em] text-[#D6A66A]">
            Commercial / Reputation
          </div>
          <h1 className="mt-3 text-5xl font-light lg:text-6xl">Reviews</h1>
          <p className="mt-4 max-w-3xl text-lg leading-7 text-white/45">
            Monitor Google reviews, publish safe automatic replies, and route
            sensitive feedback to management.
          </p>
        </div>

        <ReviewFeed organizationId={organizationId} />
      </div>
    </main>
  );
}
