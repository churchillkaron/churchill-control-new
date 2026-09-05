"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

import {
  HotelEmptyState,
  HotelError,
  HotelField,
  HotelMetric,
  HotelPrimaryAction,
  HotelSecondaryAction,
  HotelSection,
  HotelStatusPill,
  HotelSuccess,
  HotelWorkspaceShell,
  hotelInputClass,
  hotelTextareaClass,
} from "@/components/workspace/hotel/HotelWorkspaceUI";

async function api(url, options) {
  const response = await fetch(url, { cache: "no-store", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error(payload.error || "Request failed");
  return payload;
}

function money(value, currency = "THB") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(value || 0));
}

export default function HotelOffersPage() {
  const params = useParams();
  const organizationId = String(params?.organizationId || "");
  const [properties, setProperties] = useState([]);
  const [propertyId, setPropertyId] = useState("");
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ name: "", code: "", price: "", currencyCode: "THB", description: "" });

  useEffect(() => {
    let active = true;
    api(`/api/hotel/properties/list?organizationId=${encodeURIComponent(organizationId)}`)
      .then((payload) => {
        if (!active) return;
        const list = payload.properties || [];
        setProperties(list);
        setPropertyId((current) => current || list[0]?.id || "");
      })
      .catch((reason) => active && setError(reason.message));
    return () => { active = false; };
  }, [organizationId]);

  const load = useCallback(async () => {
    if (!propertyId) { setOffers([]); setLoading(false); return; }
    setLoading(true); setError("");
    try {
      const payload = await api(`/api/hotel/upsells?organizationId=${encodeURIComponent(organizationId)}&propertyId=${encodeURIComponent(propertyId)}`);
      setOffers(payload.offers || []);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setLoading(false);
    }
  }, [organizationId, propertyId]);

  useEffect(() => { load(); }, [load]);

  async function createOffer() {
    if (!form.name.trim() || form.price === "") { setError("Offer name and price are required."); return; }
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = await api("/api/hotel/upsells", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, propertyId, action: "CREATE", ...form, price: Number(form.price) }),
      });
      setSuccess(`${payload.offer.name} is active and available to eligible stays.`);
      setForm({ name: "", code: "", price: "", currencyCode: "THB", description: "" });
      await load();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  async function setActive(offer, active) {
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = await api("/api/hotel/upsells", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, propertyId, action: "SET_ACTIVE", offerId: offer.id, active }),
      });
      setSuccess(`${payload.offer.name} is now ${payload.offer.active ? "active" : "inactive"}.`);
      await load();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  const activeOffers = offers.filter((offer) => offer.active);
  const inactiveOffers = offers.filter((offer) => !offer.active);
  const averagePrice = activeOffers.length ? activeOffers.reduce((sum, offer) => sum + Number(offer.price || 0), 0) / activeOffers.length : 0;
  const selectedProperty = properties.find((property) => property.id === propertyId);

  return (
    <HotelWorkspaceShell
      organizationId={organizationId}
      active="offers"
      eyebrow="Stay revenue"
      title="Offers & Upsells"
      subtitle="Create useful guest enhancements once, keep availability governed, and add accepted offers directly to the stay folio instead of creating disconnected revenue records."
      context={selectedProperty?.name || "Choose property"}
    >
      <HotelError>{error}</HotelError><HotelSuccess>{success}</HotelSuccess>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <HotelMetric label="Active offers" value={activeOffers.length} detail={`${inactiveOffers.length} inactive offers retained`} />
        <HotelMetric label="Average price" value={money(averagePrice, activeOffers[0]?.currency_code || "THB")} detail="Across active stay enhancements" />
        <HotelMetric label="Folio behavior" value="Auto" detail="Accepted offers create a governed hotel charge" />
        <HotelMetric label="Card data" value="None" detail="Offer management never stores raw card details" />
      </div>

      <HotelSection eyebrow="Property" title="Offer scope">
        <div className="p-4 md:max-w-sm md:p-5"><HotelField label="Property"><select className={hotelInputClass} value={propertyId} onChange={(event) => setPropertyId(event.target.value)}><option value="">Choose property</option>{properties.map((property) => <option key={property.id} value={property.id}>{property.name}</option>)}</select></HotelField></div>
      </HotelSection>

      <div className="grid gap-4 xl:grid-cols-[minmax(320px,0.52fr)_minmax(0,1.48fr)]">
        <HotelSection eyebrow="Create" title="New stay enhancement" detail="Use stable codes so the same product can be offered consistently across guest journeys.">
          <div className="grid gap-3 p-4 md:p-5">
            <HotelField label="Offer name"><input className={hotelInputClass} value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} placeholder="Airport transfer" /></HotelField>
            <HotelField label="Code"><input className={hotelInputClass} value={form.code} onChange={(e) => setForm((current) => ({ ...current, code: e.target.value }))} placeholder="Auto-generated if blank" /></HotelField>
            <div className="grid grid-cols-[1fr_110px] gap-2"><HotelField label="Price"><input type="number" min="0" className={hotelInputClass} value={form.price} onChange={(e) => setForm((current) => ({ ...current, price: e.target.value }))} placeholder="1200" /></HotelField><HotelField label="Currency"><select className={hotelInputClass} value={form.currencyCode} onChange={(e) => setForm((current) => ({ ...current, currencyCode: e.target.value }))}><option>THB</option><option>USD</option><option>EUR</option><option>GBP</option><option>SGD</option></select></HotelField></div>
            <HotelField label="Description"><textarea className={hotelTextareaClass} value={form.description} onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))} placeholder="Private airport transfer for arriving guest…" /></HotelField>
            <HotelPrimaryAction disabled={saving || !propertyId || !form.name.trim() || form.price === ""} onClick={createOffer}>{saving ? "Saving…" : "Publish offer"}</HotelPrimaryAction>
          </div>
        </HotelSection>

        <HotelSection eyebrow="Offer catalogue" title="Sellable stay enhancements" detail="Inactive offers stay in history but disappear from the stay upsell selector.">
          {!offers.length ? <HotelEmptyState>{loading ? "Loading offers…" : "No offers configured for this property."}</HotelEmptyState> : <div className="divide-y divide-black/[0.05]">
            <div className="hidden grid-cols-[minmax(180px,1fr)_120px_minmax(220px,1.4fr)_110px_auto] gap-3 bg-[#FAF9F6] px-5 py-2 text-[7px] font-semibold uppercase tracking-[0.08em] text-[#918B83] md:grid"><span>Offer</span><span>Price</span><span>Description</span><span>Status</span><span>Control</span></div>
            {offers.map((offer) => <div key={offer.id} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(180px,1fr)_120px_minmax(220px,1.4fr)_110px_auto] md:items-center md:gap-3 md:px-5"><div><div className="text-[9px] font-semibold text-[#3F3A35]">{offer.name}</div><div className="mt-0.5 text-[7px] text-[#9B948C]">{offer.code}</div></div><div className="text-[9px] font-semibold tabular-nums text-[#4A453F]">{money(offer.price, offer.currency_code)}</div><div className="text-[8px] leading-4 text-[#817B73]">{offer.description || "No description"}</div><HotelStatusPill value={offer.active ? "ACTIVE" : "INACTIVE"} tone={offer.active ? "good" : "neutral"} /><HotelSecondaryAction disabled={saving} onClick={() => setActive(offer, !offer.active)}>{offer.active ? "Deactivate" : "Activate"}</HotelSecondaryAction></div>)}
          </div>}
        </HotelSection>
      </div>
    </HotelWorkspaceShell>
  );
}
