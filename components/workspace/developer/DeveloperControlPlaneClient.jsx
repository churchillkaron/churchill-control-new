"use client";
/* eslint-disable react-hooks/exhaustive-deps */
import { useEffect, useState } from "react";

function isReadOnlyDeveloperScope(scope) {
  const normalized = String(scope || "").trim().toLowerCase();
  return normalized === "operations.view" || normalized.endsWith(".view");
}

async function json(url, options = {}) {
  const response = await fetch(url, { credentials: "include", cache: "no-store", ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body?.success === false) throw new Error(body?.error || "Request failed");
  return body;
}

export function EnvironmentManager({ organizationId, canManageSecurity = false }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [policyDrafts, setPolicyDrafts] = useState({});
  const [productionConfirmation, setProductionConfirmation] = useState("");
  const [productionReactivateExisting, setProductionReactivateExisting] = useState(false);

  async function load() {
    setError("");
    try {
      const body = await json(`/api/developers/environments?organization_id=${encodeURIComponent(organizationId)}`);
      const environments = body.environments || [];
      setRows(environments);
      setPolicyDrafts(Object.fromEntries(environments.map((row) => [row.id, {
        requests_per_minute: String(row.requests_per_minute ?? 120),
        monthly_request_limit: row.monthly_request_limit == null ? "" : String(row.monthly_request_limit),
        max_active_credentials: String(row.max_active_credentials ?? 20),
        max_active_webhooks: String(row.max_active_webhooks ?? 20),
      }])));
    } catch (e) {
      setError(e.message);
    }
  }
  useEffect(() => { load(); }, [organizationId]);

  async function add(key) {
    setBusy(true); setError("");
    try {
      await json("/api/developers/environments", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          environment_key: key,
          confirmation: key === "production" ? productionConfirmation : undefined,
        }),
      });
      if (key === "production") setProductionConfirmation("");
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function setStatus(row, status) {
    setBusy(true); setError("");
    try {
      await json("/api/developers/environments", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          id: row.id,
          status,
          confirmation: row.environment_key === "production" && status === "ACTIVE"
            ? productionConfirmation
            : undefined,
          acknowledge_reactivation: row.environment_key === "production" && status === "ACTIVE"
            ? productionReactivateExisting
            : undefined,
        }),
      });
      if (row.environment_key === "production") {
        setProductionConfirmation("");
        setProductionReactivateExisting(false);
      }
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  function setPolicyValue(id, key, value) {
    setPolicyDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] || {}), [key]: value },
    }));
  }

  async function savePolicy(row) {
    const draft = policyDrafts[row.id] || {};
    setBusy(true); setError("");
    try {
      await json("/api/developers/environments", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          id: row.id,
          action: "policy",
          requests_per_minute: Number(draft.requests_per_minute),
          monthly_request_limit: draft.monthly_request_limit === "" ? null : Number(draft.monthly_request_limit),
          max_active_credentials: Number(draft.max_active_credentials),
          max_active_webhooks: Number(draft.max_active_webhooks),
        }),
      });
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <div>
    {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[10px] text-red-700">{error}</div> : null}
    <div className="grid gap-3 md:grid-cols-3">
      {["development","staging","production"].map((key) => {
        const row = rows.find((item) => item.environment_key === key);
        const productionPhrase = key !== "production"
          ? ""
          : !row
            ? "CREATE PRODUCTION"
            : row.status === "ACTIVE"
              ? ""
              : "ENABLE PRODUCTION";
        const productionReady = !productionPhrase || productionConfirmation.trim() === productionPhrase;
        const reactivationRequired = Boolean(
          key === "production" &&
          row &&
          row.status !== "ACTIVE" &&
          (Number(row.active_credentials || 0) > 0 || Number(row.active_webhooks || 0) > 0)
        );
        return <div key={key} className="rounded-[20px] border border-black/[.07] bg-white p-5">
          <div className="text-[8px] font-semibold uppercase tracking-[.15em] text-[#9A744B]">{key}</div>
          <div className="mt-4 text-[16px] font-semibold">{row?.name || "Not created"}</div>
          <div className="mt-2 text-[9px] text-[#7B736B]">{row ? row.status : "Create the governed environment identity."}</div>
          <div className="mt-3 rounded-lg bg-[#F8F4EE] p-3 text-[8px] leading-4 text-[#766E66]">{key === "production" ? "Live machine authority. Production credentials may receive write scopes and Production webhooks may receive committed business events." : key === "staging" ? "Pre-production validation against the live organization data plane with read-only machine authority and test webhooks only." : "First integration environment for read-safe API validation and webhook connectivity tests. Business mutations remain blocked."}</div>
          {key==="production"&&!canManageSecurity?<div className="mt-4 rounded-xl border border-[#B7793B]/20 bg-[#FBF6EF] p-3 text-[8px] leading-5 text-[#76502E]">Production is controlled by an organization Developer administrator. Your developer identity can use Development and Staging without receiving live mutation authority.</div>:null}
          {canManageSecurity&&productionPhrase?<div className="mt-4 rounded-xl border border-[#B7793B]/20 bg-[#FBF6EF] p-3"><div className="text-[8px] leading-5 text-[#76502E]">Production controls live machine authority. Type <span className="font-mono font-semibold">{productionPhrase}</span> to continue.</div><input value={productionConfirmation} onChange={(event)=>setProductionConfirmation(event.target.value)} placeholder={productionPhrase} className="mt-2 w-full rounded-lg border border-black/[.08] bg-white px-2.5 py-2 text-[9px]"/>{reactivationRequired?<label className="mt-3 flex cursor-pointer items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-2.5 text-[8px] leading-4 text-red-800"><input type="checkbox" checked={productionReactivateExisting} onChange={(event)=>setProductionReactivateExisting(event.target.checked)} className="mt-0.5"/><span>Re-enable {row.active_credentials} active credential{Number(row.active_credentials)===1?"":"s"} and {row.active_webhooks} active webhook endpoint{Number(row.active_webhooks)===1?"":"s"} with Production.</span></label>:null}</div>:null}
          {!row ? (canManageSecurity?<button disabled={busy||!productionReady} onClick={() => add(key)} className="mt-5 rounded-xl border border-[#B98A52]/25 bg-[#D6A66A] px-4 py-2 text-[9px] font-semibold text-[#2C2117] hover:bg-[#C99A5E] disabled:opacity-40">Create {key}</button>:<div className="mt-5 text-[8px] leading-4 text-[#8B8177]">An organization Developer administrator creates shared environments.</div>) :
            <>
              <div className="mt-5 grid grid-cols-2 gap-2">
                {[
                  ["requests_per_minute","Requests / min"],
                  ["monthly_request_limit","Monthly requests"],
                  ["max_active_credentials","Active credentials"],
                  ["max_active_webhooks","Active webhooks"],
                ].map(([field,label]) => canManageSecurity?<label key={field} className="block">
                  <span className="text-[7px] font-semibold uppercase tracking-[.12em] text-[#91877C]">{label}</span>
                  <input value={policyDrafts[row.id]?.[field] ?? ""} onChange={(event) => setPolicyValue(row.id, field, event.target.value)} placeholder={field === "monthly_request_limit" ? "Unlimited" : ""} className="mt-1 w-full rounded-lg border border-black/[.08] bg-[#FBF9F6] px-2.5 py-2 text-[9px]"/>
                </label>:<div key={field} className="rounded-lg border border-black/[.06] bg-[#FBF9F6] p-2.5"><div className="text-[7px] font-semibold uppercase tracking-[.1em] text-[#91877C]">{label}</div><div className="mt-1 text-[10px] font-semibold text-[#4D463F]">{row[field] ?? "Unlimited"}</div></div>)}
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 truncate font-mono text-[7px] text-[#8B8177]">{row.id}</div>
                <div className="flex gap-2">
                  {canManageSecurity?<button disabled={busy} onClick={() => savePolicy(row)} className="rounded-lg border border-[#B7793B]/30 bg-[#FBF3E8] px-3 py-2 text-[8px] font-semibold text-[#76502E]">Save policy</button>:null}
                  {canManageSecurity?<button disabled={busy||(key==="production"&&row.status!=="ACTIVE"&&(!productionReady||(reactivationRequired&&!productionReactivateExisting)))} onClick={() => setStatus(row, row.status === "ACTIVE" ? "DISABLED" : "ACTIVE")} className="rounded-lg border border-black/[.08] px-3 py-2 text-[8px] font-semibold">{row.status === "ACTIVE" ? "Disable" : "Enable"}</button>:null}
                </div>
              </div>
            </>}
        </div>;
      })}
    </div>
  </div>;
}

export function CredentialManager({ organizationId, canManageSecurity = false }) {
  const [rows,setRows]=useState([]),[envs,setEnvs]=useState([]),[availableScopes,setAvailableScopes]=useState([]),[scopeCatalog,setScopeCatalog]=useState([]),[scopes,setScopes]=useState(["operations.view"]);
  const [error,setError]=useState(""),[token,setToken]=useState(""),[busy,setBusy]=useState(false),[copiedToken,setCopiedToken]=useState(false);
  const [name,setName]=useState("Backend integration"),[env,setEnv]=useState(""),[expiryDays,setExpiryDays]=useState("90");
  const [scopeSearch,setScopeSearch]=useState(""),[scopeKind,setScopeKind]=useState("all");

  async function load() {
    setError("");
    try {
      const [a,b] = await Promise.all([
        json(`/api/developers/credentials?organization_id=${encodeURIComponent(organizationId)}`),
        json(`/api/developers/environments?organization_id=${encodeURIComponent(organizationId)}`)
      ]);
      setRows(a.credentials || []);
      setAvailableScopes(a.available_scopes || []);
      setScopeCatalog(a.scope_catalog || []);
      const availableEnvironments=(b.environments||[]).filter(row=>canManageSecurity||row.environment_key!=="production");
      setEnvs(b.environments || []);
      if ((!env || !availableEnvironments.some(row=>row.id===env)) && availableEnvironments[0]) setEnv(availableEnvironments[0].id);
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, [organizationId]);

  async function create() {
    if (!env) return setError("Create an environment first.");
    if (!scopes.length) return setError("Select at least one scope.");
    setBusy(true); setToken("");
    try {
      const body = await json("/api/developers/credentials", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, environment_id: env, name, scopes, expires_in_days: Number(expiryDays) }),
      });
      setToken(body.token || "");
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function credentialAction(row, action) {
    setBusy(true); setToken("");
    try {
      const body = await json("/api/developers/credentials", {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          id: row.id,
          action,
          expires_in_days: action === "rotate" ? Number(expiryDays) : undefined,
        }),
      });
      if (body.token) setToken(body.token);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  function toggleScope(scope) {
    setScopes((current) => {
      if (current.includes(scope)) return current.filter((item) => item !== scope);
      if (current.length >= 64) {
        setError("A credential can contain at most 64 scopes.");
        return current;
      }
      return [...current, scope];
    });
  }

  const effectiveScopeCatalog = scopeCatalog.length
    ? scopeCatalog
    : availableScopes.map((scope) => ({
        scope,
        kind: "global",
        label: scope.replace("operations.", ""),
        description: scope,
      }));
  const selectedEnvironment = envs.find((row) => row.id === env) || null;
  const productionEnvironmentSelected = selectedEnvironment?.environment_key === "production";
  const normalizedScopeSearch = scopeSearch.trim().toLowerCase();
  const filteredScopeCatalog = effectiveScopeCatalog
    .filter((entry) => productionEnvironmentSelected || isReadOnlyDeveloperScope(entry.scope))
    .filter((entry) => scopeKind === "all" || entry.kind === scopeKind)
    .filter((entry) => {
      if (!normalizedScopeSearch) return true;
      return [
        entry.scope,
        entry.label,
        entry.description,
        entry.group,
        entry.capability_name,
        entry.action,
      ].some((value) => String(value || "").toLowerCase().includes(normalizedScopeSearch));
    })
    .slice(0, 80);

  return <div>
    {error ? <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[10px] text-red-700">{error}</div> : null}
    {token ? <div className="mb-4 rounded-[18px] border border-[#B7793B]/30 bg-[#FBF3E8] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="text-[9px] font-semibold text-[#76502E]">Copy this token now — it will not be shown again.</div><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(token);setCopiedToken(true);setTimeout(()=>setCopiedToken(false),1500);}catch{}}} className="rounded-lg border border-[#B7793B]/25 bg-white px-3 py-2 text-[8px] font-semibold text-[#76502E]">{copiedToken?"Copied":"Copy token"}</button></div><div className="mt-3 break-all rounded-xl border border-[#C7B08D]/20 bg-[#FBF6EF] p-3 font-mono text-[9px] text-[#5C4731]">{token}</div></div> : null}
    <div className="rounded-[20px] border border-black/[.07] bg-white p-5">
      <div className="grid gap-3 md:grid-cols-[1fr_220px_140px_auto] md:items-end">
        <label className="block"><span className="mb-1.5 block text-[7px] font-semibold uppercase tracking-[.12em] text-[#91877C]">Credential name</span><input value={name} onChange={(e)=>setName(e.target.value)} className="w-full rounded-xl border border-black/[.08] px-3 py-2.5 text-[10px]" placeholder="Backend integration"/></label>
        <label className="block"><span className="mb-1.5 block text-[7px] font-semibold uppercase tracking-[.12em] text-[#91877C]">Environment</span><select value={env} onChange={(e)=>{const next=e.target.value;setEnv(next);const selected=envs.find(x=>x.id===next);if(selected?.environment_key!=="production")setScopes(current=>current.filter(isReadOnlyDeveloperScope));}} className="w-full rounded-xl border border-black/[.08] px-3 py-2.5 text-[10px]"><option value="">Select environment</option>{envs.filter(x=>x.status==="ACTIVE"&&(canManageSecurity||x.environment_key!=="production")).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <label className="block"><span className="mb-1.5 block text-[7px] font-semibold uppercase tracking-[.12em] text-[#91877C]">Expires after</span><select value={expiryDays} onChange={(e)=>setExpiryDays(e.target.value)} className="w-full rounded-xl border border-black/[.08] px-3 py-2.5 text-[10px]"><option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">365 days</option></select></label>
        <button onClick={create} disabled={busy} className="h-[38px] rounded-xl border border-[#B98A52]/25 bg-[#D6A66A] px-4 py-2.5 text-[9px] font-semibold text-[#2C2117] hover:bg-[#C99A5E] disabled:opacity-40">Create credential</button>
      </div>
      <div className="mt-3 text-[8px] leading-4 text-[#8B8177]">Create a separate credential per application or service so it can be rotated, revoked and audited independently. Production credentials have stricter authority and lifetime rules.</div>
      <div className="mt-5 border-t border-black/[.06] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[8px] font-semibold uppercase tracking-[.13em] text-[#91877C]">Credential authority</div>
            <div className="mt-1 text-[8px] text-[#7B736B]">Choose the smallest scopes this integration actually needs.</div>
          </div>
          <div className="rounded-full bg-[#F7F2EA] px-3 py-1.5 text-[8px] font-semibold">{scopes.length} / 64 selected</div>
        </div>
        {!productionEnvironmentSelected?<div className="mt-3 rounded-xl border border-[#B7793B]/20 bg-[#FBF6EF] p-3 text-[8px] leading-5 text-[#76502E]">Development and Staging credentials are read-only against the live organization data plane. Write scopes become available only in Production until Avantiqo has an isolated sandbox data plane.</div>:null}
        <div className="mt-3 flex flex-wrap gap-2">
          {scopes.map((scope)=><button key={scope} type="button" onClick={()=>toggleScope(scope)} className="rounded-lg border border-[#B7793B]/35 bg-[#F1E2CF] px-2.5 py-2 text-left font-mono text-[7px] text-[#6F4828]" title="Remove scope">{scope} ×</button>)}
          {!scopes.length?<div className="text-[8px] text-red-700">Select at least one scope.</div>:null}
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-[1fr_180px]">
          <input value={scopeSearch} onChange={(e)=>setScopeSearch(e.target.value)} placeholder="Search capability, group, action or scope…" className="rounded-xl border border-black/[.08] bg-[#FBF9F6] px-3 py-2.5 text-[9px]"/>
          <select value={scopeKind} onChange={(e)=>setScopeKind(e.target.value)} className="rounded-xl border border-black/[.08] bg-[#FBF9F6] px-3 py-2.5 text-[9px]">
            <option value="all">All scope types</option>
            <option value="global">Global</option>
            <option value="group">Group</option>
            <option value="capability">Capability</option>
          </select>
        </div>
        <div className="mt-3 max-h-[360px] overflow-y-auto rounded-xl border border-black/[.06]">
          {filteredScopeCatalog.map((entry)=>{
            const selected=scopes.includes(entry.scope);
            return <button key={entry.scope} type="button" onClick={()=>toggleScope(entry.scope)} className={"grid w-full gap-1 border-b border-black/[.05] px-3 py-3 text-left last:border-b-0 "+(selected?"bg-[#FBF3E8]":"bg-white hover:bg-[#FBF9F6]")}>
              <div className="flex items-center justify-between gap-3"><span className="text-[9px] font-semibold">{entry.label}</span><span className="text-[7px] uppercase tracking-[.11em] text-[#91877C]">{entry.kind}</span></div>
              <div className="font-mono text-[7px] text-[#7B736B]">{entry.scope}</div>
              <div className="text-[7px] leading-4 text-[#91877C]">{entry.description}</div>
            </button>
          })}
          {!filteredScopeCatalog.length?<div className="p-5 text-center text-[8px] text-[#8B8177]">No scopes match this search.</div>:null}
        </div>
        {effectiveScopeCatalog.length>80 && !scopeSearch?<div className="mt-2 text-[7px] text-[#91877C]">Showing the first 80 scopes. Search to reach a specific group or capability.</div>:null}
      </div>
    </div>
    <div className="mt-4 space-y-2">{rows.map((r)=>{
      const environment=envs.find((item)=>item.id===r.environment_id);
      const expiresAt=r.expires_at?new Date(r.expires_at):null;
      const daysRemaining=expiresAt?Math.ceil((expiresAt.getTime()-Date.now())/(24*60*60*1000)):null;
      const expiringSoon=r.status==="ACTIVE"&&daysRemaining!==null&&daysRemaining<=14;
      return <div key={r.id} className={"rounded-[16px] border bg-white p-4 "+(expiringSoon?"border-[#B7793B]/35":"border-black/[.06]")}>
        <div className="grid gap-3 md:grid-cols-[1.15fr_1fr_180px_130px_auto] md:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2"><div className="text-[11px] font-semibold">{r.name}</div><span className="rounded-full bg-[#F7F2EA] px-2 py-1 text-[7px] font-semibold uppercase tracking-[.09em] text-[#7B736B]">{environment?.environment_key||"unknown"}</span></div>
            <div className="mt-1 font-mono text-[8px] text-[#8B8177]">{r.token_prefix}••••••••{r.token_last_four}</div>
            <div className="mt-2 text-[7px] text-[#91877C]">{r.last_used_at?"Last used "+new Date(r.last_used_at).toLocaleString():"Never used"}</div>
          </div>
          <div className="text-[8px] leading-4 text-[#7B736B]">{(r.scopes||[]).join(", ")}</div>
          <div>
            <div className={"text-[8px] font-semibold "+(expiringSoon?"text-[#9A6531]":"text-[#7B736B]")}>{expiresAt?"Expires "+expiresAt.toLocaleDateString():"No expiry"}</div>
            {daysRemaining!==null?<div className="mt-1 text-[7px] text-[#91877C]">{daysRemaining<0?"Expired":daysRemaining+" days remaining"}</div>:null}
          </div>
          <div className={"text-[8px] font-semibold "+(r.status==="ACTIVE"?"text-[#506D59]":"text-[#8B8177]")}>{r.status}</div>
          {r.status==="ACTIVE"?<div className="flex gap-2"><button onClick={()=>credentialAction(r,"rotate")} className="rounded-lg border border-black/[.08] px-3 py-2 text-[8px]">Rotate</button><button onClick={()=>credentialAction(r,"revoke")} className="rounded-lg border border-red-200 px-3 py-2 text-[8px] text-red-700">Revoke</button></div>:null}
        </div>
        {expiringSoon?<div className="mt-3 rounded-lg border border-[#B7793B]/20 bg-[#FBF6EF] p-2.5 text-[8px] text-[#76502E]">Rotate this credential before expiry and update the consuming integration before revoking the old identity.</div>:null}
      </div>;
    })}</div>
  </div>;
}

export function WebhookManager({ organizationId }) {
  const [rows,setRows]=useState([]),[deliveries,setDeliveries]=useState([]),[envs,setEnvs]=useState([]),[eventCatalog,setEventCatalog]=useState([]),[eventTypes,setEventTypes]=useState(["developer.test"]),[projectionHealth,setProjectionHealth]=useState({ total:0, processing:0, failed:0, dead_letter:0, recent:[] });
  const [error,setError]=useState(""),[secret,setSecret]=useState(""),[busy,setBusy]=useState(false),[url,setUrl]=useState(""),[name,setName]=useState("Production webhook"),[env,setEnv]=useState("");
  const [eventSearch,setEventSearch]=useState("");
  const [copiedSecret,setCopiedSecret]=useState(false);
  const [replayDeliveryId,setReplayDeliveryId]=useState("");
  const [replayConfirmation,setReplayConfirmation]=useState("");
  const [editingEndpointId,setEditingEndpointId]=useState("");
  const [editEndpointName,setEditEndpointName]=useState("");
  const [editEndpointUrl,setEditEndpointUrl]=useState("");

  async function load() {
    setError("");
    try {
      const [a,b]=await Promise.all([
        json(`/api/developers/webhooks?organization_id=${encodeURIComponent(organizationId)}`),
        json(`/api/developers/environments?organization_id=${encodeURIComponent(organizationId)}`)
      ]);
      setRows(a.endpoints||[]); setDeliveries(a.deliveries||[]); setEventCatalog(a.event_catalog||[]); setProjectionHealth(a.projection_health||{ total:0, processing:0, failed:0, dead_letter:0, recent:[] }); setEnvs(b.environments||[]);
      if(!env&&b.environments?.[0])setEnv(b.environments[0].id);
    } catch(e) { setError(e.message); }
  }
  useEffect(()=>{load()},[organizationId]);

  async function create() {
    if(!env||!url)return setError("Environment and HTTPS URL are required.");
    setBusy(true); setSecret("");
    try {
      const body=await json("/api/developers/webhooks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({organization_id:organizationId,environment_id:env,name,url,event_types:eventTypes})});
      setSecret(body.signing_secret||""); setUrl(""); await load();
    } catch(e){setError(e.message)} finally{setBusy(false)}
  }
  async function action(endpoint, action, status=null) {
    setBusy(true); setSecret("");
    try {
      const body=await json("/api/developers/webhooks",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({organization_id:organizationId,id:endpoint.id,action,status})});
      if(body.signing_secret)setSecret(body.signing_secret);
      await load();
    } catch(e){setError(e.message)} finally{setBusy(false)}
  }
  async function test(endpoint) {
    setBusy(true);
    try {
      await json("/api/developers/webhooks/test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({organization_id:organizationId,endpoint_id:endpoint.id})});
      await load();
    } catch(e){setError(e.message)} finally{setBusy(false)}
  }
  async function retry(delivery) {
    setBusy(true);
    try {
      await json("/api/developers/webhooks/retry",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({organization_id:organizationId,delivery_id:delivery.id})});
      await load();
    } catch(e){setError(e.message)} finally{setBusy(false)}
  }

  async function replay(delivery) {
    const expected = `REPLAY ${delivery.event_id}`;
    if (replayConfirmation.trim() !== expected) {
      setError(`Type ${expected} to replay this event.`);
      return;
    }
    setBusy(true); setError("");
    const replayKey = globalThis.crypto?.randomUUID
      ? `replay-${globalThis.crypto.randomUUID()}`
      : `replay-${Date.now()}`;
    try {
      await json("/api/developers/webhooks/replay",{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({
          organization_id:organizationId,
          delivery_id:delivery.id,
          replay_key:replayKey,
          confirmation: replayConfirmation.trim(),
        }),
      });
      setReplayDeliveryId("");
      setReplayConfirmation("");
      await load();
    } catch(e){setError(e.message)} finally{setBusy(false)}
  }

  async function saveEndpoint(endpoint) {
    setBusy(true); setError("");
    try {
      await json("/api/developers/webhooks", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          id: endpoint.id,
          action: "endpoint",
          name: editEndpointName,
          url: editEndpointUrl,
        }),
      });
      setEditingEndpointId("");
      setEditEndpointName("");
      setEditEndpointUrl("");
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  function beginEndpointEdit(endpoint) {
    setEditingEndpointId(endpoint.id);
    setEditEndpointName(endpoint.name || "");
    setEditEndpointUrl(endpoint.url || "");
  }

  async function saveSubscriptions(endpoint) {
    setBusy(true); setError("");
    try {
      await json("/api/developers/webhooks", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          id: endpoint.id,
          action: "subscriptions",
          event_types: eventTypes,
        }),
      });
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  function toggleEventType(eventType) {
    setEventTypes((current) => {
      if (eventType === "*") return current.includes("*") ? ["developer.test"] : ["*"];
      if (current.includes(eventType)) {
        const next = current.filter((item) => item !== eventType);
        return next.length ? next : ["developer.test"];
      }
      const withoutWildcard = current.filter((item) => item !== "*");
      if (withoutWildcard.length >= 64) {
        setError("A webhook endpoint can subscribe to at most 64 event types.");
        return current;
      }
      return [...withoutWildcard, eventType];
    });
  }

  const selectedWebhookEnvironment = envs.find((row) => row.id === env) || null;
  const productionWebhookEnvironment = selectedWebhookEnvironment?.environment_key === "production";
  const normalizedEventSearch = eventSearch.trim().toLowerCase();
  const availableWebhookEvents = (productionWebhookEnvironment
    ? eventCatalog
    : eventCatalog.filter((entry) => entry.event_type === "developer.test"))
    .filter((entry) => {
      if (!normalizedEventSearch) return true;
      return [
        entry.event_type,
        entry.label,
        entry.description,
        entry.group,
        entry.capability_name,
        entry.command,
      ].some((value) => String(value || "").toLowerCase().includes(normalizedEventSearch));
    })
    .slice(0, 80);

  return <div>
    {error?<div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-[10px] text-red-700">{error}</div>:null}
    {secret?<div className="mb-4 rounded-[18px] border border-[#B7793B]/30 bg-[#FBF3E8] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="text-[9px] font-semibold text-[#76502E]">Copy this signing secret now — the previous secret is no longer valid after rotation.</div><button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(secret);setCopiedSecret(true);setTimeout(()=>setCopiedSecret(false),1500);}catch{}}} className="rounded-lg border border-[#B7793B]/25 bg-white px-3 py-2 text-[8px] font-semibold text-[#76502E]">{copiedSecret?"Copied":"Copy secret"}</button></div><div className="mt-3 break-all rounded-xl border border-[#C7B08D]/20 bg-[#FBF6EF] p-3 font-mono text-[9px] text-[#5C4731]">{secret}</div></div>:null}
    <div className="rounded-[20px] border border-black/[.07] bg-white p-5">
      <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr_220px_auto] lg:items-end">
        <label className="block"><span className="mb-1.5 block text-[7px] font-semibold uppercase tracking-[.12em] text-[#91877C]">Endpoint name</span><input value={name} onChange={e=>setName(e.target.value)} className="w-full rounded-xl border border-black/[.08] px-3 py-2.5 text-[10px]" placeholder="Order service webhook"/></label>
        <label className="block"><span className="mb-1.5 block text-[7px] font-semibold uppercase tracking-[.12em] text-[#91877C]">Public HTTPS destination</span><input value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://example.com/webhooks/avantiqo" className="w-full rounded-xl border border-black/[.08] px-3 py-2.5 text-[10px]"/></label>
        <label className="block"><span className="mb-1.5 block text-[7px] font-semibold uppercase tracking-[.12em] text-[#91877C]">Environment</span><select value={env} onChange={e=>{const next=e.target.value;setEnv(next);const selected=envs.find(x=>x.id===next);if(selected?.environment_key!=="production")setEventTypes(["developer.test"]);}} className="w-full rounded-xl border border-black/[.08] px-3 py-2.5 text-[10px]"><option value="">Select environment</option>{envs.filter(x=>x.status==="ACTIVE"&&(canManageSecurity||x.environment_key!=="production")).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
        <button onClick={create} disabled={busy} className="h-[38px] rounded-xl border border-[#B98A52]/25 bg-[#D6A66A] px-4 py-2.5 text-[9px] font-semibold text-[#2C2117] hover:bg-[#C99A5E] disabled:opacity-40">Add endpoint</button>
      </div>
      <div className="mt-3 text-[8px] leading-4 text-[#8B8177]">Avantiqo validates the destination as public HTTPS before activation. Verify the signature against the exact raw body before trusting an event, then deduplicate by the Avantiqo event ID.</div>
      <div className="mt-5 border-t border-black/[.06] pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[8px] font-semibold uppercase tracking-[.13em] text-[#91877C]">Event subscriptions</div>
            <div className="mt-1 text-[8px] text-[#7B736B]">{productionWebhookEnvironment?"Choose committed Operations events. Wildcard is explicit.":"Development and Staging endpoints receive developer.test only."}</div>
          </div>
          <div className="rounded-full bg-[#F7F2EA] px-3 py-1.5 text-[8px] font-semibold">{eventTypes.length} / 64 selected</div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {eventTypes.map((eventType)=><button key={eventType} type="button" onClick={()=>toggleEventType(eventType)} className="rounded-lg border border-[#B7793B]/35 bg-[#F1E2CF] px-2.5 py-2 font-mono text-[7px] text-[#6F4828]">{eventType} ×</button>)}
        </div>
        {productionWebhookEnvironment?<div className="mt-4">
          <div className="grid gap-2 md:grid-cols-[1fr_auto]">
            <input value={eventSearch} onChange={e=>setEventSearch(e.target.value)} placeholder="Search Work Requests, create, planning…" className="rounded-xl border border-black/[.08] bg-[#FBF9F6] px-3 py-2.5 text-[9px]"/>
            <button type="button" onClick={()=>toggleEventType("*")} className={"rounded-xl border px-3 py-2.5 text-[8px] font-semibold "+(eventTypes.includes("*")?"border-[#B7793B]/40 bg-[#F1E2CF] text-[#6F4828]":"border-black/[.08] bg-[#FBF9F6]")}>All Production Operations events (*)</button>
          </div>
          <div className="mt-3 max-h-[320px] overflow-y-auto rounded-xl border border-black/[.06]">
            {availableWebhookEvents.filter(entry=>entry.event_type!=="developer.test").map(entry=><button key={entry.event_type} type="button" onClick={()=>toggleEventType(entry.event_type)} className={"grid w-full gap-1 border-b border-black/[.05] px-3 py-3 text-left last:border-b-0 "+(eventTypes.includes(entry.event_type)?"bg-[#FBF3E8]":"bg-white hover:bg-[#FBF9F6]")}><div className="flex items-center justify-between gap-3"><span className="text-[9px] font-semibold">{entry.label}</span><span className="text-[7px] uppercase tracking-[.11em] text-[#91877C]">{entry.group}</span></div><div className="font-mono text-[7px] text-[#7B736B]">{entry.event_type}</div><div className="text-[7px] leading-4 text-[#91877C]">{entry.description}</div></button>)}
            {!availableWebhookEvents.filter(entry=>entry.event_type!=="developer.test").length?<div className="p-5 text-center text-[8px] text-[#8B8177]">No Production events match this search.</div>:null}
          </div>
        </div>:null}
      </div>
    </div>
    <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_.8fr]"><div className="space-y-2">{rows.map(r=><div key={r.id} className="rounded-[16px] border border-black/[.06] bg-white p-4">{editingEndpointId===r.id?<div className="rounded-xl border border-[#B7793B]/20 bg-[#FBF6EF] p-3"><div className="grid gap-2"><input value={editEndpointName} onChange={(e)=>setEditEndpointName(e.target.value)} className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-[9px]" placeholder="Endpoint name"/><input value={editEndpointUrl} onChange={(e)=>setEditEndpointUrl(e.target.value)} className="rounded-lg border border-black/[.08] bg-white px-3 py-2 font-mono text-[8px]" placeholder="https://example.com/webhooks/avantiqo"/></div><div className="mt-3 flex gap-2"><button disabled={busy||!editEndpointName.trim()||!editEndpointUrl.trim()} onClick={()=>saveEndpoint(r)} className="rounded-lg border border-[#B98A52]/25 bg-[#D6A66A] px-3 py-2 text-[8px] font-semibold text-[#2C2117] hover:bg-[#C99A5E] disabled:opacity-40">Save endpoint</button><button disabled={busy} onClick={()=>setEditingEndpointId("")} className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-[8px]">Cancel</button></div></div>:<div className="flex justify-between gap-3"><div><div className="text-[11px] font-semibold">{r.name}</div><div className="mt-1 break-all font-mono text-[8px] text-[#8B8177]">{r.url}</div></div><div className="text-[8px] font-semibold">{r.status}</div></div>}<div className="mt-3 text-[8px] text-[#7B736B]">Events: {(r.event_types||[]).join(", ")}</div><div className="mt-4 flex flex-wrap gap-2"><button disabled={busy||r.status!=="ACTIVE"} onClick={()=>test(r)} className="rounded-lg border border-black/[.08] px-3 py-2 text-[8px]">Send test</button><button disabled={busy} onClick={()=>beginEndpointEdit(r)} className="rounded-lg border border-black/[.08] px-3 py-2 text-[8px]">Edit endpoint</button><button disabled={busy} onClick={()=>saveSubscriptions(r)} className="rounded-lg border border-[#B7793B]/30 bg-[#FBF3E8] px-3 py-2 text-[8px] text-[#76502E]">Apply selected subscriptions</button><button disabled={busy} onClick={()=>action(r,"rotate_secret")} className="rounded-lg border border-black/[.08] px-3 py-2 text-[8px]">Rotate secret</button><button disabled={busy} onClick={()=>action(r,"status",r.status==="ACTIVE"?"DISABLED":"ACTIVE")} className="rounded-lg border border-black/[.08] px-3 py-2 text-[8px]">{r.status==="ACTIVE"?"Disable":"Enable"}</button></div></div>)}</div><div className="rounded-[16px] border border-black/[.06] bg-white p-4"><div className="text-[9px] font-semibold uppercase tracking-[.14em] text-[#91877C]">Business event bridge</div><div className="mt-3 grid grid-cols-4 gap-2">{[["Tracked",projectionHealth.total],["Processing",projectionHealth.processing],["Failed",projectionHealth.failed],["Dead letter",projectionHealth.dead_letter]].map(([label,value])=><div key={label} className="rounded-lg bg-[#F8F4EE] p-2.5"><div className="text-[7px] uppercase tracking-[.1em] text-[#91877C]">{label}</div><div className="mt-1 text-[13px] font-semibold">{value}</div></div>)}</div>{projectionHealth.failed||projectionHealth.dead_letter?<div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-[8px] text-red-700">Business-event webhook projection needs attention. Open Logs and inspect recent projection errors before relying on downstream automation.</div>:null}<div className="mt-5 text-[9px] font-semibold uppercase tracking-[.14em] text-[#91877C]">Recent deliveries</div><div className="mt-3 space-y-2">{deliveries.slice(0,20).map(x=><div key={x.id} className="rounded-lg bg-[#F8F4EE] p-3"><div className="flex items-start justify-between gap-2"><div><div className="flex flex-wrap items-center gap-2"><div className="text-[8px] font-semibold">{x.event_type} · {x.status}</div>{x.replay_of_delivery_id?<span className="rounded-full bg-[#F1E2CF] px-2 py-0.5 text-[6px] font-semibold uppercase tracking-[.09em] text-[#76502E]">Manual replay</span>:null}</div><div className="mt-1 text-[7px] text-[#8B8177]">attempt {x.attempt} · HTTP {x.response_status||"—"}</div>{x.next_attempt_at?<div className="mt-1 text-[7px] font-medium text-[#76502E]">Auto retry {new Date(x.next_attempt_at).toLocaleString()}</div>:null}{x.error?<div className="mt-1 text-[7px] text-red-700">{x.error}</div>:null}</div><div className="flex gap-2">{x.status==="FAILED"?<button disabled={busy} onClick={()=>retry(x)} className="rounded-md border border-black/[.08] px-2 py-1 text-[7px]">Retry now</button>:null}{x.status==="DELIVERED"&&!x.replay_of_delivery_id?<button disabled={busy} onClick={()=>{setReplayDeliveryId(x.id);setReplayConfirmation("");setError("");}} className="rounded-md border border-[#B7793B]/25 bg-[#FBF3E8] px-2 py-1 text-[7px] text-[#76502E]">Replay event</button>:null}</div></div>{replayDeliveryId===x.id?<div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3"><div className="text-[8px] font-semibold text-red-800">Manual replay can repeat downstream business effects.</div><div className="mt-1 text-[7px] leading-4 text-red-700">Type <span className="font-mono font-semibold">REPLAY {x.event_id}</span> to send the retained event again. The original delivery record remains unchanged.</div><input value={replayConfirmation} onChange={(e)=>setReplayConfirmation(e.target.value)} placeholder={"REPLAY "+x.event_id} className="mt-2 w-full rounded-lg border border-red-200 bg-white px-2.5 py-2 font-mono text-[7px]"/><div className="mt-2 flex gap-2"><button disabled={busy||replayConfirmation.trim()!==("REPLAY "+x.event_id)} onClick={()=>replay(x)} className="rounded-md border border-[#B98A52]/25 bg-[#D6A66A] px-3 py-2 text-[7px] font-semibold text-[#2C2117] hover:bg-[#C99A5E] disabled:opacity-40">Confirm replay</button><button disabled={busy} onClick={()=>{setReplayDeliveryId("");setReplayConfirmation("");}} className="rounded-md border border-black/[.08] bg-white px-3 py-2 text-[7px]">Cancel</button></div></div>:null}</div>)}{!deliveries.length?<div className="text-[9px] text-[#8B8177]">No deliveries yet.</div>:null}</div></div></div>
  </div>;
}
