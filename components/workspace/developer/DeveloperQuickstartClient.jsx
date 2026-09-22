"use client";

import Link from "next/link";
import { useState } from "react";

export default function DeveloperQuickstartClient({ organizationId, capabilityId }) {
  const [copied, setCopied] = useState("");
  const base = `/workspace/${organizationId}/developers`;
  const curl = `export AVANTIQO_TOKEN="paste-once-token-here"

curl -i -sS "https://api.avantiqo.ai/api/developer/v1/operations/${capabilityId}" \\
  -H "Authorization: Bearer $AVANTIQO_TOKEN"`;
  const ts = `import { Avantiqo } from "./avantiqo";

const client = new Avantiqo(process.env.AVANTIQO_TOKEN!);
const result = await client.list(${JSON.stringify(capabilityId)});
console.log(result);
console.log(client.lastResponseMeta);`;

  async function copy(key, value) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      setCopied("");
    }
  }

  return <section className="rounded-[22px] border border-black/[.07] bg-white p-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[9px] font-semibold uppercase tracking-[.18em] text-[#A37849]">Five-minute quickstart</div>
        <h2 className="mt-3 text-[26px] font-medium tracking-[-.035em]">Prove the machine contract before you build around it.</h2>
        <p className="mt-2 max-w-3xl text-[10px] leading-5 text-[#706960]">Start read-only. A successful request proves machine identity, environment binding, organization scope, capability authority, rate/quota enforcement and the versioned response contract without mutating business state.</p>
      </div>
      <Link href={`${base}/api-explorer`} className="rounded-xl border border-[#B7793B]/25 bg-[#FBF3E8] px-4 py-2.5 text-[8px] font-semibold text-[#76502E]">Open API Explorer →</Link>
    </div>

    <div className="mt-6 grid gap-3 lg:grid-cols-4">
      {[
        ["01","Create Development","Create Development or Staging. These environments are read-only against live organization data.",`${base}/environments`],
        ["02","Create a credential","Use the smallest read scope required. Copy the token when it is shown; Avantiqo cannot show it again.",`${base}/credentials`],
        ["03","Send one request","Set AVANTIQO_TOKEN locally and call one canonical capability through the versioned Developer API.",`${base}/api-explorer`],
        ["04","Keep the evidence","Store the request ID in your logs and inspect API version, environment and quota headers before integration rollout.",`${base}/logs`],
      ].map(([index,title,copyText,href])=><Link key={index} href={href} className="rounded-xl border border-black/[.06] bg-[#FBF9F6] p-4 transition hover:border-[#B7793B]/30">
        <div className="text-[8px] font-semibold text-[#A37849]">{index}</div>
        <div className="mt-4 text-[11px] font-semibold">{title}</div>
        <div className="mt-2 text-[8px] leading-4 text-[#7B736B]">{copyText}</div>
      </Link>)}
    </div>

    <div className="mt-5 grid gap-3 xl:grid-cols-2">
      <div className="rounded-xl bg-[#1D1A17] p-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[8px] font-semibold uppercase tracking-[.13em] text-[#D6A66A]">cURL</div>
          <button type="button" onClick={()=>copy("curl",curl)} className="rounded-lg border border-white/15 px-3 py-1.5 text-[7px]">{copied==="curl"?"Copied":"Copy"}</button>
        </div>
        <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words font-mono text-[8px] leading-5 text-white/75">{curl}</pre>
      </div>
      <div className="rounded-xl bg-[#1D1A17] p-4 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[8px] font-semibold uppercase tracking-[.13em] text-[#D6A66A]">TypeScript SDK</div>
          <button type="button" onClick={()=>copy("ts",ts)} className="rounded-lg border border-white/15 px-3 py-1.5 text-[7px]">{copied==="ts"?"Copied":"Copy"}</button>
        </div>
        <pre className="mt-3 overflow-auto whitespace-pre-wrap break-words font-mono text-[8px] leading-5 text-white/75">{ts}</pre>
      </div>
    </div>

    <div className="mt-4 grid gap-2 md:grid-cols-4">
      {[
        ["X-Request-Id","Correlation identity. Preserve it for support and incident diagnosis."],
        ["X-Avantiqo-Api-Version","The exact Developer API contract version used by the response."],
        ["X-Avantiqo-Environment","Confirms which machine environment authorized the request."],
        ["X-RateLimit-* / Monthly-*","Current rate and monthly quota evidence; do not guess retry timing."],
      ].map(([header,detail])=><div key={header} className="rounded-xl border border-black/[.06] bg-[#F8F4EE] p-3">
        <div className="font-mono text-[8px] font-semibold">{header}</div>
        <div className="mt-1 text-[7px] leading-4 text-[#7B736B]">{detail}</div>
      </div>)}
    </div>
  </section>;
}
