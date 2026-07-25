import * as CreativeProjectRepository
from "@/lib/creative/projects/repositories/CreativeProjectRepository";
import * as AssetGraphRepository
from "@/lib/creative/assets/graph/repositories/CreativeAssetGraphRepository";
import {
  CREATIVE_ASSET_NODE_TYPES,
} from "@/lib/creative/assets/graph/documents/CreativeAssetNode";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function profileId(profile = {}) {
  return String(profile.id || profile.name || "").trim();
}

function configuredProfiles(project = {}) {
  const metadata = project.metadata || {};
  const direct = [
    ...list(metadata.export_profiles),
    ...list(metadata.exportProfiles),
    ...list(metadata.delivery_profiles),
    ...list(metadata.deliveryProfiles),
    ...list(metadata.render_profiles),
    ...list(metadata.renderProfiles),
  ];
  const channelProfiles = [
    ...list(metadata.channel_export_profiles),
    ...list(metadata.channelExportProfiles),
  ].flatMap((entry) => list(entry?.profiles || entry?.export_profiles || entry?.exportProfiles));

  return [...direct, ...channelProfiles]
    .filter((profile) => profile && typeof profile === "object" && profileId(profile));
}

function profileForChannel(profiles, channel) {
  if (!channel) return null;
  const normalized = String(channel).trim().toLowerCase();

  return profiles.find((profile) => {
    const channels = list(profile.channels || profile.target_channels || profile.targetChannels)
      .map((item) => String(item).trim().toLowerCase());
    return channels.includes(normalized);
  }) || null;
}

function defaultProfile(profiles, project = {}) {
  const configuredDefault =
    project.metadata?.default_export_profile_id ||
    project.metadata?.defaultExportProfileId ||
    project.metadata?.default_delivery_profile_id ||
    project.metadata?.defaultDeliveryProfileId ||
    null;

  if (configuredDefault) {
    const match = profiles.find((profile) => profileId(profile) === String(configuredDefault));
    if (match) return match;
  }

  const explicitDefaults = profiles.filter((profile) =>
    profile.default === true ||
    profile.is_default === true ||
    profile.isDefault === true,
  );

  return explicitDefaults.length === 1 ? explicitDefaults[0] : null;
}

function manualAllowed(project = {}, policy = {}) {
  return (
    policy.allow_manual_export_profile === true ||
    policy.allowManualExportProfile === true ||
    project.metadata?.allow_manual_export_profile === true ||
    project.metadata?.allowManualExportProfile === true
  );
}

export const CreativeExportProfileResolver = {
  async resolve({
    organization_id,
    timeline_asset_node_id,
    profile_id = null,
    channel = null,
    manual_profile = null,
    policy = {},
  } = {}) {
    if (!organization_id) throw new Error("organization_id required");
    if (!timeline_asset_node_id) throw new Error("timeline_asset_node_id required");

    const timeline = await AssetGraphRepository.getById(timeline_asset_node_id);
    if (
      !timeline ||
      timeline.organization_id !== organization_id ||
      timeline.type !== CREATIVE_ASSET_NODE_TYPES.TIMELINE
    ) {
      throw new Error("Timeline asset node not found");
    }
    if (!timeline.creative_project_id) {
      throw new Error("Timeline project required");
    }

    const project = await CreativeProjectRepository.getById(timeline.creative_project_id);
    if (!project || project.organization_id !== organization_id) {
      throw new Error("Creative project not found");
    }

    if (manual_profile && Object.keys(manual_profile).length) {
      if (!manualAllowed(project, policy)) {
        throw new Error("MANUAL_EXPORT_PROFILE_NOT_AUTHORIZED");
      }

      return {
        profile: manual_profile,
        source: "MANUAL_AUTHORIZED",
        project,
        timeline,
      };
    }

    const profiles = configuredProfiles(project);
    if (!profiles.length) throw new Error("PROJECT_EXPORT_PROFILES_REQUIRED");

    let profile = null;
    if (profile_id) {
      profile = profiles.find((candidate) => profileId(candidate) === String(profile_id)) || null;
      if (!profile) throw new Error("PROJECT_EXPORT_PROFILE_NOT_FOUND");
    } else {
      profile = profileForChannel(profiles, channel) || defaultProfile(profiles, project);
      if (!profile) throw new Error("EXPORT_PROFILE_SELECTION_REQUIRED");
    }

    return {
      profile,
      source: "PROJECT_CONFIGURATION",
      project,
      timeline,
    };
  },
};
