"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

async function readJson(url) {
  const response = await fetch(url, { credentials: "include", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || "Request failed");
  return body;
}

function short(value, length = 18) {
  const text = String(value || "");
  if (text.length <= length) return text;
  return text.slice(0, length) + "…";
}

export default function DeveloperLogsExplorer({ organizationId }) {
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [environment, setEnvironment] = useState("");
  const [requests, setRequests] = useState([]);
  const [security, setSecurity] = useState([]);
  const [environments, setEnvironments] = useState([]);
  const [pagination, setPagination] = useState({});
  const [requestCursor, setRequestCursor] = useState(null);
  const [securityCursor, setSecurityCursor] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [copiedRequestId, setCopiedRequestId] = useState("");

  const baseQuery = useMemo(() => {
    const params = new URLSearchParams({ organization_id: organizationId, limit: "25" });
    if (q.trim()) params.set("q", q.trim());
    if (status !== "all") params.set("status", status);
    if (environment) params.set("environment_id", environment);
    return params.toString();
  }, [organizationId, q, status, environment]);

  const load = useCallback(async ({
    moreRequests = false,
    moreSecurity = false,
    cursor = null,
  } = {}) => {
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams(baseQuery);
      if (moreRequests && cursor) params.set("request_before", cursor);
      if (moreSecurity && cursor) params.set("security_before", cursor);
      const body = await readJson("/api/developers/logs?" + params.toString());
      setEnvironments(body.environments || []);
      setPagination(body.pagination || {});
      if (moreRequests) setRequests((current) => [...current, ...(body.requests || [])]);
      else if (!moreSecurity) setRequests(body.requests || []);
      if (moreSecurity) setSecurity((current) => [...current, ...(body.security || [])]);
      else if (!moreRequests) setSecurity(body.security || []);
      if (moreRequests) setRequestCursor(body.pagination?.request_before || null);
      else if (!moreSecurity) setRequestCursor(body.pagination?.request_before || null);
      if (moreSecurity) setSecurityCursor(body.pagination?.security_before || null);
      else if (!moreRequests) setSecurityCursor(body.pagination?.security_before || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }, [baseQuery]);

  useEffect(() => {
    const handle = setTimeout(() => load(), 220);
    return () => clearTimeout(handle);
  }, [load]);

  return <div className="mt-4 space-y-4">
    <section className="rounded-[22px] border border-black/[.07] bg-white p-4">
      <div className="grid gap-3 lg:grid-cols-[1fr_180px_220px_auto]">
        <input
          value={q}
          onChange={(event) => setQ(event.target.value)}
          placeholder="Search capability, command, error or security action…"
          className="min-w-0 rounded-xl border border-black/[.08] bg-[#FBF9F6] px-4 py-3 text-[10px]"
        />
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-xl border border-black/[.08] bg-[#FBF9F6] px-3 py-3 text-[10px]">
          <option value="all">All API statuses</option>
          <option value="success">Success</option>
          <option value="failed">Failed</option>
        </select>
        <select value={environment} onChange={(event) => setEnvironment(event.target.value)} className="rounded-xl border border-black/[.08] bg-[#FBF9F6] px-3 py-3 text-[10px]">
          <option value="">All environments</option>
          {environments.map((row) => <option key={row.id} value={row.id}>{row.name} · {row.status}</option>)}
        </select>
        <button disabled={busy} onClick={() => load()} className="rounded-xl border border-black/[.08] px-4 py-3 text-[9px] font-semibold disabled:opacity-40">Refresh</button>
      </div>
      {error ? <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[9px] text-red-700">{error}</div> : null}
    </section>

    <section className="overflow-hidden rounded-[22px] border border-black/[.07] bg-white">
      <div className="flex items-center justify-between border-b border-black/[.06] px-5 py-4">
        <div className="text-[9px] font-semibold uppercase tracking-[.16em] text-[#91877C]">Developer API requests</div>
        <div className="text-[8px] text-[#91877C]">{requests.length} loaded</div>
      </div>
      <div className="divide-y divide-black/[.05]">
        {requests.map((row) => <button type="button" onClick={()=>setSelectedRequest(row)} key={row.request_id} className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-[#FBF9F6] lg:grid-cols-[155px_1fr_150px_120px_90px_85px] lg:items-center">
          <div><div className="text-[8px] text-[#8B8177]">{new Date(row.created_at).toLocaleString()}</div><div className="mt-1 font-mono text-[7px] text-[#9A9085]" title={row.request_id}>{short(row.request_id, 22)}</div></div>
          <div className="min-w-0"><div className="truncate font-mono text-[9px] font-semibold">{row.capability_id}</div><div className="mt-1 text-[8px] text-[#776F67]">{row.method}{row.command ? " · " + row.command : ""}{row.error_code ? " · " + row.error_code : ""}</div>{row.idempotency_key ? <div className="mt-1 text-[7px] text-[#9A9085]">Idempotency key recorded</div> : null}</div>
          <div className="text-[8px] text-[#776F67]">{row.environment?.name || "Unknown environment"}<div className="mt-1 text-[7px] uppercase tracking-[.08em] text-[#9A9085]">{row.environment?.environment_key || "—"}</div></div>
          <div className="min-w-0"><div className="truncate text-[8px] font-semibold">{row.credential?.name || "Unknown credential"}</div><div className="mt-1 font-mono text-[7px] text-[#8B8177]">{row.credential?.token_prefix ? row.credential.token_prefix+"••••"+(row.credential.token_last_four||"") : short(row.credential_id, 12)}</div></div>
          <div className={"text-[9px] font-semibold " + (Number(row.status_code) >= 400 ? "text-red-700" : "text-[#506D59]")}>{row.status_code}</div>
          <div className="text-[8px] text-[#776F67]">{row.latency_ms} ms</div>
        </button>)}
        {!requests.length ? <div className="p-8 text-center text-[9px] text-[#8B8177]">No API requests match these filters.</div> : null}
      </div>
      {pagination.requests_has_more ? <div className="border-t border-black/[.05] p-4 text-center"><button disabled={busy} onClick={() => load({ moreRequests: true, cursor: requestCursor })} className="rounded-lg border border-black/[.08] px-4 py-2 text-[8px] font-semibold">Load more requests</button></div> : null}
    </section>

    {selectedRequest ? <section className="rounded-[22px] border border-[#B7793B]/20 bg-[#FBF6EF] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-[.16em] text-[#9A744B]">Request inspector</div>
          <div className="mt-2 font-mono text-[10px] font-semibold break-all">{selectedRequest.request_id}</div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(selectedRequest.request_id);setCopiedRequestId(selectedRequest.request_id);setTimeout(()=>setCopiedRequestId(""),1500);}catch{}}} className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-[8px] font-semibold">{copiedRequestId===selectedRequest.request_id?"Copied":"Copy request ID"}</button>
          <button type="button" onClick={()=>setSelectedRequest(null)} className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-[8px] font-semibold">Close</button>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Capability",selectedRequest.capability_id],
          ["Operation",selectedRequest.method+(selectedRequest.command?" · "+selectedRequest.command:"")],
          ["Status",selectedRequest.status_code],
          ["Latency",selectedRequest.latency_ms+" ms"],
          ["Environment",selectedRequest.environment?.name || "Unknown"],
          ["Environment state",selectedRequest.environment?.status || "Unknown"],
          ["Credential",selectedRequest.credential?.name || "Unknown"],
          ["Credential state",selectedRequest.credential?.status || "Unknown"],
        ].map(([label,value])=><div key={label} className="rounded-xl bg-white p-3"><div className="text-[7px] uppercase tracking-[.11em] text-[#91877C]">{label}</div><div className="mt-1 break-words text-[9px] font-semibold">{value}</div></div>)}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <div className="rounded-xl bg-white p-3"><div className="text-[7px] uppercase tracking-[.11em] text-[#91877C]">Error class</div><div className={"mt-1 font-mono text-[9px] font-semibold "+(selectedRequest.error_code?"text-red-700":"text-[#506D59]")}>{selectedRequest.error_code || "None"}</div></div>
        <div className="rounded-xl bg-white p-3"><div className="text-[7px] uppercase tracking-[.11em] text-[#91877C]">Idempotency</div><div className="mt-1 text-[9px] font-semibold">{selectedRequest.idempotency_key ? "Recorded for this mutation" : "Not applicable / not recorded"}</div></div>
        <div className="rounded-xl bg-white p-3"><div className="text-[7px] uppercase tracking-[.11em] text-[#91877C]">Credential expiry</div><div className="mt-1 text-[9px] font-semibold">{selectedRequest.credential?.expires_at ? new Date(selectedRequest.credential.expires_at).toLocaleString() : "Unknown / not applicable"}</div></div>
      </div>
      {Number(selectedRequest.status_code)>=400?<div className="mt-3 rounded-xl border border-[#B7793B]/20 bg-white p-3 text-[8px] leading-5 text-[#76502E]">{Number(selectedRequest.status_code)===401?"Check that the machine credential is active, unexpired and copied exactly.":Number(selectedRequest.status_code)===403?"The credential authenticated, but its scope or organization authority does not permit this capability/action.":Number(selectedRequest.status_code)===409?"Do not generate a new idempotency key blindly. Inspect whether this is an in-progress request or a payload mismatch for an existing key.":Number(selectedRequest.status_code)===429?"The environment rate limit or monthly quota was reached. Inspect Usage before retrying.":Number(selectedRequest.status_code)>=500?"This is an Avantiqo runtime/control-plane class failure. Preserve the request ID for support and avoid speculative business mutation retries.":"Inspect the error class and capability contract before retrying."}</div>:null}
    </section> : null}

    <section className="overflow-hidden rounded-[22px] border border-black/[.07] bg-white">
      <div className="flex items-center justify-between border-b border-black/[.06] px-5 py-4">
        <div className="text-[9px] font-semibold uppercase tracking-[.16em] text-[#91877C]">Security activity</div>
        <div className="text-[8px] text-[#91877C]">{security.length} loaded</div>
      </div>
      <div className="divide-y divide-black/[.05]">
        {security.map((row) => <div key={row.id} className="grid gap-2 px-5 py-4 md:grid-cols-[190px_190px_1fr]">
          <div className="text-[8px] text-[#8B8177]">{new Date(row.created_at).toLocaleString()}</div>
          <div className="text-[8px] font-semibold">{row.action}</div>
          <div className="min-w-0 font-mono text-[8px] text-[#6E665F]">{row.target_type}{row.target_id ? " · " + short(row.target_id, 24) : ""}</div>
        </div>)}
        {!security.length ? <div className="p-8 text-center text-[9px] text-[#8B8177]">No security activity matches this search.</div> : null}
      </div>
      {pagination.security_has_more ? <div className="border-t border-black/[.05] p-4 text-center"><button disabled={busy} onClick={() => load({ moreSecurity: true, cursor: securityCursor })} className="rounded-lg border border-black/[.08] px-4 py-2 text-[8px] font-semibold">Load more security activity</button></div> : null}
    </section>
  </div>;
}
