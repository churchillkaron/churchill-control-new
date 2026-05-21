"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";

export default function StaffFeedbackPage() {
  const [rejectedItems, setRejectedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [staffName, setStaffName] = useState("");

  // 🔥 LOAD SHIFT USER
  useEffect(() => {
    const shift = JSON.parse(localStorage.getItem("shift") || "null");

    if (shift?.name) {
      setStaffName(shift.name);
    }
  }, []);

  // 🔥 FETCH REJECTED ITEMS (ONLY TODAY + CURRENT STAFF)
  const fetchRejected = async () => {
    try {
      const res = await fetch("/api/assets/list");
      const data = await res.json();

      if (!data.success) return;

      const today = new Date().toDateString();

      const filtered = (data.assets || []).filter((item) => {
        const itemDate = new Date(item.created_at).toDateString();

        return (
          item.status === "rejected" &&
          item.uploaded_by === staffName &&
          itemDate === today
        );
      });

      setRejectedItems(filtered);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (staffName) {
      fetchRejected();
    }
  }, [staffName]);

  return (
    <div className="min-h-screen bg-black text-white px-4 py-6">
      <div className="max-w-2xl mx-auto space-y-6">

        <div>
          <h1 className="text-2xl font-semibold">Fix Rejected Items</h1>
          <p className="text-white/50 text-sm mt-1">
            You must fix these before completing your shift
          </p>
        </div>

        {loading ? (
          <div className="text-white/40">Loading...</div>
        ) : rejectedItems.length === 0 ? (
          <div className="rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-green-300">
            ✅ No rejected items — you're good
          </div>
        ) : (
          <div className="space-y-4">
            {rejectedItems.map((item) => (
              <div
                key={item.id}
                className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 space-y-3"
              >
                {/* IMAGE */}
                <div className="rounded-xl overflow-hidden bg-white/10">
                  {item.url ? (
                    <img
                      src={item.url}
                      alt="Rejected"
                      className="w-full max-h-[300px] object-cover"
                    />
                  ) : (
                    <div className="p-6 text-white/40 text-sm">
                      No image
                    </div>
                  )}
                </div>

                {/* INFO */}
                <div>
                  <div className="text-sm text-white/50">
                    {item.category} • {item.department}
                  </div>
                  <div className="text-red-300 text-sm mt-1">
                    ❌ {item.note || "No reason provided"}
                  </div>
                </div>

                {/* ACTION */}
                <button
                  onClick={() => {
                    localStorage.setItem("fixCategory", item.category);
                    window.location.href = "/staff/upload";
                  }}
                  className="w-full rounded-xl px-4 py-3 bg-[#ff7a00] hover:bg-orange-600 text-black font-medium"
                >
                  Fix & Re-upload
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}