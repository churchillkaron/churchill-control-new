"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getCurrentTenant } from "@/lib/tenant";

const PREVIEWS = [
  { id: 1, style: "luxury" },
  { id: 2, style: "party" },
  { id: 3, style: "minimal" },
];

function buildPrompt(style) {
  let base = "premium hospitality campaign visual";

  if (style === "luxury") base += ", luxury sunset lighting";
  if (style === "party") base += ", nightlife energy";
  if (style === "minimal") base += ", clean minimal branding";

  return base;
}

export default function Page() {
  const [images, setImages] = useState([]);
  const [visible, setVisible] = useState([]);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await getCurrentTenant();
        setTenant(data);
      } catch (err) {
        console.error("Tenant load error:", err);
      }
    }

    load();
  }, []);

  async function generate() {
    if (!tenant || loading) return;

    setLoading(true);
    setImages([]);
    setVisible([]);

    try {
      const { user, client } = tenant;

      const results = await Promise.all(
        PREVIEWS.map(async (p) => {
          const res = await fetch("/api/ai/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: buildPrompt(p.style) }),
          });

          return res.json();
        })
      );

      const urls = results.map((r) => r.url).filter(Boolean);

      setImages(urls);

      urls.forEach((_, i) => {
        setTimeout(() => {
          setVisible((prev) => [...prev, i]);
        }, 300 * (i + 1));
      });

      // 🔥 SAFE INSERT
      if (user?.id && client?.id && urls.length > 0) {
        const { error } = await supabase.from("campaigns").insert([
          {
            user_id: user.id,
            client_id: client.id,
            images: urls,
            created_at: new Date().toISOString(),
          },
        ]);

        if (error) {
          console.error("Supabase insert error:", error);
        }
      }
    } catch (err) {
      console.error("Generate error:", err);
    }

    setLoading(false);
  }

  return (
    <div className="p-6">

      <h1 className="text-4xl mb-6">Creative Studio</h1>

      <button
        onClick={generate}
        disabled={loading}
        className="bg-orange-500 px-6 py-3 rounded text-black mb-8 disabled:opacity-50"
      >
        {loading ? "Generating..." : "Generate"}
      </button>

      <div className="grid grid-cols-3 gap-4">
        {images.map((img, i) => (
          <div
            key={i}
            className={`transition-opacity duration-700 ${
              visible.includes(i) ? "opacity-100" : "opacity-0"
            }`}
          >
            <img
              src={img}
              className="w-full h-48 object-cover rounded"
              alt="generated"
            />
          </div>
        ))}
      </div>

    </div>
  );
}