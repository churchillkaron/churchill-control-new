export const dynamic = "force-dynamic";

import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { resolveBrand } from "@/lib/platform/documents/branding/BrandResolver";
import { listBusinessConnections } from "@/lib/platform/channels/BusinessConnectionRegistry";

function text(value) { return String(value ?? "").trim(); }
function object(value) { return value && typeof value === "object" && !Array.isArray(value) ? value : {}; }
function activeStatus(value) {
  return ["ACTIVE", "ENABLED", "CONNECTED", "READY", "LIVE"].includes(text(value).toUpperCase());
}

async function rows(table, select, organizationId) {
  const result = await supabaseAdmin.from(table).select(select).eq("organization_id", organizationId);
  if (result.error) {
    if (["42P01", "PGRST205"].includes(result.error.code)) return [];
    throw result.error;
  }
  return result.data || [];
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const organizationId = text(url.searchParams.get("organizationId") || url.searchParams.get("organization_id"));
    const access = await requireOrganizationAccess({ organizationId, request });
    if (!access.success) return Response.json(access, { status: access.status || 403 });
    const org = access.organizationId;

    const [
      brand, modules, users, locations, operationalSettings, channels, platformHostnameAssets, paymentConfig, providerAccounts,
      rolePermissions, roleHierarchy, operationsRoles, financeRoles,
      complianceFrameworks, complianceObligations, complianceControls, complianceRisks, complianceIssues,
      accountingProfiles, legalEntities, staffAccounts, customerProfiles, supplierProfiles,
      compensationProfiles, documentTemplates, financeDocumentTemplates, organizationDocuments, enterpriseDocuments,
      supplierPortalInvitations, supplierPortalAccess, inventoryItems, projects, hotelProperties, hotelChannelConnections, customerPortalLinks, customerPortalSessions,
      developerEnvironments, developerCredentials, developerWebhooks,
    ] = await Promise.all([
      resolveBrand({ organizationId: org, entityId: null }),
      rows("organization_modules", "id,module_id,status", org),
      rows("organization_users", "id,role,status", org),
      rows("business_locations", "id,name,status,is_default", org),
      rows("operational_settings", "domain,settings,updated_at", org),
      rows("organization_channel_connections", "id,provider,status,channel_type", org),
      rows("organization_channel_assets", "id,channel_provider,asset_type,external_id,metadata,selected_at,updated_at", org),
      rows("organization_payment_config", "payment_method,enabled,currency,configuration", org),
      rows("organization_payment_provider_accounts", "id,provider,purpose,status", org),
      rows("role_permissions", "id,role,module,can_view,can_create,can_update,can_delete", org),
      rows("role_hierarchy", "id,role,level,can_manage_role", org),
      rows("operations_roles", "id,role_code,role_name,is_active", org),
      rows("finance_roles", "id,role_code,role_name,is_active", org),
      rows("compliance_frameworks", "id,status,framework_code,framework_type", org),
      rows("compliance_obligations", "id,status,obligation_type,due_date,expiry_date,criticality", org),
      rows("compliance_controls", "id,status,control_type,frequency", org),
      rows("compliance_risks", "id,status,category,next_review_date", org),
      rows("compliance_issues", "id,status,severity,due_date", org),
      rows("organization_accounting_profiles", "organization_id,status,vat_registered,tax_regime,base_currency", org),
      rows("legal_entities", "id,is_active,is_default_accounting_entity,country,currency,timezone,locale", org),
      supabaseAdmin.from("staff_accounts").select("id,name,email,auth_user_id,active").eq("active_organization_id", org).eq("active", true).then((result) => {
        if (result.error && !["42P01", "PGRST205"].includes(result.error.code)) throw result.error;
        return result.data || [];
      }),
      rows("customer_profiles", "party_id,status,customer_type", org),
      rows("supplier_profiles", "id,is_active,is_blocked", org),
      rows("employee_compensation_profiles", "id,staff_account_id,effective_from,effective_to,monthly_salary,hourly_rate,payroll_frequency", org),
      rows("document_templates", "id,status,is_default,document_type", org),
      rows("finance_document_templates", "id,status,document_type", org),
      rows("organization_documents", "id,status", org),
      rows("enterprise_documents", "id,document_status", org),
      rows("supplier_portal_invitations", "id,status,expires_at,accepted_at,revoked_at", org),
      rows("supplier_portal_access", "id,status,supplier_profile_id,supplier_party_id,created_at,updated_at", org),
      rows("inventory_items", "id,is_active", org),
      rows("projects", "id,status", org),
      rows("hotel_properties", "id,name,status", org),
      rows("hotel_channel_connections", "id,property_id,provider,status,provider_certified,enabled,last_success_at,last_error", org),
      rows("customer_portal_access_links", "id,party_id,expires_at,consumed_at,revoked_at,created_at", org),
      rows("customer_portal_sessions", "id,party_id,expires_at,revoked_at,last_seen_at,created_at", org),
      rows("developer_environments", "id,environment_key,name,status", org),
      rows("developer_api_credentials", "id,environment_id,name,status,expires_at,revoked_at", org),
      rows("developer_webhook_endpoints", "id,environment_id,name,status,url,event_types", org),
    ]);

    const enabledModules = modules.filter((row) => !row.status || activeStatus(row.status) || text(row.status).toUpperCase() === "INSTALLED");
    const moduleIds = new Set(enabledModules.map((row) => text(row.module_id).toLowerCase()));
    const moduleEnabled = (...ids) => ids.some((id) => moduleIds.has(id));
    const activeUsers = users.filter((row) => !row.status || activeStatus(row.status));
    const activeLocations = locations.filter((row) => !row.status || activeStatus(row.status));
    const activeChannels = channels.filter((row) => activeStatus(row.status));
    const businessConnectionProviders = new Set(
      listBusinessConnections()
        .flatMap((integration) => integration.connectionProviders || [])
        .map((provider) => text(provider).toLowerCase())
        .filter(Boolean),
    );
    const businessConnections = activeChannels.filter((row) =>
      businessConnectionProviders.has(text(row.provider).toLowerCase()),
    );
    const externalIntegrations = activeChannels.filter((row) => !businessConnections.some((item) => item.id === row.id));
    const enabledPayments = paymentConfig.filter((row) => row.enabled === true);
    const activeProviders = providerAccounts.filter((row) => !row.status || activeStatus(row.status));
    const activeStaff = staffAccounts.filter((row) => row.active !== false);
    const portalLinkedStaff = activeStaff.filter((row) => Boolean(row.auth_user_id));
    const platformHostnames = platformHostnameAssets.filter((row) =>
      text(row.channel_provider).toLowerCase() === "avantiqo" &&
      text(row.asset_type).toLowerCase() === "platform_hostname"
    );
    const trustedPlatformHostnames = platformHostnames.filter((row) => {
      const status = text(object(row.metadata).status).toUpperCase();
      return !status || ["ACTIVE", "READY", "VERIFIED", "LIVE"].includes(status);
    });
    const pendingPlatformHostnames = platformHostnames.filter((row) =>
      ["PENDING", "PENDING_VERIFICATION", "VERIFYING"].includes(text(object(row.metadata).status).toUpperCase())
    );
    const registeredStaffHostnames = trustedPlatformHostnames.filter((row) => object(row.metadata).staff_portal !== false);
    const activeCustomers = customerProfiles.filter((row) => !row.status || activeStatus(row.status));
    const activeSuppliers = supplierProfiles.filter((row) => row.is_active === true && row.is_blocked !== true);
    const activeInventory = inventoryItems.filter((row) => row.is_active !== false);
    const activeSupplierPortalAccess = supplierPortalAccess.filter((row) => !row.status || activeStatus(row.status));
    const pendingSupplierPortalInvitations = supplierPortalInvitations.filter((row) => text(row.status).toUpperCase() === "PENDING");
    const activeProjects = projects.filter((row) => !row.status || activeStatus(row.status));
    const activeHotelProperties = hotelProperties.filter((row) => !row.status || activeStatus(row.status));
    const configuredHotelChannels = hotelChannelConnections.filter((row) => text(row.status).toUpperCase() !== "DISCONNECTED");
    const evidenceReadyHotelChannels = configuredHotelChannels.filter((row) =>
      row.enabled === true && row.provider_certified === true && Boolean(row.last_success_at) && !row.last_error,
    );
    const portalEvidenceCount = customerPortalLinks.length + customerPortalSessions.length;
    const activeDeveloperEnvironments = developerEnvironments.filter((row) => !row.status || activeStatus(row.status));
    const activeDeveloperCredentials = developerCredentials.filter((row) => !row.status || activeStatus(row.status));
    const activeDeveloperWebhooks = developerWebhooks.filter((row) => !row.status || activeStatus(row.status));
    const accessSettingsRow = operationalSettings.find((row) => text(row.domain).toUpperCase() === "ACCESS") || null;
    const workforceSettingsRow = operationalSettings.find((row) => text(row.domain).toUpperCase() === "WORKFORCE") || null;
    const accessSettings = accessSettingsRow ? object(accessSettingsRow.settings) : null;
    const workforceSettings = workforceSettingsRow ? object(workforceSettingsRow.settings) : null;
    const securitySettingsCount = Number(Boolean(accessSettingsRow)) + Number(Boolean(workforceSettingsRow));
    const accountingProfile = accountingProfiles.find((row) => !row.status || activeStatus(row.status)) || accountingProfiles[0] || null;
    const defaultEntity = legalEntities.find((row) => row.is_active !== false && row.is_default_accounting_entity === true)
      || legalEntities.find((row) => row.is_active !== false)
      || null;

    const sections = {
      brand: {
        configured: Boolean(brand?.id && (brand?.logo_asset_id || (brand?.logo_icon_asset_id && brand?.logo_icon_valid !== false))),
        complete: Boolean(brand?.logo_asset_id && brand?.logo_icon_asset_id && brand?.logo_icon_valid !== false),
        needsReview: Boolean(brand?.logo_icon_asset_id && brand?.logo_icon_valid === false),
        detail: brand?.logo_icon_asset_id && brand?.logo_icon_valid === false
          ? "Compact icon needs replacement · use a square or near-square logo mark"
          : brand?.logo_asset_id && brand?.logo_icon_asset_id
            ? "Primary logo and compact icon configured"
            : brand?.logo_icon_asset_id
              ? "Compact icon configured · primary logo still optional"
              : brand?.logo_asset_id
                ? "Primary logo configured · compact icon still recommended"
                : "Upload a primary logo and compact icon",
      },
      modules: {
        configured: enabledModules.length > 0,
        complete: enabledModules.length > 0,
        count: enabledModules.length,
        detail: enabledModules.length ? `${enabledModules.length} module${enabledModules.length === 1 ? "" : "s"} enabled` : "No modules enabled",
      },
      team: {
        configured: activeUsers.length > 0,
        complete: activeUsers.length > 0,
        count: activeUsers.length,
        detail: activeUsers.length ? `${activeUsers.length} active user${activeUsers.length === 1 ? "" : "s"}` : "No active team members",
      },
      communications: {
        configured: businessConnections.length > 0,
        complete: businessConnections.length > 0,
        count: businessConnections.length,
        detail: businessConnections.length ? `${businessConnections.length} business connection${businessConnections.length === 1 ? "" : "s"} active` : "No customer channels or business accounts connected",
      },
      payments: {
        configured: enabledPayments.length > 0 || activeProviders.length > 0,
        complete: enabledPayments.length > 0 || activeProviders.length > 0,
        count: Math.max(enabledPayments.length, activeProviders.length),
        detail: enabledPayments.length || activeProviders.length
          ? `${Math.max(enabledPayments.length, activeProviders.length)} payment setup${Math.max(enabledPayments.length, activeProviders.length) === 1 ? "" : "s"} ready`
          : "No customer payment method configured",
      },
      locations: {
        configured: activeLocations.length > 0,
        complete: activeLocations.length > 0,
        count: activeLocations.length,
        detail: activeLocations.length ? `${activeLocations.length} business location${activeLocations.length === 1 ? "" : "s"}` : "No business locations configured",
      },
      integrations: {
        configured: externalIntegrations.length > 0,
        complete: externalIntegrations.length > 0,
        count: externalIntegrations.length,
        detail: externalIntegrations.length
          ? `${externalIntegrations.length} external integration${externalIntegrations.length === 1 ? "" : "s"} connected`
          : "No non-communication external integrations connected",
      },

      roles_permissions: {
        configured: operationsRoles.length > 0 || financeRoles.length > 0 || rolePermissions.length > 0 || roleHierarchy.length > 0,
        complete: rolePermissions.length > 0 || roleHierarchy.length > 0,
        needsReview: (operationsRoles.length > 0 || financeRoles.length > 0) && rolePermissions.length === 0 && roleHierarchy.length === 0,
        count: operationsRoles.length + financeRoles.length + rolePermissions.length + roleHierarchy.length,
        detail: rolePermissions.length || roleHierarchy.length
          ? `${operationsRoles.length + financeRoles.length} domain role${operationsRoles.length + financeRoles.length === 1 ? "" : "s"} · ${rolePermissions.length} permission rule${rolePermissions.length === 1 ? "" : "s"} · ${roleHierarchy.length} hierarchy rule${roleHierarchy.length === 1 ? "" : "s"}`
          : operationsRoles.length || financeRoles.length
            ? `${operationsRoles.length + financeRoles.length} domain role${operationsRoles.length + financeRoles.length === 1 ? "" : "s"} exist · review permission matrix and hierarchy`
            : "Review roles and permissions before inviting a wider team",
      },
      finance: {
        enabled: moduleEnabled("finance", "accounting"),
        configured: Boolean(accountingProfile && defaultEntity),
        complete: Boolean(accountingProfile && defaultEntity?.timezone && defaultEntity?.locale),
        needsReview: Boolean(accountingProfile && defaultEntity && (!defaultEntity.timezone || !defaultEntity.locale)),
        detail: !accountingProfile || !defaultEntity
          ? "Finish the accounting profile and default legal entity"
          : !defaultEntity.timezone || !defaultEntity.locale
            ? "Finance core is active · legal entity timezone/locale needs review"
            : `${text(accountingProfile.base_currency) || text(defaultEntity.currency)} · ${text(accountingProfile.tax_regime) || "Finance baseline"}`,
      },
      documents: {
        configured: documentTemplates.length > 0 || financeDocumentTemplates.length > 0 || organizationDocuments.length > 0 || enterpriseDocuments.length > 0,
        complete: documentTemplates.length > 0 || financeDocumentTemplates.length > 0,
        needsReview: (organizationDocuments.length > 0 || enterpriseDocuments.length > 0) && documentTemplates.length === 0 && financeDocumentTemplates.length === 0,
        count: documentTemplates.length + financeDocumentTemplates.length + organizationDocuments.length + enterpriseDocuments.length,
        detail: documentTemplates.length || financeDocumentTemplates.length
          ? `${documentTemplates.length + financeDocumentTemplates.length} reusable template${documentTemplates.length + financeDocumentTemplates.length === 1 ? "" : "s"} · ${organizationDocuments.length + enterpriseDocuments.length} controlled document${organizationDocuments.length + enterpriseDocuments.length === 1 ? "" : "s"}`
          : organizationDocuments.length || enterpriseDocuments.length
            ? `${organizationDocuments.length + enterpriseDocuments.length} controlled document${organizationDocuments.length + enterpriseDocuments.length === 1 ? "" : "s"} · add a reusable template`
            : "Optional · create reusable templates and controlled records when the business needs them",
      },
      people: {
        enabled: moduleEnabled("hr", "payroll"),
        configured: activeStaff.length > 0,
        complete: activeStaff.length > 0,
        count: activeStaff.length,
        detail: activeStaff.length ? `${activeStaff.length} active staff profile${activeStaff.length === 1 ? "" : "s"}` : "Add the first employee/staff profile",
      },
      staff_portal: {
        enabled: moduleEnabled("hr"),
        configured: activeStaff.length > 0 && (portalLinkedStaff.length > 0 || registeredStaffHostnames.length > 0),
        complete: activeStaff.length > 0 && portalLinkedStaff.length === activeStaff.length && registeredStaffHostnames.length > 0,
        needsReview: activeStaff.length > 0 && (portalLinkedStaff.length < activeStaff.length || registeredStaffHostnames.length === 0),
        count: portalLinkedStaff.length,
        detail: !activeStaff.length
          ? "Add the first employee before Staff Portal activation"
          : registeredStaffHostnames.length === 0
            ? `${portalLinkedStaff.length}/${activeStaff.length} active staff identities are linked · registered Staff Portal hostname still required`
            : portalLinkedStaff.length === activeStaff.length
              ? `${portalLinkedStaff.length}/${activeStaff.length} active staff identities linked · ${registeredStaffHostnames[0].external_id}`
              : `${portalLinkedStaff.length}/${activeStaff.length} active staff identities are linked · send secure setup access from People`,
      },
      payroll: {
        enabled: moduleEnabled("payroll"),
        configured: compensationProfiles.length > 0,
        complete: activeStaff.length > 0 && compensationProfiles.length >= activeStaff.length && Boolean(accountingProfile && defaultEntity),
        needsReview: activeStaff.length > 0 && compensationProfiles.length < activeStaff.length,
        count: compensationProfiles.length,
        detail: !activeStaff.length
          ? "Add active staff before completing payroll setup"
          : compensationProfiles.length >= activeStaff.length
            ? `${compensationProfiles.length} compensation profile${compensationProfiles.length === 1 ? "" : "s"} · open Payroll Setup to verify period and settlement readiness`
            : `${compensationProfiles.length}/${activeStaff.length} active staff have compensation profiles`,
      },
      commercial: {
        enabled: moduleEnabled("crm", "customer_portal", "marketing_ai"),
        configured: activeCustomers.length > 0,
        complete: activeCustomers.length > 0,
        count: activeCustomers.length,
        detail: activeCustomers.length ? `${activeCustomers.length} active customer profile${activeCustomers.length === 1 ? "" : "s"}` : "No canonical customer profiles yet",
      },
      supply_chain: {
        enabled: moduleEnabled("inventory", "procurement", "kitchen"),
        configured: activeInventory.length > 0 || activeSuppliers.length > 0,
        complete: activeInventory.length > 0 && (!moduleEnabled("procurement") || activeSuppliers.length > 0),
        needsReview: moduleEnabled("procurement") && activeInventory.length > 0 && activeSuppliers.length === 0,
        count: activeInventory.length + activeSuppliers.length,
        detail: activeInventory.length || activeSuppliers.length
          ? `${activeInventory.length} active item${activeInventory.length === 1 ? "" : "s"} · ${activeSuppliers.length} active supplier${activeSuppliers.length === 1 ? "" : "s"}`
          : "No inventory items or active suppliers configured",
      },
      supplier_portal: {
        enabled: moduleEnabled("procurement"),
        configured: activeSupplierPortalAccess.length > 0 || pendingSupplierPortalInvitations.length > 0,
        complete: activeSupplierPortalAccess.length > 0,
        needsReview: pendingSupplierPortalInvitations.length > 0 && activeSupplierPortalAccess.length === 0,
        count: activeSupplierPortalAccess.length + pendingSupplierPortalInvitations.length,
        detail: activeSupplierPortalAccess.length
          ? `${activeSupplierPortalAccess.length} supplier portal access record${activeSupplierPortalAccess.length === 1 ? "" : "s"} active${pendingSupplierPortalInvitations.length ? ` · ${pendingSupplierPortalInvitations.length} invitation${pendingSupplierPortalInvitations.length === 1 ? "" : "s"} pending` : ""}`
          : pendingSupplierPortalInvitations.length
            ? `${pendingSupplierPortalInvitations.length} supplier invitation${pendingSupplierPortalInvitations.length === 1 ? "" : "s"} pending acceptance`
            : "Optional · invite a canonical supplier when external supplier collaboration is needed",
      },
      operations: {
        enabled: moduleEnabled("operations", "pos", "kitchen"),
        configured: activeLocations.length > 0,
        complete: activeLocations.length > 0,
        count: activeLocations.length,
        detail: activeLocations.length ? `${activeLocations.length} operating location${activeLocations.length === 1 ? "" : "s"}` : "Add at least one operating/business location",
      },
      pos: {
        enabled: moduleEnabled("pos"),
        configured: activeLocations.length > 0,
        complete: activeLocations.length > 0,
        count: activeLocations.length,
        detail: activeLocations.length ? `POS available across ${activeLocations.length} operating location${activeLocations.length === 1 ? "" : "s"}` : "Add an operating location before using POS",
      },
      customer_portal: {
        enabled: moduleEnabled("customer_portal"),
        configured: portalEvidenceCount > 0,
        complete: portalEvidenceCount > 0,
        count: portalEvidenceCount,
        detail: portalEvidenceCount
          ? `${portalEvidenceCount} customer portal access/session record${portalEvidenceCount === 1 ? "" : "s"} issued`
          : activeCustomers.length
            ? "Customer relationships are ready · issue the first secure Customer Portal link"
            : "Add a customer relationship before issuing Customer Portal access",
      },
      hotel_channels: {
        enabled: moduleEnabled("hotel", "reservations", "frontdesk"),
        configured: configuredHotelChannels.length > 0,
        complete: configuredHotelChannels.length > 0 && evidenceReadyHotelChannels.length === configuredHotelChannels.length,
        needsReview: configuredHotelChannels.length > 0 && evidenceReadyHotelChannels.length < configuredHotelChannels.length,
        count: configuredHotelChannels.length,
        detail: !activeHotelProperties.length
          ? "Create the hotel property before configuring OTA distribution"
          : configuredHotelChannels.length
            ? `${evidenceReadyHotelChannels.length}/${configuredHotelChannels.length} configured hotel channel${configuredHotelChannels.length === 1 ? "" : "s"} have current certified success evidence`
            : "No hotel OTA distribution channels configured yet",
      },

      projects: {
        enabled: moduleEnabled("projects"),
        configured: activeProjects.length > 0,
        complete: activeProjects.length > 0,
        count: activeProjects.length,
        detail: activeProjects.length ? `${activeProjects.length} active project${activeProjects.length === 1 ? "" : "s"}` : "No active projects yet",
      },
      domains: {
        enabled: true,
        configured: trustedPlatformHostnames.length > 0 || pendingPlatformHostnames.length > 0,
        complete: trustedPlatformHostnames.length > 0,
        needsReview: pendingPlatformHostnames.length > 0,
        count: trustedPlatformHostnames.length + pendingPlatformHostnames.length,
        detail: trustedPlatformHostnames.length
          ? `${trustedPlatformHostnames.length} verified hostname${trustedPlatformHostnames.length === 1 ? "" : "s"}${pendingPlatformHostnames.length ? ` · ${pendingPlatformHostnames.length} pending DNS verification` : ""}`
          : pendingPlatformHostnames.length
            ? `${pendingPlatformHostnames.length} hostname${pendingPlatformHostnames.length === 1 ? "" : "s"} pending DNS ownership verification`
            : "Optional · register a customer-owned hostname for branded access or Staff Portal",
      },
      compliance: {
        enabled: true,
        configured: complianceFrameworks.length > 0 || complianceObligations.length > 0 || complianceControls.length > 0 || complianceRisks.length > 0 || complianceIssues.length > 0,
        complete: complianceObligations.length > 0 || complianceFrameworks.length > 0 || complianceControls.length > 0,
        needsReview: complianceIssues.some((row) => text(row.status).toUpperCase() !== "RESOLVED" && text(row.status).toUpperCase() !== "CLOSED"),
        count: complianceFrameworks.length + complianceObligations.length + complianceControls.length + complianceRisks.length + complianceIssues.length,
        detail: complianceFrameworks.length || complianceObligations.length || complianceControls.length || complianceRisks.length || complianceIssues.length
          ? `${complianceObligations.length} obligation${complianceObligations.length === 1 ? "" : "s"} · ${complianceControls.length} control${complianceControls.length === 1 ? "" : "s"} · ${complianceRisks.length} risk${complianceRisks.length === 1 ? "" : "s"}`
          : "Optional · add licenses, permits, insurance, obligations or controls when they apply to this business",
      },
      developer_api: {
        enabled: true,
        configured: activeDeveloperEnvironments.length > 0 || activeDeveloperCredentials.length > 0 || activeDeveloperWebhooks.length > 0,
        complete: activeDeveloperEnvironments.length > 0 && activeDeveloperCredentials.length > 0,
        needsReview: activeDeveloperEnvironments.length > 0 && activeDeveloperCredentials.length === 0,
        count: activeDeveloperEnvironments.length + activeDeveloperCredentials.length + activeDeveloperWebhooks.length,
        detail: activeDeveloperEnvironments.length || activeDeveloperCredentials.length || activeDeveloperWebhooks.length
          ? `${activeDeveloperEnvironments.length} environment${activeDeveloperEnvironments.length === 1 ? "" : "s"} · ${activeDeveloperCredentials.length} credential${activeDeveloperCredentials.length === 1 ? "" : "s"} · ${activeDeveloperWebhooks.length} webhook${activeDeveloperWebhooks.length === 1 ? "" : "s"}`
          : "Optional · create a Developer environment when this organization needs API or webhook access",
      },
      passkeys: {
        enabled: moduleEnabled("hr", "payroll") || activeStaff.length > 0,
        configured: Boolean(workforceSettingsRow),
        complete: Boolean(workforceSettingsRow) && typeof workforceSettings.passkey_clock_in_required === "boolean" && registeredStaffHostnames.length > 0,
        needsReview: Boolean(workforceSettingsRow) && registeredStaffHostnames.length === 0,
        count: activeStaff.length,
        detail: !workforceSettingsRow
          ? "Configure workforce security, then prepare passkey rollout"
          : registeredStaffHostnames.length === 0
            ? "Register the organization Staff Portal hostname before passkey rollout can become ready"
            : workforceSettings.passkey_clock_in_required === true
              ? "Mandatory passkey clock-in is enabled · open readiness to verify staff enrollment and hosted configuration"
              : "Passkeys are not mandatory · open readiness to prepare staff enrollment before enabling enforcement",
      },
      security: {
        configured: securitySettingsCount > 0,
        complete: Boolean(accessSettingsRow && workforceSettingsRow),
        needsReview: securitySettingsCount > 0 && !Boolean(accessSettingsRow && workforceSettingsRow),
        count: securitySettingsCount,
        detail: accessSettingsRow && workforceSettingsRow
          ? "Access and workforce security policy configured"
          : workforceSettingsRow
            ? "Workforce security configured · access policy still uses defaults"
            : accessSettingsRow
              ? "Access policy configured · workforce security still uses defaults"
              : "Review access and workforce security policy",
      },
    };

    return Response.json({
      success: true,
      organizationId: org,
      sections,
      summary: {
        configured: Object.values(sections).filter((item) => item.enabled !== false && item.configured).length,
        total: Object.values(sections).filter((item) => item.enabled !== false).length,
        review: Object.values(sections).filter((item) => item.enabled !== false && item.needsReview).length,
      },
    });
  } catch (error) {
    return Response.json({ success:false, error:error?.message || "Unable to load onboarding readiness" }, { status:500 });
  }
}
