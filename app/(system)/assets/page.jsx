"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import AppShell from "../../AppShell";

const STATUSES = [
  { key: "pending_approval", label: "Pending" },
  { key: "approved_manager", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

const TYPES = ["all", "routine", "quality", "marketing"];

export default function AssetsPage() {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("pending_approval");
  const [typeFilter, setTypeFilter] = useState("all");
  const [preview, setPreview] = useState(null);
  const [actionLoading, setActionLoading] = useState("");

  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = async () => {
    setLoading(true);

    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("ASSETS ERROR:", error);
      setAssets([]);
    } else {
      setAssets(data || []);
    }

    setLoading(false);
  };

  const filtered = useMemo(() => {
    return assets.filter((a) => {
      const statusMatch = a.status === statusFilter;
      const typeMatch =
        typeFilter === "all" || a.type === typeFilter;

      return statusMatch && typeMatch;
    });
  }, [assets, statusFilter, typeFilter]);

  const counts = useMemo(() => {
    return {
      pending: assets.filter((a) => a.status === "pending_approval").length,
      approved: assets.filter((a) => a.status === "approved_manager").length,
      rejected: assets.filter((a) => a.status === "rejected").length,
    };
  }, [assets]);

  const updateStatus = async (id, status) => {
    try {
      setActionLoading(`${id}-${status}`);

      const { error } = await supabase
        .from("assets")
        .update({ status })
        .eq("id", id);

      if (error) {
        console.error("UPDATE ERROR:", error);
      }

      await loadAssets();
    } finally {
      setActionLoading("");
    }
  };

  return (
    <AppShell>
      <div className="p-6 text-white max-w-7xl mx-auto space-y-6">

        {/* HEADER */}
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-semibold">Assets Approval</h1>
            <p className="text-white/50 text-sm">
              Routine, quality and marketing validation
            </p>
          </div>

          <button
            onClick={loadAssets}
            className="bg-white/10 px-4 py-2 rounded-xl"
          >
            Refresh
          </button>
        </div>

        {/* METRICS */}
        <div className="grid grid-cols-3 gap-4">
          <Card title="Pending" value={counts.pending} />
          <Card title="Approved" value={counts.approved} />
          <Card title="Rejected" value={counts.rejected} />
        </div>

        {/* STATUS FILTER */}
        <div className="flex gap-3">
          {STATUSES.map((s) => (
            <button
              key={s.key}
              onClick={() => setStatusFilter(s.key)}
              className={`px-4 py-2 rounded-xl ${
                statusFilter === s.key
                  ? "bg-orange-500 text-black"
                  : "bg-white/10"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* TYPE FILTER */}
        <div className="flex gap-3">
          {TYPES.map((t) => (
            <button
              key={t}
              onClick={() => setTypeFilter(t)}
              className={`px-4 py-2 rounded-xl capitalize ${
                typeFilter === t
                  ? "bg-white text-black"
                  : "bg-white/10"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* LIST */}
        {loading ? (
          <p className="text-white/50">Loading...</p>
        ) : filtered.length === 0 ? (
          <p className="text-white/40">No items</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3"
              >
                {/* IMAGE */}
                <div
                  className="h-40 bg-black/40 rounded-xl overflow-hidden cursor-pointer"
                  onClick={() => setPreview(item)}
                >
                  {item.url ? (
                    <img
                      src={item.url}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-white/30">
                      No image
                    </div>
                  )}
                </div>

                {/* INFO */}
                <div>
                  <div className="font-medium capitalize">
                    {item.type}
                  </div>
                  <div className="text-sm text-white/50">
                    {item.department}
                  </div>
                  <div className="text-xs text-white/40">
                    {item.uploaded_by}
                  </div>
                </div>

                {item.note && (
                  <div className="text-sm bg-white/5 p-2 rounded">
                    {item.note}
                  </div>
                )}

                {/* ACTIONS */}
                {statusFilter === "pending_approval" && (
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        updateStatus(item.id, "approved_manager")
                      }
                      disabled={actionLoading === `${item.id}-approved_manager`}
                      className="bg-green-500 px-3 py-1 rounded text-black"
                    >
                      {actionLoading === `${item.id}-approved_manager`
                        ? "..."
                        : "Approve"}
                    </button>

                    <button
                      onClick={() =>
                        updateStatus(item.id, "rejected")
                      }
                      disabled={actionLoading === `${item.id}-rejected`}
                      className="bg-red-500 px-3 py-1 rounded"
                    >
                      {actionLoading === `${item.id}-rejected`
                        ? "..."
                        : "Reject"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* PREVIEW */}
        {preview && (
          <div
            className="fixed inset-0 bg-black/90 flex items-center justify-center"
            onClick={() => setPreview(null)}
          >
            <img
              src={preview.url}
              className="max-h-[90vh] max-w-[90vw]"
            />
          </div>
        )}
      </div>
    </AppShell>
  );
}

function Card({ title, value }) {
  return (
    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
      <div className="text-sm text-white/50">{title}</div>
      <div className="text-2xl">{value}</div>
    </div>
  );
}