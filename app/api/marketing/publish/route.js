"use client";

import { useState } from "react";

const PREVIEWS = [
  { id: 1, title: "Luxury Cinematic", style: "luxury" },
  { id: 2, title: "High-Energy Social", style: "party" },
  { id: 3, title: "Elegant Brand Story", style: "minimal" },
];

function cn(...c) {
  return c.filter(Boolean).join(" ");
}

function buildPrompt(style) {
  let base = "premium hospitality campaign visual";

  if (style === "luxury") base += ", luxury sunset lighting";
  if (style === "party") base += ", nightlife energy";
  if (style === "minimal") base += ", clean minimal branding";

  return base + ", ultra realistic";
}

export default function Page() {
  const [images, setImages] = useState([]);
  const [videos, setVideos] = useState([]);
  const [visible, setVisible] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  async function generate() {
    setLoading(true);
    setImages([]);
    setVideos([]);
    setVisible([]);
    setSelected(null);

    try {
      const results = await Promise.all(
        PREVIEWS.map(async (p) => {
          const res = await fetch("/api/ai/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              prompt: buildPrompt(p.style),
            }),
          });
          return res.json();
        })
      );

      const urls = results.map((r) => r.url || "/bg-beach.jpg");
      setImages(urls);

      urls.forEach((_, i) => {
        setTimeout(() => {
          setVisible((prev) => [...prev, i]);
        }, 400 * (i + 1));
      });

    } catch (err) {
      console.error(err);
    }

    setTimeout(() => setLoading(false), 1200);
  }

  async function generateVideo() {
    if (selected === null) return;

    setLoading(true);

    try {
      const res = await fetch("/api/ai/video", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          image: images[selected],
        }),
      });

      const data = await res.json();

      const updated = [...videos];
      updated[selected] = data.url;

      setVideos(updated);

    } catch (err) {
      console.error(err);
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen text-white p-10 bg-black">

      <h1 className="text-3xl mb-6">AI Creative Studio</h1>

      <button
        onClick={generate}
        className="bg-orange-500 text-black px-6 py-3 rounded mb-8"
      >
        {loading ? "Generating..." : "Generate Concepts"}
      </button>

      {/* GRID */}
      <div className="grid grid-cols-3 gap-4 mb-10">

        {PREVIEWS.map((p, i) => (
          <div
            key={i}
            className={cn(
              "border rounded overflow-hidden cursor-pointer",
              selected === i ? "border-orange-400" : "border-white/10"
            )}
            onClick={() => setSelected(i)}
          >

            <div className="h-48 bg-black">

              {!visible.includes(i) ? (
                <div className="h-full flex items-center justify-center bg-white/10 text-xs">
                  Loading...
                </div>
              ) : videos[i] ? (
                <video
                  src={videos[i]}
                  autoPlay
                  loop
                  muted
                  className="w-full h-full object-cover"
                />
              ) : (
                <img
                  src={images[i]}
                  className="w-full h-full object-cover"
                />
              )}

            </div>

            <div className="p-2 text-sm">{p.title}</div>

          </div>
        ))}

      </div>

      {/* ACTIONS */}
      {selected !== null && (
        <div className="flex gap-4">

          <button
            onClick={generateVideo}
            className="bg-orange-500 text-black px-5 py-2 rounded"
          >
            Create Video From Image
          </button>

        </div>
      )}

    </div>
  );
}