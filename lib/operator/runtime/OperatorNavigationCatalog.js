import {
  ERP_REGISTRY,
} from "@/lib/platform/registry/erpRegistry";
import {
  resolveWorkspaceRoute,
} from "@/lib/platform/routing/resolveWorkspaceRoute";
export {
  resolveInstantOperatorNavigation,
} from "./OperatorNavigationMatcher";

function text(value) {
  return String(value ?? "").trim();
}

function cleanPath(value) {
  const source = text(value).split("?")[0];
  if (!source) return "";
  if (source === "/") return source;
  return source.replace(/\/$/, "");
}

function activeItem(item = {}) {
  const status = text(item.status).toLowerCase();
  return status !== "planned" && status !== "disabled" && status !== "archived";
}

function targetId(...parts) {
  return parts
    .map((part) => text(part).toLowerCase().replace(/[^a-z0-9_-]+/g, "-"))
    .filter(Boolean)
    .join(":");
}

export function listOperatorNavigationTargets({
  organizationId,
} = {}) {
  if (!organizationId) return [];

  const targets = [];

  for (const domain of ERP_REGISTRY.domains || []) {
    const route = domain.route || null;
    const href = resolveWorkspaceRoute({
      organizationId,
      moduleId: domain.id,
      route,
    });

    if (href && href !== "#") {
      targets.push({
        id: targetId("domain", domain.id),
        kind: "domain",
        domain_id: domain.id,
        workspace_id: null,
        item_id: null,
        name: domain.name || domain.id,
        description: domain.description || "",
        route: route || "",
        href,
        group_name: "",
        document: "",
        type: domain.type || "",
        search_text: [
          domain.id,
          domain.name,
          domain.description,
        ]
          .filter(Boolean)
          .join(" "),
      });
    }
  }

  for (const [workspaceId, workspace] of Object.entries(
    ERP_REGISTRY.workspaces || {},
  )) {
    for (const group of workspace?.groups || []) {
      for (const item of group?.items || []) {
        if (!item?.route || !activeItem(item)) continue;

        const href = resolveWorkspaceRoute({
          organizationId,
          moduleId: workspaceId,
          workspaceId,
          capabilityId: item.id,
          route: item.route,
        });

        if (!href || href === "#") continue;

        targets.push({
          id: targetId("workspace", workspaceId, item.id),
          kind: "workspace",
          domain_id: workspaceId,
          workspace_id: workspaceId,
          item_id: item.id,
          name: item.name || item.id,
          description: item.description || "",
          route: item.route,
          href,
          group_name: group.name || "",
          document: item.document || "",
          type: item.type || "",
          search_text: [
            workspaceId,
            workspace?.title,
            group?.name,
            item.id,
            item.name,
            item.description,
            item.document,
          ]
            .filter(Boolean)
            .join(" "),
        });
      }
    }
  }

  const byId = new Map();
  for (const target of targets) {
    if (!byId.has(target.id)) byId.set(target.id, target);
  }

  return [...byId.values()];
}

export function resolveOperatorCurrentScreen({
  organizationId,
  pathname,
} = {}) {
  const currentPath = cleanPath(pathname);
  if (!currentPath) return null;

  const matches = listOperatorNavigationTargets({ organizationId })
    .map((target) => ({
      target,
      path: cleanPath(target.href),
    }))
    .filter(({ path }) =>
      path && (currentPath === path || currentPath.startsWith(`${path}/`)),
    )
    .sort((a, b) => b.path.length - a.path.length);

  return matches[0]?.target || null;
}
