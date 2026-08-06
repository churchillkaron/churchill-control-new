import { supabaseAdmin } from "@/lib/shared/supabase/admin";
import { getAvailableModules } from "@/lib/platform/getAvailableModules";
import { requireOrganizationAccess } from "@/lib/platform/security/requireOrganizationAccess";
import { resolvePOSApplicationDefinition } from "@/lib/operations/commerce/server/POSApplicationRegistry";

function normalizeApplicationId(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isActiveStatus(value) {
  return (
    String(value || "")
      .trim()
      .toLowerCase() === "active"
  );
}

function isMissingRow(error) {
  return error?.code === "PGRST116";
}

function moduleIdentifiers(module) {
  return [
    module?.id,
    module?.key,
    module?.module_key,
    module?.slug,
    module?.name,
    module?.title,
  ]
    .map(normalizeApplicationId)
    .filter(Boolean);
}

function isPOSModule(module) {
  return moduleIdentifiers(module).some(
    identifier =>
      identifier === "pos" ||
      identifier === "point_of_sale"
  );
}

function resolveRegisteredApplication(
  applicationId
) {
  if (!applicationId) {
    return null;
  }

  return resolvePOSApplicationDefinition({
    requestedApplicationId:
      applicationId,
  });
}

async function loadOrganization(
  organizationId,
  access
) {
  if (
    access?.organization?.id ===
    organizationId
  ) {
    return access.organization;
  }

  const result = await supabaseAdmin
    .from("organizations")
    .select("*")
    .eq("id", organizationId)
    .maybeSingle();

  if (
    result.error &&
    !isMissingRow(result.error)
  ) {
    throw result.error;
  }

  return result.data || null;
}

async function loadPOSSettings(
  organizationId
) {
  const result = await supabaseAdmin
    .from("operational_settings")
    .select("domain, settings")
    .eq(
      "organization_id",
      organizationId
    );

  if (result.error) {
    throw result.error;
  }

  const row = (
    result.data || []
  ).find(
    candidate =>
      normalizeApplicationId(
        candidate.domain
      ) === "pos"
  );

  return (
    row?.settings &&
    typeof row.settings ===
      "object"
  )
    ? row.settings
    : {};
}

async function loadTemplateBinding(
  organizationId
) {
  const assignmentResult =
    await supabaseAdmin
      .from(
        "organization_template_assignments"
      )
      .select("template_id")
      .eq(
        "organization_id",
        organizationId
      );

  if (assignmentResult.error) {
    throw assignmentResult.error;
  }

  const assignedTemplateIds = [
    ...new Set(
      (
        assignmentResult.data ||
        []
      )
        .map(
          assignment =>
            assignment.template_id
        )
        .filter(Boolean)
    ),
  ];

  if (
    assignedTemplateIds.length ===
    0
  ) {
    return {
      success: true,
      applicationId: null,
      templateId: null,
      templateName: null,
    };
  }

  const moduleResult =
    await supabaseAdmin
      .from(
        "workspace_template_modules"
      )
      .select(
        "template_id, module_id"
      )
      .in(
        "template_id",
        assignedTemplateIds
      );

  if (moduleResult.error) {
    throw moduleResult.error;
  }

  const posTemplateIds = [
    ...new Set(
      (
        moduleResult.data || []
      )
        .filter(row => {
          const moduleId =
            normalizeApplicationId(
              row.module_id
            );

          return (
            moduleId === "pos" ||
            moduleId ===
              "point_of_sale"
          );
        })
        .map(
          row => row.template_id
        )
        .filter(Boolean)
    ),
  ];

  if (
    posTemplateIds.length === 0
  ) {
    return {
      success: true,
      applicationId: null,
      templateId: null,
      templateName: null,
    };
  }

  const templateResult =
    await supabaseAdmin
      .from("workspace_templates")
      .select("*")
      .in("id", posTemplateIds);

  if (templateResult.error) {
    throw templateResult.error;
  }

  const templates = (
    templateResult.data || []
  ).filter(
    template =>
      !template.status ||
      isActiveStatus(
        template.status
      )
  );

  const bindings = templates
    .map(template => ({
      applicationId:
        normalizeApplicationId(
          template.application_id ||
          template.applicationId ||
          template
            .operations_application ||
          template
            .industry_application ||
          template.industry
        ),
      templateId:
        template.id || null,
      templateName:
        template.name || null,
    }))
    .filter(
      binding =>
        binding.applicationId
    );

  const canonicalApplicationIds = [
    ...new Set(
      bindings.map(binding => {
        const application =
          resolveRegisteredApplication(
            binding.applicationId
          );

        return (
          application?.id ||
          binding.applicationId
        );
      })
    ),
  ];

  if (
    canonicalApplicationIds.length >
    1
  ) {
    return {
      success: false,
      error:
        "Multiple POS application bindings are assigned to this organization",
      status: 409,
      applicationIds:
        canonicalApplicationIds,
      templates,
    };
  }

  const canonicalApplicationId =
    canonicalApplicationIds[0] ||
    null;

  const binding =
    bindings.find(candidate => {
      const application =
        resolveRegisteredApplication(
          candidate.applicationId
        );

      return (
        application?.id ||
        candidate.applicationId
      ) === canonicalApplicationId;
    }) || null;

  return {
    success: true,
    applicationId:
      binding?.applicationId ||
      null,
    templateId:
      binding?.templateId || null,
    templateName:
      binding?.templateName || null,
  };
}

function resolveSettingsApplicationId(
  settings
) {
  return [
    settings?.application_id,
    settings?.applicationId,
    settings
      ?.operations_application,
    settings
      ?.industry_application,
  ]
    .map(normalizeApplicationId)
    .find(Boolean) || null;
}

function resolveConfiguredBinding({
  settings,
  templateBinding,
}) {
  const settingsApplicationId =
    resolveSettingsApplicationId(
      settings
    );

  const templateApplicationId =
    templateBinding
      ?.applicationId || null;

  const settingsApplication =
    resolveRegisteredApplication(
      settingsApplicationId
    );

  const templateApplication =
    resolveRegisteredApplication(
      templateApplicationId
    );

  if (
    settingsApplicationId &&
    templateApplicationId
  ) {
    const settingsCanonicalId =
      settingsApplication?.id ||
      settingsApplicationId;

    const templateCanonicalId =
      templateApplication?.id ||
      templateApplicationId;

    if (
      settingsCanonicalId !==
      templateCanonicalId
    ) {
      return {
        success: false,
        error:
          "POS operational settings conflict with the assigned workspace template",
        status: 409,
        settingsApplicationId,
        templateApplicationId,
      };
    }
  }

  if (settingsApplicationId) {
    return {
      success: true,
      binding: {
        source:
          "operational_settings",
        applicationId:
          settingsApplicationId,
        templateId:
          templateBinding
            ?.templateId || null,
        templateName:
          templateBinding
            ?.templateName || null,
      },
    };
  }

  if (templateApplicationId) {
    return {
      success: true,
      binding: {
        source:
          "workspace_template",
        applicationId:
          templateApplicationId,
        templateId:
          templateBinding
            ?.templateId || null,
        templateName:
          templateBinding
            ?.templateName || null,
      },
    };
  }

  return {
    success: true,
    binding: null,
  };
}

export async function resolvePOSRequestApplication({
  request,
  organizationId,
  requestedApplicationId,
}) {
  const access =
    await requireOrganizationAccess({
      organizationId,
      request,
    });

  if (!access.success) {
    return {
      success: false,
      error: access.error,
      status:
        access.status || 403,
    };
  }

  const resolvedOrganizationId =
    access.organizationId;

  const [
    organization,
    settings,
    installedModules,
    templateBinding,
  ] = await Promise.all([
    loadOrganization(
      resolvedOrganizationId,
      access
    ),
    loadPOSSettings(
      resolvedOrganizationId
    ),
    getAvailableModules({
      organizationId:
        resolvedOrganizationId,
      supabase: supabaseAdmin,
    }),
    loadTemplateBinding(
      resolvedOrganizationId
    ),
  ]);

  const posInstallation =
    installedModules.find(
      isPOSModule
    ) || null;

  if (!posInstallation) {
    return {
      success: false,
      error:
        "POS is not installed for this organization",
      status: 409,
      access,
      organization,
      organizationId:
        resolvedOrganizationId,
      settings,
    };
  }

  if (!templateBinding.success) {
    return {
      ...templateBinding,
      access,
      organization,
      organizationId:
        resolvedOrganizationId,
      posInstallation,
      settings,
    };
  }

  const configuredBinding =
    resolveConfiguredBinding({
      settings,
      templateBinding,
    });

  if (!configuredBinding.success) {
    return {
      ...configuredBinding,
      access,
      organization,
      organizationId:
        resolvedOrganizationId,
      posInstallation,
      settings,
      templateBinding,
    };
  }

  const applicationBinding =
    configuredBinding.binding;

  if (!applicationBinding) {
    return {
      success: false,
      error:
        "No POS application binding is configured for this organization",
      status: 409,
      access,
      organization,
      organizationId:
        resolvedOrganizationId,
      posInstallation,
      settings,
      templateBinding,
    };
  }

  const application =
    resolveRegisteredApplication(
      applicationBinding
        .applicationId
    );

  if (!application) {
    return {
      success: false,
      error:
        `Configured POS application is not registered: ${applicationBinding.applicationId}`,
      status: 409,
      access,
      applicationBinding,
      organization,
      organizationId:
        resolvedOrganizationId,
      posInstallation,
      settings,
    };
  }

  const normalizedRequest =
    normalizeApplicationId(
      requestedApplicationId
    );

  if (normalizedRequest) {
    const requestedApplication =
      resolveRegisteredApplication(
        normalizedRequest
      );

    if (
      !requestedApplication ||
      requestedApplication.id !==
        application.id
    ) {
      return {
        success: false,
        error:
          "Requested POS application does not match the organization binding",
        status: 409,
        access,
        applicationBinding,
        organization,
        organizationId:
          resolvedOrganizationId,
        posInstallation,
        settings,
      };
    }
  }

  return {
    success: true,
    access,
    application,
    applicationBinding: {
      ...applicationBinding,
      applicationId:
        application.id,
      configuredValue:
        applicationBinding
          .applicationId,
    },
    organization,
    organizationId:
      resolvedOrganizationId,
    posInstallation,
    settings,
    templateBinding,
  };
}

export default resolvePOSRequestApplication;
