"use client";

import { useState } from "react";

export default function RunCreativePipelineButton({
  runtime,
}) {
  const [loading,setLoading] =
    useState(false);

  async function run() {
    if (loading) return;

    setLoading(true);

    try {
      await fetch(
        "/api/creative/director/execute",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            organization_id:
              runtime.organizationId,
            creative_project_id:
              runtime.projectRuntime?.project?.id,
            brief:
              runtime.projectRuntime?.documents?.CreativeBrief ||
              {},
          }),
        },
      );

      if (
        typeof runtime.refresh === "function"
      ) {
        runtime.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={run}
      disabled={loading}
      className="rounded-xl border border-[#c8a96a]/30 bg-[#b48a45]/10 px-4 py-2 text-sm text-[#d8bd7a] transition hover:bg-[#b48a45]/20 disabled:opacity-50"
    >
      {loading ? "Running..." : "Run AI Pipeline"}
    </button>
  );
}
