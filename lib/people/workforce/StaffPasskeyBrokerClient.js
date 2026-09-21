"use client";

import { supabaseClient } from "@/lib/shared/supabase/client";

function hiddenField(name, value) {
  const input = document.createElement("input");
  input.type = "hidden";
  input.name = name;
  input.value = value;
  return input;
}

export async function beginCentralPasskeySignIn({ returnPath = "/workforce" } = {}) {
  const response = await fetch("/api/auth/staff/passkey/start", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnPath }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success || !payload?.authorizationUrl) {
    throw new Error(payload?.error || "Unable to start secure passkey sign-in.");
  }
  window.location.assign(payload.authorizationUrl);
}

export async function beginCentralPasskeyEnrollment({ returnPath = "/workforce/profile" } = {}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabaseClient.auth.getSession();

  if (sessionError || !session?.access_token || !session?.refresh_token) {
    throw new Error("Sign in again before registering a passkey.");
  }

  const response = await fetch("/api/auth/staff/passkey/enroll/start", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnPath }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success || !payload?.handoffUrl || !payload?.state) {
    throw new Error(payload?.error || "Unable to start secure passkey enrollment.");
  }

  const form = document.createElement("form");
  form.method = "POST";
  form.action = payload.handoffUrl;
  form.style.display = "none";
  form.appendChild(hiddenField("state", payload.state));
  form.appendChild(hiddenField("access_token", session.access_token));
  form.appendChild(hiddenField("refresh_token", session.refresh_token));
  document.body.appendChild(form);
  form.submit();
}

export default beginCentralPasskeyEnrollment;
