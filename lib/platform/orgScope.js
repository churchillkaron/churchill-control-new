
/**
 * ORGANIZATION SCOPE RESOLVER
 * Ensures full isolation across SaaS customers
 */

export function getOrgScope(req) {

  return {
    organizationId:
      req.headers.get("x-org-id") || null,

    terminalId:
      req.headers.get("x-terminal-id") || "unknown"
  };

}

