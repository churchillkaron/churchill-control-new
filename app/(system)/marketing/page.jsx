"use client";

import Link from "next/link";

const cards = [
  {
    title: "Design Engine",
    desc: "Render, generate new, or re-scene campaign visuals.",
    href: "/marketing/design",
  },
  {
    title: "Social Media",
    desc: "Create Instagram and Facebook campaign posts.",
    href: "/marketing/social",
  },
  {
    title: "Email",
    desc: "Build branded email campaign creatives.",
    href: "/marketing/email",
  },
  {
    title: "WhatsApp",
    desc: "Create short promo visuals and message formats.",
    href: "/marketing/whatsapp",
  },
];

export default function MarketingPage() {
  return (
    <div className="min-h-screen relative text-white">

      {/* BG */}
      <div className="absolute inset-0">
        <img
          src="/bg-beach.jpg"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/70" />
      </div>

      <div className="relative z-10 pt-24 px-6 max-w-5xl mx-auto">

        {/* HEADER */}
        <div className="text-center mb-12">
          <p className="text-orange-400 tracking-[0.25em] text-xs mb-2">
            CHURCHILL
          </p>

          <h1 className="text-4xl md:text-5xl font-light mb-3">
            Marketing Engine
          </h1>

          <p className="text-gray-400 text-lg">
            Design. Social. Email. WhatsApp.
          </p>
        </div>

        {/* CARDS */}
        <div className="grid md:grid-cols-2 gap-6">

          {cards.map((c, i) => (
            <div
              key={i}
              className="bg-black/60 border border-white/10 rounded-2xl p-6 backdrop-blur-md hover:border-orange-400 transition"
            >
              <p className="text-orange-400 text-xs tracking-[0.2em] mb-3">
                CHURCHILL SYSTEM
              </p>

              <h2 className="text-2xl font-light mb-3">
                {c.title}
              </h2>

              <p className="text-gray-400 text-sm mb-6">
                {c.desc}
              </p>

              <Link
                href={c.href}
                className="inline-block border border-orange-400 text-orange-400 px-4 py-2 text-sm tracking-widest hover:bg-orange-400 hover:text-black transition"
              >
                OPEN
              </Link>
            </div>
          ))}

        </div>

      </div>
    </div>
  );
}