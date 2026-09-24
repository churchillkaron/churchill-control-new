"use client";

import { useMemo, useState } from "react";

function responseMeta(headers) {
  return {
    request_id: headers.get("x-request-id"),
    api_version: headers.get("x-avantiqo-api-version"),
    environment: headers.get("x-avantiqo-environment"),
    rate_limit: headers.get("x-ratelimit-limit"),
    rate_remaining: headers.get("x-ratelimit-remaining"),
    rate_reset: headers.get("x-ratelimit-reset"),
    monthly_usage: headers.get("x-avantiqo-monthly-usage"),
    monthly_limit: headers.get("x-avantiqo-monthly-limit"),
    monthly_remaining: headers.get("x-avantiqo-monthly-remaining"),
    monthly_reset: headers.get("x-avantiqo-monthly-reset"),
    retry_after: headers.get("retry-after"),
    idempotent_replay: headers.get("x-avantiqo-idempotent-replay") === "true",
  };
}

async function readJsonResponse(response) {
  const body = await response.json().catch(() => ({}));
  return {
    status: response.status,
    meta: responseMeta(response.headers),
    body,
  };
}

function newIdempotencyKey() {
  const id = globalThis.crypto?.randomUUID?.();
  return id ? `avq-explorer-${id}` : `avq-explorer-${Date.now()}`;
}

export default function DeveloperApiExplorer({ organizationId, capabilities, externalDeveloper = false }) {
  const [selectedId,setSelectedId]=useState(capabilities[0]?.id||"");
  const [mode,setMode]=useState(externalDeveloper ? "machine-read" : "session-read");
  const [machineToken,setMachineToken]=useState("");
  const [selectedCommand,setSelectedCommand]=useState(capabilities[0]?.commands?.[0]||"");
  const [payloadText,setPayloadText]=useState("{}");
  const [idempotencyKey,setIdempotencyKey]=useState("");
  const [entityId,setEntityId]=useState("");
  const [periodId,setPeriodId]=useState("");
  const [recordId,setRecordId]=useState("");
  const [filtersText,setFiltersText]=useState("{}");
  const [confirmation,setConfirmation]=useState("");
  const [result,setResult]=useState(null);
  const [loading,setLoading]=useState(false);
  const [snippetLanguage,setSnippetLanguage]=useState("curl");
  const [copiedSnippet,setCopiedSnippet]=useState(false);

  const selected=useMemo(
    ()=>capabilities.find(c=>c.id===selectedId)||capabilities[0],
    [capabilities,selectedId],
  );

  const parsedFilters = useMemo(() => {
    try {
      const parsed = JSON.parse(filtersText || "{}");
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? { valid: true, value: parsed }
        : { valid: false, value: {} };
    } catch {
      return { valid: false, value: {} };
    }
  }, [filtersText]);

  const readContext = useMemo(() => {
    const filters = parsedFilters.value;
    return {
      ...(entityId.trim() ? { entity_id: entityId.trim() } : {}),
      ...(periodId.trim() ? { period_id: periodId.trim() } : {}),
      ...(recordId.trim() ? { id: recordId.trim() } : {}),
      ...filters,
    };
  }, [entityId, periodId, recordId, parsedFilters]);

  const readQuery = useMemo(() => new URLSearchParams(
    Object.entries(readContext).reduce((acc,[key,value]) => {
      if (value !== undefined && value !== null && value !== "") acc[key] = String(value);
      return acc;
    }, {})
  ).toString(), [readContext]);

  const sessionUrl=selected
    ? `/api/operations/${selected.id}?organization_id=${encodeURIComponent(organizationId)}${readQuery ? "&" + readQuery : ""}`
    : "";
  const machineBaseUrl=selected ? `/api/developer/v1/operations/${selected.id}` : "";
  const machineReadUrl=machineBaseUrl ? machineBaseUrl + (readQuery ? "?" + readQuery : "") : "";
  const expectedConfirmation=selectedCommand && selected
    ? `EXECUTE ${selected.id}.${selectedCommand}`
    : "";
  const machineCommand=mode==="machine-command";
  const machineRead=mode==="machine-read";
  const sessionRead=mode==="session-read";

  const snippetPayload = useMemo(() => {
    try {
      const parsed=JSON.parse(payloadText||"{}");
      return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:{};
    } catch {
      return {};
    }
  }, [payloadText]);

  const requestSnippet = useMemo(() => {
    if(!selected)return "";
    const endpointBase=`https://api.avantiqo.ai/api/developer/v1/operations/${selected.id}`;
    const endpoint=machineCommand ? endpointBase : endpointBase + (readQuery ? "?" + readQuery : "");
    const key=idempotencyKey||"avq-your-stable-idempotency-key";
    const commandContext = {
      ...(entityId.trim() ? { entity_id: entityId.trim() } : {}),
      ...(periodId.trim() ? { period_id: periodId.trim() } : {}),
    };
    const body={...snippetPayload,...commandContext,command:selectedCommand};
    if(snippetLanguage==="typescript") {
      return machineCommand
        ? `import { Avantiqo } from "./avantiqo";\n\nconst client = new Avantiqo(process.env.AVANTIQO_TOKEN!);\nconst result = await client.execute(\n  ${JSON.stringify(selected.id)},\n  ${JSON.stringify(selectedCommand)},\n  ${JSON.stringify(key)},\n  ${JSON.stringify({...snippetPayload,...commandContext}, null, 2)}\n);\nconsole.log(result);`
        : `import { Avantiqo } from "./avantiqo";\n\nconst client = new Avantiqo(process.env.AVANTIQO_TOKEN!);\nconst result = await client.list(${JSON.stringify(selected.id)}, ${JSON.stringify(Object.fromEntries(Object.entries(readContext).map(([k,v])=>[k,String(v)])), null, 2)});\nconsole.log(result);`;
    }
    if(snippetLanguage==="python") {
      return machineCommand
        ? `import os\nfrom avantiqo import Avantiqo\n\nclient = Avantiqo(os.environ["AVANTIQO_TOKEN"])\nresult = client.execute(\n    ${JSON.stringify(selected.id)},\n    ${JSON.stringify(selectedCommand)},\n    ${JSON.stringify(key)},\n    ${JSON.stringify({...snippetPayload,...commandContext}, null, 2).replace(/\btrue\b/g,"True").replace(/\bfalse\b/g,"False").replace(/\bnull\b/g,"None")}\n)\nprint(result)`
        : `import os\nfrom avantiqo import Avantiqo\n\nclient = Avantiqo(os.environ["AVANTIQO_TOKEN"])\nresult = client.list(${JSON.stringify(selected.id)}, ${JSON.stringify(readContext, null, 2).replace(/\btrue\b/g,"True").replace(/\bfalse\b/g,"False").replace(/\bnull\b/g,"None")})\nprint(result)`;
    }
    if(machineCommand) {
      const shellJson=JSON.stringify(body).replace(/'/g, `'"'"'`);
      return `curl -sS -X POST ${JSON.stringify(endpoint)} \\\n  -H "Authorization: Bearer $AVANTIQO_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -H "Idempotency-Key: ${key}" \\\n  --data-raw '${shellJson}'`;
    }
    return `curl -sS ${JSON.stringify(endpoint)} \\\n  -H "Authorization: Bearer $AVANTIQO_TOKEN"`;
  }, [entityId,idempotencyKey,machineCommand,periodId,readContext,readQuery,selected,selectedCommand,snippetLanguage,snippetPayload]);

  function chooseCapability(value) {
    setSelectedId(value);
    const capability=capabilities.find(item=>item.id===value);
    setSelectedCommand(capability?.commands?.[0]||"");
    setConfirmation("");
    setResult(null);
  }

  async function runSessionRead() {
    if(!sessionUrl)return;
    if(!parsedFilters.valid) {
      setResult({status:0,meta:{},body:{error:"Read filters must be a valid JSON object."}});
      return;
    }
    setLoading(true); setResult(null);
    try {
      const response=await fetch(sessionUrl,{cache:"no-store",credentials:"include"});
      setResult(await readJsonResponse(response));
    } catch(error) {
      setResult({status:0,meta:{},body:{error:error?.message||"Request failed"}});
    } finally {
      setLoading(false);
    }
  }

  async function runMachineRead() {
    if(!parsedFilters.valid) {
      setResult({status:0,meta:{},body:{error:"Read filters must be a valid JSON object."}});
      return;
    }
    if(!machineReadUrl||!machineToken.trim()) {
      setResult({status:0,meta:{},body:{error:"Paste a machine credential first."}});
      return;
    }
    setLoading(true); setResult(null);
    try {
      const response=await fetch(machineReadUrl,{
        method:"GET",
        cache:"no-store",
        headers:{authorization:`Bearer ${machineToken.trim()}`},
      });
      setResult(await readJsonResponse(response));
    } catch(error) {
      setResult({status:0,meta:{},body:{error:error?.message||"Request failed"}});
    } finally {
      setLoading(false);
    }
  }

  async function runMachineCommand() {
    if(!selected||selected.readOnly) {
      setResult({status:0,meta:{},body:{error:"This capability is read-only."}});
      return;
    }
    if(!machineToken.trim()) {
      setResult({status:0,meta:{},body:{error:"Paste a machine credential first."}});
      return;
    }
    if(!selectedCommand) {
      setResult({status:0,meta:{},body:{error:"Select a command."}});
      return;
    }
    if(confirmation.trim()!==expectedConfirmation) {
      setResult({status:0,meta:{},body:{error:`Type ${expectedConfirmation} to execute this command.`}});
      return;
    }

    let payload;
    try {
      payload=JSON.parse(payloadText||"{}");
    } catch {
      setResult({status:0,meta:{},body:{error:"Payload must be valid JSON."}});
      return;
    }
    if(!payload||Array.isArray(payload)||typeof payload!=="object") {
      setResult({status:0,meta:{},body:{error:"Payload JSON must be an object."}});
      return;
    }

    const key=idempotencyKey.trim()||newIdempotencyKey();
    if(key.length<8||key.length>200) {
      setResult({status:0,meta:{},body:{error:"Idempotency key must be between 8 and 200 characters."}});
      return;
    }
    if(!idempotencyKey.trim())setIdempotencyKey(key);

    setLoading(true); setResult(null);
    try {
      const response=await fetch(machineBaseUrl,{
        method:"POST",
        cache:"no-store",
        headers:{
          authorization:`Bearer ${machineToken.trim()}`,
          "content-type":"application/json",
          "idempotency-key":key,
        },
        body:JSON.stringify({
          ...payload,
          ...(entityId.trim()?{entity_id:entityId.trim()}:{}),
          ...(periodId.trim()?{period_id:periodId.trim()}:{}),
          command:selectedCommand,
        }),
      });
      setResult(await readJsonResponse(response));
    } catch(error) {
      setResult({status:0,meta:{},body:{error:error?.message||"Request failed"}});
    } finally {
      setLoading(false);
    }
  }

  return <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
    <aside className="rounded-[22px] border border-black/[.07] bg-white p-4">
      <div className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#9A744B]">Capability</div>
      <select value={selectedId} onChange={event=>chooseCapability(event.target.value)} className="mt-3 w-full rounded-xl border border-black/[.08] bg-[#FBF9F6] px-3 py-3 text-[10px] outline-none">
        {capabilities.map(capability=><option key={capability.id} value={capability.id}>{capability.name}</option>)}
      </select>
      {selected?<div className="mt-4">
        <div className="text-[12px] font-semibold">{selected.name}</div>
        <p className="mt-2 text-[9px] leading-5 text-[#776F67]">{selected.description}</p>
        <div className="mt-4 text-[8px] text-[#8D8378]">Lifecycle · {selected.lifecycle}</div>
        <div className="mt-2 flex flex-wrap gap-1">{selected.commands.map(command=><span key={command} className="rounded-md bg-[#F2ECE4] px-2 py-1 font-mono text-[7px]">{command}</span>)}</div>
        {selected.boundary?<div className="mt-3 rounded-lg border border-[#B7793B]/15 bg-[#FBF6EF] p-3 text-[8px] leading-4 text-[#76502E]"><span className="font-semibold">Ownership boundary:</span> {selected.boundary}</div>:null}
        {selected.readOnly?<div className="mt-3 rounded-lg bg-[#F8F4EE] p-3 text-[8px] text-[#746D65]">Read-only capability. Machine command execution is disabled.</div>:null}
      </div>:null}
    </aside>

    <section className="rounded-[22px] border border-black/[.07] bg-white p-5">
      <div className="flex flex-wrap gap-2">
        {[
          ...(!externalDeveloper ? [["session-read","Session read"]] : []),
          ["machine-read","Machine read"],
          ["machine-command","Machine command"],
        ].map(([value,label])=><button key={value} type="button" onClick={()=>{setMode(value);setResult(null);setConfirmation("");}} className={"rounded-lg border px-3 py-2 text-[8px] font-semibold "+(mode===value?"border-[#B7793B]/35 bg-[#F1E2CF] text-[#6F4828]":"border-black/[.07] bg-[#FAF8F5] text-[#756D64]")}>{label}</button>)}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {[
          ...(!externalDeveloper ? [["Session read","Use your signed-in human session to inspect data safely while building or debugging inside Avantiqo."]] : []),
          ["Machine read","Use the exact bearer credential your external service will use. This proves environment, scope, headers and quota behavior."],
          ["Machine command","Execute a governed business mutation. This requires Production authority, a command payload, a stable idempotency key and typed confirmation."],
        ].map(([title,copy])=><div key={title} className="rounded-xl border border-black/[.06] bg-[#FBF9F6] p-3"><div className="text-[8px] font-semibold text-[#4B433C]">{title}</div><div className="mt-1 text-[7px] leading-4 text-[#7C746B]">{copy}</div></div>)}
      </div>

      <div className="mt-4 rounded-xl border border-black/[.07] bg-[#FAF8F4] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-[8px] font-semibold uppercase tracking-[.13em] text-[#8B8177]">Business context</div>
            <div className="mt-1 text-[8px] text-[#7B736B]">Optional organization-scoped context. Entity and fiscal period bind the runtime context; record ID and filters apply to reads.</div>
          </div>
          <div className="text-[7px] text-[#91877C]">{parsedFilters.valid?"Filters valid":"Fix filter JSON"}</div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <label className="block"><span className="mb-1 block text-[7px] font-semibold uppercase tracking-[.11em] text-[#91877C]">Legal entity / business entity</span><input value={entityId} onChange={event=>setEntityId(event.target.value)} placeholder="entity_id (optional UUID)" className="w-full rounded-lg border border-black/[.08] bg-white px-3 py-2.5 font-mono text-[8px]"/></label>
          <label className="block"><span className="mb-1 block text-[7px] font-semibold uppercase tracking-[.11em] text-[#91877C]">Fiscal / operating period</span><input value={periodId} onChange={event=>setPeriodId(event.target.value)} placeholder="period_id (optional UUID)" className="w-full rounded-lg border border-black/[.08] bg-white px-3 py-2.5 font-mono text-[8px]"/></label>
          <label className="block"><span className="mb-1 block text-[7px] font-semibold uppercase tracking-[.11em] text-[#91877C]">Record ID for reads</span><input value={recordId} onChange={event=>setRecordId(event.target.value)} disabled={machineCommand} placeholder="id (read one record)" className="w-full rounded-lg border border-black/[.08] bg-white px-3 py-2.5 font-mono text-[8px] disabled:opacity-45"/></label>
        </div>
        <label className="mt-2 block">
          <span className="text-[7px] font-semibold uppercase tracking-[.11em] text-[#91877C]">Read filters JSON</span>
          <textarea value={filtersText} onChange={event=>setFiltersText(event.target.value)} disabled={machineCommand} rows={3} spellCheck={false} className={"mt-1 w-full rounded-lg border bg-white p-3 font-mono text-[8px] leading-5 disabled:opacity-45 "+(parsedFilters.valid?"border-black/[.08]":"border-red-300")}/>
        </label>
        {machineCommand?<div className="mt-2 text-[7px] text-[#91877C]">Commands use entity_id / period_id here; command-specific record identifiers belong in the JSON payload.</div>:null}
      </div>

      {sessionRead?<div className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#9A744B]">Live session read</div>
            <div className="mt-2 text-[11px] text-[#696159]">Uses your logged-in organization session and exact capability authorization. No machine token required.</div>
          </div>
          <button onClick={runSessionRead} disabled={loading} className="rounded-xl border border-[#B98A52]/25 bg-[#D6A66A] px-4 py-2.5 text-[9px] font-semibold text-[#2C2117] hover:bg-[#C99A5E] disabled:opacity-40">{loading?"Running…":"Send request"}</button>
        </div>
        <div className="mt-5 rounded-xl border border-[#C7B08D]/20 bg-[#FBF6EF] p-4 font-mono text-[9px] text-[#5C4731]">
          <div>GET {sessionUrl}</div>
          <div className="mt-1 text-[#81786F]">credentials: include</div>
        </div>
      </div>:null}

      {(machineRead||machineCommand)?<div className="mt-5">
        <div className="rounded-xl border border-[#B7793B]/20 bg-[#FBF6EF] p-4">
          <div className="text-[9px] font-semibold text-[#76502E]">Machine credential</div>
          <div className="mt-1 text-[8px] leading-5 text-[#7B6A59]">Paste a token only for this Explorer session. It is not persisted or echoed into the request preview.</div>
          <input type="password" value={machineToken} onChange={event=>setMachineToken(event.target.value)} autoComplete="off" placeholder="avq_…" className="mt-3 w-full rounded-xl border border-black/[.08] bg-white px-3 py-2.5 font-mono text-[9px]"/>
        </div>

        {machineRead?<div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div><div className="text-[9px] font-semibold uppercase tracking-[.15em] text-[#9A744B]">Machine read</div><div className="mt-2 text-[10px] text-[#696159]">Calls the versioned Developer API with the token’s environment and scopes.</div></div>
          <button onClick={runMachineRead} disabled={loading||!machineToken.trim()} className="rounded-xl border border-[#B98A52]/25 bg-[#D6A66A] px-4 py-2.5 text-[9px] font-semibold text-[#2C2117] hover:bg-[#C99A5E] disabled:opacity-40">{loading?"Running…":"Send machine read"}</button>
        </div>:null}

        {machineCommand?<div className="mt-4">
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[8px] leading-5 text-red-800">Machine commands can mutate live business state only when the pasted token belongs to an active Production environment and carries the required capability authority. Development and Staging are blocked server-side.</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label><span className="text-[8px] font-semibold uppercase tracking-[.12em] text-[#91877C]">Command</span><select value={selectedCommand} onChange={event=>{setSelectedCommand(event.target.value);setConfirmation("");}} disabled={selected?.readOnly} className="mt-1 w-full rounded-xl border border-black/[.08] bg-[#FBF9F6] px-3 py-2.5 text-[9px]">{selected?.commands?.map(command=><option key={command} value={command}>{command}</option>)}</select></label>
            <label><span className="text-[8px] font-semibold uppercase tracking-[.12em] text-[#91877C]">Idempotency key</span><div className="mt-1 flex gap-2"><input value={idempotencyKey} onChange={event=>setIdempotencyKey(event.target.value)} placeholder="Generated on first run" className="min-w-0 flex-1 rounded-xl border border-black/[.08] bg-[#FBF9F6] px-3 py-2.5 font-mono text-[8px]"/><button type="button" onClick={()=>setIdempotencyKey(newIdempotencyKey())} className="rounded-xl border border-black/[.08] px-3 text-[8px]">New</button></div></label>
          </div>
          <label className="mt-3 block"><span className="text-[8px] font-semibold uppercase tracking-[.12em] text-[#91877C]">JSON payload</span><textarea value={payloadText} onChange={event=>setPayloadText(event.target.value)} rows={8} spellCheck={false} className="mt-1 w-full rounded-xl border border-black/[.08] bg-[#FBF9F6] p-3 font-mono text-[8px] leading-5"/></label>
          <div className="mt-3 rounded-xl bg-[#F8F4EE] p-3"><div className="text-[8px] text-[#746D65]">Type this exact phrase to execute:</div><div className="mt-1 font-mono text-[9px] font-semibold">{expectedConfirmation}</div><input value={confirmation} onChange={event=>setConfirmation(event.target.value)} placeholder={expectedConfirmation} className="mt-2 w-full rounded-lg border border-black/[.08] bg-white px-3 py-2.5 font-mono text-[8px]"/></div>
          <button onClick={runMachineCommand} disabled={loading||selected?.readOnly||!machineToken.trim()||confirmation.trim()!==expectedConfirmation} className="mt-4 rounded-xl border border-[#B98A52]/25 bg-[#D6A66A] px-4 py-2.5 text-[9px] font-semibold text-[#2C2117] hover:bg-[#C99A5E] disabled:opacity-40">{loading?"Executing…":"Execute governed command"}</button>
        </div>:null}

        <div className="mt-5 rounded-xl border border-[#C7B08D]/20 bg-[#FBF6EF] p-4 font-mono text-[9px] text-[#5C4731]">
          <div>{machineCommand?"POST":"GET"} {machineCommand?machineBaseUrl:machineReadUrl}</div>
          <div className="mt-1 text-[#81786F]">Authorization: Bearer ••••••••</div>
          {machineCommand?<><div className="mt-1 text-[#81786F]">Idempotency-Key: {idempotencyKey||"(generated on first run)"}</div><div className="mt-2 text-[#6F675E]">body: {JSON.stringify({command:selectedCommand})} + payload</div></>:null}
        </div>

        <div className="mt-4 rounded-xl border border-black/[.07] bg-[#FAF8F4] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-[8px] font-semibold uppercase tracking-[.13em] text-[#8B8177]">Use in your project</div>
              <div className="mt-1 text-[8px] text-[#7B736B]">Generated from this exact capability. Secret material is referenced as AVANTIQO_TOKEN and never copied from the Explorer.</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {["curl","typescript","python"].map((language)=><button key={language} type="button" onClick={()=>{setSnippetLanguage(language);setCopiedSnippet(false);}} className={"rounded-lg border px-2.5 py-1.5 text-[7px] font-semibold "+(snippetLanguage===language?"border-[#B7793B]/35 bg-[#F1E2CF] text-[#6F4828]":"border-black/[.08] bg-white text-[#756D64]")}>{language==="typescript"?"TypeScript":language==="python"?"Python":"cURL"}</button>)}
              <button type="button" onClick={async()=>{try{await navigator.clipboard.writeText(requestSnippet);setCopiedSnippet(true);setTimeout(()=>setCopiedSnippet(false),1500);}catch{}}} className="rounded-lg border border-black/[.08] bg-white px-2.5 py-1.5 text-[7px] font-semibold">{copiedSnippet?"Copied":"Copy code"}</button>
            </div>
          </div>
          <pre className="mt-3 max-h-[360px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-[#C7B08D]/20 bg-[#FBF6EF] p-4 font-mono text-[8px] leading-5 text-[#5C4731]">{requestSnippet}</pre>
        </div>
      </div>:null}

      <div className="mt-4 rounded-xl border border-black/[.07] bg-[#FAF8F4] p-4">
        <div className="text-[8px] font-semibold uppercase tracking-[.13em] text-[#8B8177]">Response</div>
        <pre className="mt-3 max-h-[520px] overflow-auto whitespace-pre-wrap break-words text-[9px] leading-5 text-[#4F4943]">{result?JSON.stringify(result,null,2):"Run a request to inspect status, Developer API metadata and response body."}</pre>
      </div>
    </section>
  </div>;
}
