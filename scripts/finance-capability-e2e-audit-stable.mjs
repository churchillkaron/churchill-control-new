#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const sourcePath = path.join(ROOT, "scripts/finance-capability-e2e-audit-v2.mjs");
const generatedPath = path.join(
  ROOT,
  "scripts",
  `.finance-capability-e2e-stable-${process.pid}.mjs`
);

const source = fs.readFileSync(sourcePath, "utf8");
const start = source.indexOf("async function inspectMenusAndDetail(");
const end = source.indexOf("\nasync function main()", start);

if (start < 0 || end < 0) {
  throw new Error("FINANCE_E2E_STABLE_PATCH_TARGET_NOT_FOUND");
}

const replacement = `async function inspectRowMenuButtons(harness, client) {
  return harness.evaluate(client, \`(() => {
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || 1) > 0 &&
        rect.width > 2 &&
        rect.height > 2;
    };
    const normalized = value => String(value || "").replace(/\\s+/g, " ").trim();
    const allEllipsis = Array.from(document.querySelectorAll("button"))
      .filter(visible)
      .filter(button => normalized(button.textContent) === "...");
    const rowButtons = allEllipsis.filter(button =>
      !button.closest("header") &&
      !button.closest("aside")
    );
    return {
      totalEllipsisCount: allEllipsis.length,
      rowEllipsisCount: rowButtons.length,
      rowLabels: rowButtons.slice(0, 10).map(button => {
        const row = button.closest(".relative") || button.parentElement?.parentElement;
        return normalized(row?.textContent).slice(0, 180);
      }),
    };
  })()\`);
}

async function clickFirstRowMenu(harness, client) {
  return harness.evaluate(client, \`(() => {
    const visible = element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none" &&
        style.visibility !== "hidden" &&
        Number(style.opacity || 1) > 0 &&
        rect.width > 2 &&
        rect.height > 2;
    };
    const normalized = value => String(value || "").replace(/\\s+/g, " ").trim();
    const rowButtons = Array.from(document.querySelectorAll("button"))
      .filter(visible)
      .filter(button => normalized(button.textContent) === "...")
      .filter(button => !button.closest("header") && !button.closest("aside"));
    const button = rowButtons[0];
    if (!button) {
      return { clicked: false, count: 0 };
    }
    const row = button.closest(".relative") || button.parentElement?.parentElement;
    const rowText = normalized(row?.textContent).slice(0, 240);
    button.click();
    return {
      clicked: true,
      count: rowButtons.length,
      rowText,
    };
  })()\`);
}

async function waitForRowMenuReady(harness, client, rowCount, timeoutMs = 15000) {
  if (!(Number(rowCount) > 0)) {
    return { ready: false, reason: "no real rows", rowEllipsisCount: 0 };
  }

  const startedAt = Date.now();
  let last = null;

  while (Date.now() - startedAt < timeoutMs) {
    const menuState = await inspectRowMenuButtons(harness, client);
    const loadingState = await harness.evaluate(client, \`(() => {
      const visible = element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || 1) > 0 &&
          rect.width > 2 &&
          rect.height > 2;
      };
      return Array.from(document.querySelectorAll("main *"))
        .filter(visible)
        .some(element => String(element.textContent || "").trim() === "Loading...");
    })()\`);

    last = {
      ...menuState,
      loading: Boolean(loadingState),
      ready: menuState.rowEllipsisCount > 0 && !loadingState,
    };

    if (last.ready) return last;
    await harness.sleep(350);
  }

  return {
    ...(last || {}),
    ready: false,
    reason: "browser record rows did not finish rendering before timeout",
  };
}

async function inspectMenusAndDetail(harness, client, capability, definition, rowCount) {
  const topExpected = definition.topActions.length;
  const rowExpected = definition.rowActions.length;
  let ui = await inspectVisibleUi(harness, client);
  const topChecks = [];
  const rawVisible = ui.buttons.filter(isRawIdentifier);
  if (rawVisible.length) topChecks.push(\`raw visible actions: \${rawVisible.join(", ")}\`);

  const ellipsis = await clickButton(harness, client, { type: "exact", value: "..." }, "first");
  if (ellipsis.clicked) {
    await harness.sleep(250);
    ui = await inspectVisibleUi(harness, client);
    const rawMenu = ui.buttons.filter(isRawIdentifier);
    if (rawMenu.length) topChecks.push(\`raw menu actions: \${rawMenu.join(", ")}\`);
    await closeOverlay(harness, client);
  } else if (topExpected > 0) {
    topChecks.push("top action menu could not be opened");
  }

  const topActions = topChecks.length
    ? check("FAIL", topChecks.join("; "), ui)
    : check("PASS", null, { expected: topExpected });

  if (!rowExpected) {
    return {
      topActions,
      rowActions: check("N/A", "no row actions configured"),
      detailView: check("N/A", "no row actions configured"),
    };
  }

  if (!(Number(rowCount) > 0)) {
    return {
      topActions,
      rowActions: check("BLOCKED", "no real row exists to exercise row actions"),
      detailView: check("BLOCKED", "no real row exists to open"),
    };
  }

  const readiness = await waitForRowMenuReady(harness, client, rowCount);
  if (!readiness.ready) {
    return {
      topActions,
      rowActions: check("FAIL", readiness.reason || "row action menu did not become ready", readiness),
      detailView: check("FAIL", "detail view could not be tested because browser rows were not ready", readiness),
    };
  }

  const rowMenu = await clickFirstRowMenu(harness, client);
  if (!rowMenu.clicked) {
    return {
      topActions,
      rowActions: check("FAIL", "real row action menu button missing", { rowMenu, readiness }),
      detailView: check("FAIL", "detail view could not be opened", { rowMenu, readiness }),
    };
  }

  await harness.sleep(300);
  ui = await inspectVisibleUi(harness, client);
  const rawActions = ui.buttons.filter(isRawIdentifier);
  const rowActions = rawActions.length
    ? check("FAIL", \`raw row actions: \${rawActions.join(", ")}\`, ui)
    : check("PASS", null, { ...ui, rowMenu });

  const open = await clickButton(harness, client, { type: "exact", value: "Open" });
  if (!open.clicked) {
    await closeOverlay(harness, client);
    return {
      topActions,
      rowActions,
      detailView: check("FAIL", "Open action missing from real row menu", { ...ui, rowMenu }),
    };
  }

  const detailStartedAt = Date.now();
  let detailUi = null;
  while (Date.now() - detailStartedAt < 8000) {
    detailUi = await inspectVisibleUi(harness, client);
    if (detailUi.hasModal && detailUi.headings.length > 1) break;
    await harness.sleep(250);
  }

  if (!detailUi?.hasModal) {
    return {
      topActions,
      rowActions,
      detailView: check("FAIL", "Open action did not produce a visible detail dialog", detailUi),
    };
  }

  const leaks = technicalLeaks(detailUi);
  const detailView = leaks.length
    ? check("FAIL", leaks.join("; "), detailUi)
    : check("PASS", null, detailUi);
  await closeOverlay(harness, client);
  return { topActions, rowActions, detailView };
}
`;

const authentication = `async function authenticateFinanceAudit(harness, client, baseUrl, email, password, localEnv) {
  const supabaseUrl = String(
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    localEnv.NEXT_PUBLIC_SUPABASE_URL ||
    localEnv.SUPABASE_URL ||
    ""
  ).trim();
  const anonKey = String(
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    localEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    localEnv.SUPABASE_ANON_KEY ||
    ""
  ).trim();

  if (!supabaseUrl || !anonKey) {
    throw new Error("Finance E2E authentication requires the Supabase URL and anonymous key");
  }

  const [{ createServerClient }, { default: WebSocket }] = await Promise.all([
    import("@supabase/ssr"),
    import("ws"),
  ]);

  const cookieJar = new Map();
  const cookieOptions = new Map();
  const supabase = createServerClient(supabaseUrl, anonKey, {
    realtime: { transport: WebSocket },
    cookies: {
      getAll() {
        return [...cookieJar.entries()].map(([name, value]) => ({ name, value }));
      },
      setAll(cookiesToSet) {
        for (const cookie of cookiesToSet) {
          cookieJar.set(cookie.name, cookie.value);
          cookieOptions.set(cookie.name, cookie.options || {});
        }
      },
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data?.session || !data?.user) {
    throw new Error(\`Finance E2E Supabase authentication failed: \${error?.message || "session unavailable"}\`);
  }

  const sameSite = value => {
    const normalized = String(value || "").toLowerCase();
    if (normalized === "strict") return "Strict";
    if (normalized === "none") return "None";
    if (normalized === "lax") return "Lax";
    return undefined;
  };

  const cookies = [...cookieJar.entries()].map(([name, value]) => {
    const options = cookieOptions.get(name) || {};
    const cookie = {
      name,
      value,
      url: \`\${baseUrl}/\`,
      secure: baseUrl.startsWith("https://"),
      httpOnly: Boolean(options.httpOnly),
    };
    const resolvedSameSite = sameSite(options.sameSite);
    if (resolvedSameSite) cookie.sameSite = resolvedSameSite;
    if (Number.isFinite(options.maxAge)) {
      cookie.expires = Math.floor(Date.now() / 1000) + Number(options.maxAge);
    }
    return cookie;
  });

  if (!cookies.length) {
    throw new Error("Finance E2E Supabase authentication produced no session cookies");
  }

  await client.send("Network.setCookies", { cookies });
  await harness.navigate(client, \`\${baseUrl}/login\`);

  const startedAt = Date.now();
  let last = null;
  while (Date.now() - startedAt < 30000) {
    last = await harness.evaluate(client, \`(async () => {
      try {
        const response = await fetch("/api/session/bootstrap", { credentials: "include" });
        const contentType = response.headers.get("content-type") || "";
        const text = await response.text();
        let data = null;
        if (contentType.includes("application/json")) {
          try { data = JSON.parse(text); } catch {}
        }
        return { status: response.status, data, text: text.slice(0, 700) };
      } catch (error) {
        return { status: 0, error: error.message };
      }
    })()\`);

    if (last?.status === 200 && last?.data?.success) {
      console.log("AUTH=SUPABASE_SSR_COOKIE");
      return last.data;
    }
    await harness.sleep(350);
  }

  throw new Error(
    \`Finance E2E authenticated bootstrap failed: status=\${last?.status || 0} body=\${last?.text || last?.error || "unavailable"}\`
  );
}
`;

let generatedSource = `${source.slice(0, start)}${replacement}${source.slice(end)}`;
generatedSource = generatedSource.replace(
  "async function main() {",
  `${authentication}\nasync function main() {`
);
generatedSource = generatedSource.replace(
  "const bootstrap = await harness.login(client, server.baseUrl, email, password);",
  "const bootstrap = await authenticateFinanceAudit(harness, client, server.baseUrl, email, password, localEnv);"
);

if (!generatedSource.includes("AUTH=SUPABASE_SSR_COOKIE")) {
  throw new Error("FINANCE_E2E_AUTH_PATCH_NOT_APPLIED");
}

fs.writeFileSync(generatedPath, generatedSource);

try {
  await import(`${pathToFileURL(generatedPath).href}?v=${Date.now()}`);
} finally {
  fs.rmSync(generatedPath, { force: true });
}
