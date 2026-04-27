"use client";

import { useState } from "react";
import AppShell from '@/app/AppShell'

export default function ReviewsPage() {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

        const res = await fetch("/api/review-ai", {
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

  return (
    <AppShell>
      <div className="space-y-8 text-white max-w-2xl">

        <h1 className="text-3xl">Google Reviews</h1>

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
            {loading ? "Analyzing..." : "Analyze Review"}
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
          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 space-y-2">
            <div>⭐ Rating: {result.rating}</div>
            <div>📝 {result.text}</div>
            <div>📍 Platform: {result.platform}</div>
            <div>✅ Real: {result.is_real ? "Yes" : "No"}</div>
            <div>🎯 Confidence: {result.confidence}</div>
          </div>
        )}

      </div>
    </AppShell>
  );
}