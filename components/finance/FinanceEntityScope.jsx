"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function FinanceEntityScope({
  organizationId,
  title = "Finance Entity Scope",
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const entityId =
    searchParams.get("entityId") ||
    searchParams.get("entity_id") ||
    organizationId;

  function updateEntity(nextEntityId) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("entityId", nextEntityId || organizationId);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-xs uppercase tracking-[0.3em] text-white/40">
        {title}
      </div>

      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <div>
          <div className="text-xs text-white/40">Organization / Client</div>
          <div className="mt-1 rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white">
            {organizationId}
          </div>
        </div>

        <div>
          <div className="text-xs text-white/40">Legal Entity / Books</div>
          <input
            defaultValue={entityId}
            onBlur={(event) => updateEntity(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none"
            placeholder="entity_id"
          />
        </div>

        <div className="flex items-end">
          <button
            onClick={() => updateEntity(entityId)}
            className="rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-black"
          >
            Apply Scope
          </button>
        </div>
      </div>

      <div className="mt-3 text-xs text-white/40">
        organizationId is the client/workspace. entityId is the legal entity/books.
      </div>
    </div>
  );
}

