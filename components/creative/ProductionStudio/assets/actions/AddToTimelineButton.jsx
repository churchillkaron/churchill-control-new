"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

export default function AddToTimelineButton({ asset, addToTimeline }) {
  const [loading, setLoading] = useState(false);

  async function run() {
    if (loading) return;
    setLoading(true);
    try {
      await addToTimeline(asset);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={loading}
      className="inline-flex h-7 shrink-0 items-center gap-1 rounded-lg border border-black/[0.08] bg-white px-2 text-[7px] font-semibold text-[#76583A] transition hover:bg-[#F5EEE5] disabled:opacity-50"
    >
      <Plus size={8} /> {loading ? "Adding…" : "Timeline"}
    </button>
  );
}
