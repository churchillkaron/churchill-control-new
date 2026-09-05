"use client";

import { useEffect } from "react";

const sent = new Set();

function text(value, limit = 400) {
  return String(value ?? "").trim().slice(0, limit);
}

export default function PlatformFailureCaptureBeacon({
  category = "runtime_exception",
  errorMessage = null,
  digest = null,
  statusCode = null,
  capability = null,
  workspace = null,
  action = null,
}) {
  useEffect(() => {
    const pathname = typeof window === "undefined" ? "/" : window.location.pathname || "/";
    const key = JSON.stringify([
      category,
      pathname,
      text(errorMessage, 600),
      text(digest, 160),
      statusCode,
      text(capability, 240),
      text(workspace, 240),
      text(action, 240),
    ]);
    if (sent.has(key)) return;
    sent.add(key);

    fetch("/api/platform/self-healing/capture", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category,
        pathname,
        errorMessage: text(errorMessage, 600) || null,
        digest: text(digest, 160) || null,
        statusCode,
        capability: text(capability, 240) || null,
        workspace: text(workspace, 240) || null,
        action: text(action, 240) || null,
      }),
    }).catch(() => {
      sent.delete(key);
    });
  }, [category, errorMessage, digest, statusCode, capability, workspace, action]);

  return null;
}
