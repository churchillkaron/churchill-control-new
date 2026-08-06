"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

const REQUEST_TYPES = [
  "TRANSPORT",
  "DINING",
  "TOUR",
  "LUGGAGE",
  "AMENITY",
  "OTHER",
];

function guestName(request) {
  return [
    request?.hotel_guests?.first_name,
    request?.hotel_guests?.last_name,
  ]
    .filter(Boolean)
    .join(" ") || "Guest";
}

function RequestColumn({
  title,
  requests,
  busyId,
  onAction,
}) {
  return (
    <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-semibold text-white">{title}</h2>
        <span className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/45">
          {requests.length}
        </span>
      </div>

      <div className="space-y-3">
        {requests.length ? requests.map((request) => (
          <article
            key={request.id}
            className="rounded-2xl border border-white/10 bg-black/20 p-4"
          >
            <div className="text-sm font-semibold text-white">
              {String(request.request_type || "REQUEST").replaceAll("_", " ")}
            </div>
            <div className="mt-1 text-xs text-white/45">
              {guestName(request)} · {request.hotel_properties?.name || "Property"}
            </div>
            {request.details ? (
              <p className="mt-3 text-sm text-white/65">
                {request.details}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              {request.status === "PENDING" ? (
                <>
                  <button
                    type="button"
                    disabled={busyId === request.id}
                    onClick={() => onAction(request.id, "START")}
                    className="rounded-xl bg-[#D6A66A] px-3 py-2 text-xs font-bold text-black disabled:opacity-40"
                  >
                    Start
                  </button>
                  <button
                    type="button"
                    disabled={busyId === request.id}
                    onClick={() => onAction(request.id, "CANCEL")}
                    className="rounded-xl border border-white/10 px-3 py-2 text-xs text-white/60 disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </>
              ) : null}

              {request.status === "IN_PROGRESS" ? (
                <button
                  type="button"
                  disabled={busyId === request.id}
                  onClick={() => onAction(request.id, "COMPLETE")}
                  className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-black disabled:opacity-40"
                >
                  Complete
                </button>
              ) : null}
            </div>
          </article>
        )) : (
          <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-sm text-white/30">
            No requests
          </div>
        )}
      </div>
    </section>
  );
}

export default function ConciergeOperationsPage() {
  const params = useParams();
  const organizationId = params?.organizationId || "";

  const [requests, setRequests] = useState([]);
  const [properties, setProperties] = useState([]);
  const [guests, setGuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    propertyId: "",
    guestId: "",
    requestType: "TRANSPORT",
    details: "",
  });

  const load = useCallback(async () => {
    if (!organizationId) return;

    setLoading(true);
    setError("");

    try {
      const query = `?organizationId=${encodeURIComponent(organizationId)}`;
      const [requestsResponse, propertiesResponse, guestsResponse] = await Promise.all([
        fetch(`/api/hotel/concierge/list${query}`, { credentials: "include" }),
        fetch(`/api/hotel/properties/list${query}`, { credentials: "include" }),
        fetch(`/api/hotel/guests/list${query}`, { credentials: "include" }),
      ]);

      const [requestsData, propertiesData, guestsData] = await Promise.all([
        requestsResponse.json(),
        propertiesResponse.json(),
        guestsResponse.json(),
      ]);

      if (!requestsResponse.ok) throw new Error(requestsData.error || "Unable to load concierge requests");
      if (!propertiesResponse.ok) throw new Error(propertiesData.error || "Unable to load properties");
      if (!guestsResponse.ok) throw new Error(guestsData.error || "Unable to load guests");

      setRequests(requestsData.requests || []);
      setProperties(propertiesData.properties || []);
      setGuests(guestsData.guests || []);
    } catch (loadError) {
      setError(loadError.message || "Unable to load concierge workspace");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => ({
    pending: requests.filter((request) => request.status === "PENDING"),
    inProgress: requests.filter((request) => request.status === "IN_PROGRESS"),
    completed: requests.filter((request) => ["COMPLETED", "CANCELLED"].includes(request.status)),
  }), [requests]);

  async function createRequest() {
    if (!form.propertyId || !form.guestId || !form.requestType) {
      setError("Property, guest and request type are required");
      return;
    }

    setCreating(true);
    setError("");

    try {
      const response = await fetch("/api/hotel/concierge/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, ...form }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Unable to create concierge request");

      setForm((current) => ({
        ...current,
        guestId: "",
        details: "",
      }));
      await load();
    } catch (createError) {
      setError(createError.message || "Unable to create concierge request");
    } finally {
      setCreating(false);
    }
  }

  async function transition(requestId, action) {
    setBusyId(requestId);
    setError("");

    try {
      const response = await fetch("/api/hotel/concierge/update", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId, requestId, action }),
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Unable to update concierge request");
      await load();
    } catch (transitionError) {
      setError(transitionError.message || "Unable to update concierge request");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-6 text-white">
      <header className="rounded-[30px] border border-white/10 bg-white/[0.025] p-5 md:p-6">
        <div className="text-[10px] uppercase tracking-[0.28em] text-[#D6A66A]">
          Hotel Operations
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Concierge</h1>
            <p className="mt-1 text-sm text-white/45">
              Capture, progress and complete guest-service requests.
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="rounded-xl border border-white/10 px-4 py-2 text-xs font-semibold text-white/65 disabled:opacity-40"
          >
            Refresh
          </button>
        </div>
      </header>

      {error ? (
        <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      ) : null}

      <section className="mt-5 rounded-[30px] border border-white/10 bg-white/[0.025] p-5">
        <h2 className="font-semibold">New Guest Request</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <select
            value={form.propertyId}
            onChange={(event) => setForm((current) => ({ ...current, propertyId: event.target.value }))}
            className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm"
          >
            <option value="">Select property</option>
            {properties.map((property) => (
              <option key={property.id} value={property.id}>{property.name}</option>
            ))}
          </select>
          <select
            value={form.guestId}
            onChange={(event) => setForm((current) => ({ ...current, guestId: event.target.value }))}
            className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm"
          >
            <option value="">Select guest</option>
            {guests.map((guest) => (
              <option key={guest.id} value={guest.id}>
                {[guest.first_name, guest.last_name].filter(Boolean).join(" ") || guest.full_name || "Guest"}
              </option>
            ))}
          </select>
          <select
            value={form.requestType}
            onChange={(event) => setForm((current) => ({ ...current, requestType: event.target.value }))}
            className="rounded-xl border border-white/10 bg-black px-3 py-3 text-sm"
          >
            {REQUEST_TYPES.map((type) => (
              <option key={type} value={type}>{type.replaceAll("_", " ")}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={creating}
            onClick={createRequest}
            className="rounded-xl bg-[#D6A66A] px-4 py-3 text-sm font-bold text-black disabled:opacity-40"
          >
            {creating ? "Creating..." : "Create Request"}
          </button>
        </div>
        <textarea
          value={form.details}
          onChange={(event) => setForm((current) => ({ ...current, details: event.target.value }))}
          placeholder="Request details"
          className="mt-3 min-h-24 w-full rounded-xl border border-white/10 bg-black px-3 py-3 text-sm"
        />
      </section>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <RequestColumn title="Pending" requests={grouped.pending} busyId={busyId} onAction={transition} />
        <RequestColumn title="In Progress" requests={grouped.inProgress} busyId={busyId} onAction={transition} />
        <RequestColumn title="Completed / Cancelled" requests={grouped.completed} busyId={busyId} onAction={transition} />
      </div>
    </div>
  );
}
