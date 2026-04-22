"use client";

import { useEffect, useRef, useState } from "react";
import * as htmlToImage from "html-to-image";

export default function MarketingPage() {
  const designRef = useRef();

  const [processedImage, setProcessedImage] = useState(null);
  const [idea, setIdea] = useState("");
  const [headline, setHeadline] = useState("");
  const [sub, setSub] = useState("");
  const [cta, setCta] = useState("");
  const [template, setTemplate] = useState("food");

  const [saved, setSaved] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("campaigns");
    if (stored) setSaved(JSON.parse(stored));
  }, []);

  useEffect(() => {
    localStorage.setItem("campaigns", JSON.stringify(saved));
  }, [saved]);

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    setProcessing(true);

    const res = await fetch("/api/ai/image", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    if (data.image) setProcessedImage(data.image);

    setProcessing(false);
  }

  async function generateDesign() {
    setAiLoading(true);

    const res = await fetch("/api/ai/design", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ idea }),
    });

    const data = await res.json();

    setHeadline(data.headline);
    setSub(data.sub);
    setCta(data.cta);
    setTemplate(data.template || "food");

    setAiLoading(false);
  }

  async function downloadImage() {
    const dataUrl = await htmlToImage.toPng(designRef.current);

    const link = document.createElement("a");
    link.download = "churchill-post.png";
    link.href = dataUrl;
    link.click();
  }

  function saveCampaign() {
    const newItem = {
      id: Date.now(),
      headline,
      sub,
      cta,
      template,
      image: processedImage,
    };

    setSaved((prev) => [newItem, ...prev]);
  }

  async function postToFacebook() {
    if (!processedImage) return alert("No image");

    setPosting(true);

    const message = `${headline}\n\n${sub}\n\n${cta}`;

    const res = await fetch("/api/meta/post", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message,
        imageUrl: processedImage,
      }),
    });

    const data = await res.json();

    if (data.success) {
      alert("Posted to Facebook ✅");
    } else {
      alert(data.error || "Failed");
    }

    setPosting(false);
  }

  return (
    <div
      className="min-h-screen text-white"
      style={{
        backgroundImage: "url('/bg-beach.jpg')",
        backgroundSize: "cover",
      }}
    >
      <div className="bg-black/70 min-h-screen px-6 pt-24">

        {/* HEADER */}
        <div className="text-center mb-12">
          <div className="text-orange-500 tracking-[0.4em] text-sm">
            CHURCHILL
          </div>
          <h1 className="text-5xl font-light">
            Marketing Engine
          </h1>
        </div>

        {/* PANEL */}
        <div className="max-w-4xl mx-auto bg-black/60 border border-white/10 p-6 rounded-xl mb-10">

          <input type="file" onChange={handleUpload} />

          <input
            placeholder="Campaign idea"
            value={idea}
            onChange={(e) => setIdea(e.target.value)}
            className="w-full mt-3 p-3 bg-black border border-white/10"
          />

          <div className="flex gap-3 mt-4">

            <button
              onClick={generateDesign}
              className="bg-purple-600 px-4 py-2 rounded"
            >
              {aiLoading ? "..." : "Generate"}
            </button>

            <button
              onClick={downloadImage}
              className="bg-green-600 px-4 py-2 rounded"
            >
              Download
            </button>

            <button
              onClick={saveCampaign}
              className="bg-orange-500 px-4 py-2 rounded"
            >
              Save
            </button>

            <button
              onClick={postToFacebook}
              className="bg-blue-600 px-4 py-2 rounded"
            >
              {posting ? "Posting..." : "Post FB"}
            </button>

          </div>

        </div>

        {/* DESIGN */}
        <div className="flex justify-center mb-12">
          <div
            ref={designRef}
            className="relative w-[420px] h-[420px] bg-black rounded-xl overflow-hidden"
          >
            {processedImage && (
              <img
                src={processedImage}
                className="absolute w-full h-full object-cover"
              />
            )}

            <div className="absolute inset-0 bg-black/50" />

            <div className="absolute bottom-0 p-5">
              <h2 className="text-xl">{headline}</h2>
              <p className="text-sm">{sub}</p>
              <div className="mt-2 text-xs border px-2 py-1 inline-block">
                {cta}
              </div>
            </div>

          </div>
        </div>

        {/* SAVED */}
        <div className="max-w-4xl mx-auto">
          <h3>Saved Campaigns</h3>

          <div className="grid grid-cols-3 gap-4 mt-3">
            {saved.map((c) => (
              <div key={c.id}>
                <img src={c.image} />
                <p>{c.headline}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}