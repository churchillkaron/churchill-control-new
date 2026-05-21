"use client";
export const dynamic = "force-dynamic";
import { useState, useEffect } from "react";

export default function InvoicePage() {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [event, setEvent] = useState(null);
  const [leaderboard, setLeaderboard] = useState([]);
  const [myRank, setMyRank] = useState(null);

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImage(file);
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setError("");
  };

  const handleUpload = async () => {
    if (!image) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const reader = new FileReader();
      reader.readAsDataURL(image);

      reader.onloadend = async () => {
        const base64 = reader.result;

        const res = await fetch("/api/invoice-ai", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ image: base64 }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed");
        } else {
          setResult(data);
        }

        setLoading(false);
      };
    } catch (err) {
      setError("Upload failed");
      setLoading(false);
    }
  };

  // ✅ NEW: APPROVE / REJECT HANDLER
  const handleDecision = async (status) => {
    if (!result) return;

    try {
      setLoading(true);

      const res = await fetch("/api/invoices/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ...result,
          status, // "approved_manager" or "rejected"
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Update failed");
      } else {
        setResult({ ...result, status });
      }
    } catch (err) {
      setError("Action failed");
    } finally {
      setLoading(false);
    }
  };

  const loadCompetition = async () => {
    try {
      const res = await fetch("/api/events/active");
      const eventData = await res.json();

      if (!eventData?.id) return;

      setEvent(eventData);

      const lbRes = await fetch(
        `/api/events/leaderboard?event_id=${eventData.id}`
      );
      const lbData = await lbRes.json();

      setLeaderboard(lbData.leaderboard || []);

      const userId = "CURRENT_USER_ID"; // replace later

      const full = lbData.full || [];
      const index = full.findIndex((x) => x.staff_id === userId);

      if (index !== -1) {
        setMyRank({
          rank: index + 1,
          score: full[index].score,
        });
      }
    } catch (err) {
      console.error("Competition load failed");
    }
  };

  useEffect(() => {
    loadCompetition();
  }, []);

  return (
    <div className="space-y-8 text-white max-w-2xl">

      <h1 className="text-3xl">AI Invoice</h1>

      {/* Upload */}
      <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
        <input type="file" accept="image/*" onChange={handleFile} />

        {preview && (
          <img
            src={preview}
            alt="preview"
            className="rounded-xl border border-white/10"
          />
        )}

        <button
          onClick={handleUpload}
          className="bg-orange-500 hover:bg-orange-600 px-4 py-2 rounded-xl"
        >
          {loading ? "Analyzing..." : "Analyze Invoice"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">
          <div>🏪 Supplier: {result.supplier}</div>
          <div>💰 Total: {result.total}</div>
          <div>📅 Date: {result.date}</div>
          <div>📄 Items: {JSON.stringify(result.items)}</div>

          {/* ✅ NEW: APPROVAL BUTTONS */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => handleDecision("approved_manager")}
              className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded-xl"
              disabled={loading}
            >
              Approve
            </button>

            <button
              onClick={() => handleDecision("rejected")}
              className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-xl"
              disabled={loading}
            >
              Reject
            </button>
          </div>

          {result.status && (
            <div className="pt-2 text-sm opacity-70">
              Status: {result.status}
            </div>
          )}
        </div>
      )}

      {/* Competition */}
      {event && (
        <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-4">

          <h2 className="text-xl">🔥 {event.name}</h2>

          <div className="space-y-2">
            {leaderboard.map((user, i) => (
              <div
                key={user.staff_id}
                className="flex justify-between bg-white/5 px-4 py-2 rounded-xl"
              >
                <div>
                  {i === 0 && "🥇"}
                  {i === 1 && "🥈"}
                  {i === 2 && "🥉"} Staff {user.staff_id}
                </div>
                <div>{user.score}</div>
              </div>
            ))}
          </div>

          {myRank && (
            <div className="pt-4 border-t border-white/10">
              <div>Your Rank: #{myRank.rank}</div>
              <div>Your Score: {myRank.score}</div>
            </div>
          )}
        </div>
      )}

    </div>
  );
}