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

fs.writeFileSync(
  generatedPath,
  `${source.slice(0, start)}${replacement}${source.slice(end)}`
);

try {
  await import(`${pathToFileURL(generatedPath).href}?v=${Date.now()}`);
} finally {
  fs.rmSync(generatedPath, { force: true });
}
