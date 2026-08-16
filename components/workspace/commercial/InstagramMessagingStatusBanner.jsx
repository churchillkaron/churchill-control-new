"use client";

import { useEffect, useMemo, useState } from "react";

function family(row) {
  return String(row?.family || row?.provider || "").trim().toLowerCase();
}

function formatCheckedAt(value) {
  if (!value) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return null;
  }
}

export default function InstagramMessagingStatusBanner({ organizationId }) {
  const [connections, setConnections] = useState([]);

  useEffect(() => {
    if (!organizationId) return undefined;

    let active = true;
    const controller = new AbortController();

    async function loadStatus() {
      try {
        const url = new URL(
          "/api/commercial/communications/conversations",
          window.location.origin,
        );
        url.searchParams.set("organizationId", organizationId);
        url.searchParams.set("sync", "0");

        const response = await fetch(url, {
          cache: "no-store",
          signal: controller.signal,
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result?.success === false) return;
        if (active) setConnections(result.connections || []);
      } catch (error) {
        if (error?.name !== "AbortError") {
          console.warn("INSTAGRAM_MESSAGING_STATUS_LOAD_FAILED", {
            message: error?.message || "Unable to load Instagram messaging status",
          });
        }
      }
    }

    loadStatus();
    return () => {
      active = false;
      controller.abort();
    };
  }, [organizationId]);

  const instagram = useMemo(
    () => connections.find((row) => family(row) === "instagram") || null,
    [connections],
  );

  if (!instagram) return null;

  const missingScopes = Array.isArray(instagram.requiredScopesMissing)
    ? instagram.requiredScopesMissing.filter(Boolean)
    : [];
  const remoteConversationCount =
    instagram.instagramRemoteConversationCount == null
      ? null
      : Number(instagram.instagramRemoteConversationCount);
  const checkedAt = formatCheckedAt(instagram.messagingReadinessCheckedAt);
  const account = instagram.instagramUsername
    ? `@${instagram.instagramUsername}`
    : "the linked Instagram account";

  let tone = "amber";
  let title = null;
  let detail = null;

  if (instagram.instagramMessagingReady === false) {
    tone = "red";
    title = "Instagram messaging connection needs attention";
    detail = missingScopes.length
      ? `Meta has not granted the required messaging permissions: ${missingScopes.join(", ")}. Review the Meta connection permissions before reconnecting.`
      : `Meta could not verify messaging readiness for ${account}. Review the Instagram messaging connection in Administration → Integrations.`;
  } else if (
    instagram.instagramMessagingReady === true &&
    remoteConversationCount === 0
  ) {
    title = "Instagram connected — Meta returned no conversations";
    detail = `${account} has a valid Page link and the required token scopes. Meta currently returns 0 API-eligible Instagram conversations. Check Instagram → Messages and story replies → Message controls → Connected tools → Allow access to messages, then verify Meta App Review Advanced Access and business verification. Reconnecting is not required while the token remains valid.`;
  } else if (!instagram.messagingReadinessCheckedAt) {
    tone = "neutral";
    title = "Instagram messaging verification pending";
    detail = `${account} is linked. Messaging readiness has not been checked yet; live webhook delivery remains available while the background verification runs.`;
  }

  if (!title) return null;

  const toneClass = tone === "red"
    ? "border-red-400/20 bg-red-400/[0.055] text-red-100/80"
    : tone === "neutral"
      ? "border-white/[0.08] bg-white/[0.025] text-white/62"
      : "border-amber-300/20 bg-amber-300/[0.055] text-amber-50/80";

  return (
    <div className="px-4 pt-4 text-white md:px-6 md:pt-6">
      <div className={`mx-auto max-w-[1780px] rounded-2xl border px-4 py-3 ${toneClass}`}>
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between md:gap-6">
          <div>
            <div className="text-[12px] font-semibold">{title}</div>
            <div className="mt-1 max-w-5xl text-[11px] leading-5 opacity-70">{detail}</div>
          </div>
          <div className="shrink-0 text-[9px] uppercase tracking-[0.14em] opacity-45">
            {checkedAt ? `Checked ${checkedAt}` : "Instagram status"}
          </div>
        </div>
      </div>
    </div>
  );
}
