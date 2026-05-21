"use client";

export const dynamic = "force-dynamic";


import Link from "next/link";

export default function StaffEarningsPage() {
  return (
    
      <div className="space-y-8 text-white">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl">Earnings</h1>
          <Link
            href="/staff"
            className="text-sm text-white/60 hover:text-white transition"
          >
            Back to Staff Portal
          </Link>
        </div>

        <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
          <div className="text-xl text-white">Your Earnings</div>
          <div className="text-white/50 text-sm mt-2">
            This page is for each staff member’s own earnings, payout breakdown, and service charge view.
          </div>
        </div>
      </div>
   
  );
}