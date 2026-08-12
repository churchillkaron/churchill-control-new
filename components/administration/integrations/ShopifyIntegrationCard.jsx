"use client";

import { useState } from "react";

export default function ShopifyIntegrationCard({ organizationId }) {
  const [shop, setShop] = useState("");
  const normalized = shop.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");

  function connect() {
    if (!normalized) return;
    window.location.href = `/api/shopify/auth?organizationId=${encodeURIComponent(organizationId)}&shop=${encodeURIComponent(normalized)}`;
  }

  return (
    <main className="min-h-screen bg-black p-6 text-white lg:p-10">
      <div className="mx-auto max-w-3xl rounded-[30px] border border-white/10 bg-white/[0.025] p-6 lg:p-8">
        <a href={`/workspace/${encodeURIComponent(organizationId)}/administration/integrations`} className="text-sm text-[#D6A66A]">← Integrations</a>
        <div className="mt-8 text-xs uppercase tracking-[0.22em] text-white/30">Commerce</div>
        <h1 className="mt-2 text-4xl font-light">Connect Shopify</h1>
        <p className="mt-3 text-sm leading-6 text-white/45">Enter the business Shopify store. You will be sent to Shopify to approve Avantiqo.</p>
        <label className="mt-6 block text-xs text-white/45">Shopify store</label>
        <input value={shop} onChange={(e) => setShop(e.target.value)} placeholder="your-store.myshopify.com" className="mt-2 w-full rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none" />
        <button type="button" onClick={connect} disabled={!normalized} className="mt-5 rounded-2xl bg-[#D6A66A] px-5 py-3 text-sm font-semibold text-black disabled:opacity-40">Continue to Shopify</button>
      </div>
    </main>
  );
}
