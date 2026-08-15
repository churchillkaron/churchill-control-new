function text(value) {
  return String(value ?? "").trim();
}

function linkedInVersion() {
  return text(process.env.LINKEDIN_API_VERSION) || "202607";
}

function headers(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Linkedin-Version": linkedInVersion(),
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };
}

function normalizeOrganizationUrn(value) {
  const urn = text(value);
  if (!urn) return null;
  if (urn.startsWith("urn:li:organizationBrand:")) {
    return urn.replace("urn:li:organizationBrand:", "urn:li:organization:");
  }
  return urn.startsWith("urn:li:organization:") ? urn : null;
}

function organizationIdFromUrn(value) {
  const urn = normalizeOrganizationUrn(value);
  return urn ? urn.split(":").pop() || null : null;
}

async function payload(response) {
  const raw = await response.text();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}

async function listOrganizationAccess(accessToken) {
  const rows = [];
  let start = 0;
  const count = 100;

  for (let page = 0; page < 10; page += 1) {
    const url = new URL("https://api.linkedin.com/rest/organizationAcls");
    url.searchParams.set("q", "roleAssignee");
    url.searchParams.set("state", "APPROVED");
    url.searchParams.set("count", String(count));
    url.searchParams.set("start", String(start));

    const response = await fetch(url, {
      headers: headers(accessToken),
      cache: "no-store",
    });
    const body = await payload(response);

    if (response.status === 403) {
      return {
        status: "PERMISSION_REQUIRED",
        rows: [],
        detail:
          body?.message ||
          "LinkedIn organization access permission is not available for this application.",
      };
    }

    if (!response.ok) {
      throw new Error(
        body?.message ||
          body?.error?.message ||
          `LinkedIn organization access lookup failed (${response.status})`,
      );
    }

    const elements = Array.isArray(body?.elements) ? body.elements : [];
    rows.push(...elements);

    const next = Array.isArray(body?.paging?.links)
      ? body.paging.links.find((link) => text(link?.rel).toLowerCase() === "next")
      : null;

    if (!next || elements.length === 0) break;
    start += count;
  }

  return { status: "READY", rows, detail: null };
}

async function lookupOrganizations(accessToken, ids) {
  const uniqueIds = [...new Set(ids.map(text).filter(Boolean))];
  const results = new Map();

  for (let index = 0; index < uniqueIds.length; index += 50) {
    const batch = uniqueIds.slice(index, index + 50);
    const url = new URL("https://api.linkedin.com/rest/organizationsLookup");
    url.searchParams.set("ids", `List(${batch.join(",")})`);

    const response = await fetch(url, {
      headers: headers(accessToken),
      cache: "no-store",
    });
    const body = await payload(response);

    if (!response.ok) {
      continue;
    }

    const organizations =
      body?.results && typeof body.results === "object" ? body.results : {};

    for (const [id, organization] of Object.entries(organizations)) {
      results.set(text(id), organization || {});
    }
  }

  return results;
}

export async function discoverLinkedInOrganizations({ accessToken }) {
  const token = text(accessToken);
  if (!token) throw new Error("LINKEDIN_ACCESS_TOKEN_REQUIRED");

  const access = await listOrganizationAccess(token);
  if (access.status !== "READY") {
    return {
      status: access.status,
      detail: access.detail,
      organizations: [],
      api_version: linkedInVersion(),
    };
  }

  const byUrn = new Map();
  for (const row of access.rows) {
    const urn = normalizeOrganizationUrn(
      row?.organizationTarget || row?.organization,
    );
    const id = organizationIdFromUrn(urn);
    if (!urn || !id) continue;

    const previous = byUrn.get(urn) || {
      id,
      urn,
      roles: [],
    };
    const role = text(row?.role);
    if (role && !previous.roles.includes(role)) previous.roles.push(role);
    byUrn.set(urn, previous);
  }

  const baseOrganizations = [...byUrn.values()];
  const lookup = await lookupOrganizations(
    token,
    baseOrganizations.map((organization) => organization.id),
  );

  const organizations = baseOrganizations.map((organization) => {
    const details = lookup.get(organization.id) || {};
    return {
      ...organization,
      name:
        text(details?.localizedName) ||
        text(details?.name?.localized?.en_US) ||
        `LinkedIn Page ${organization.id}`,
      vanity_name: text(details?.vanityName) || null,
      primary_organization_type: text(details?.primaryOrganizationType) || null,
    };
  });

  return {
    status: organizations.length ? "READY" : "NO_ORGANIZATIONS",
    detail: organizations.length
      ? null
      : "No approved LinkedIn Company Page was found for the authorized member.",
    organizations,
    api_version: linkedInVersion(),
  };
}
