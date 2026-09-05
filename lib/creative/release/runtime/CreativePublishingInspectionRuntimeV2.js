import {
  CreativePublishingInspectionRuntime,
} from "@/lib/creative/release/runtime/CreativePublishingInspectionRuntime";
import {
  CreativeMasterVersionRuntime,
} from "@/lib/creative/release/runtime/CreativeMasterVersionRuntime";

export const CreativePublishingInspectionRuntimeV2 = Object.freeze({
  contract: "CREATIVE_PUBLISHING_INSPECTION_V2",

  async inspect({ organization_id, creative_project_id } = {}) {
    const [publishing, history] = await Promise.all([
      CreativePublishingInspectionRuntime.inspect({
        organization_id,
        creative_project_id,
      }),
      CreativeMasterVersionRuntime.inspect({
        organization_id,
        creative_project_id,
      }),
    ]);

    const currentVersion = history.versions.find((item) => item.current) ||
      history.versions.at(-1) ||
      null;
    const readiness = publishing.release?.readiness || null;
    const currentReadiness = Boolean(
      currentVersion &&
      readiness?.final_render_asset_node_id === currentVersion.master_asset_node_id &&
      readiness?.passed === true,
    );
    const packageCertified = Boolean(currentVersion?.release_package?.certified);
    const publishApproved = Boolean(
      currentReadiness &&
      currentVersion?.publish_approval &&
      publishing.release?.publish_approval?.id === currentVersion.publish_approval.id,
    );

    const targets = (publishing.targets || []).map((target) => ({
      ...target,
      can_authorize: Boolean(
        target.can_authorize &&
        currentReadiness &&
        packageCertified &&
        publishApproved,
      ),
      stale_master_blocked: !currentReadiness,
    }));

    return {
      ...publishing,
      contract: this.contract,
      master_history: history,
      master: currentVersion
        ? {
            ...(publishing.master || {}),
            id: currentVersion.master_asset_node_id,
            technical: currentVersion.technical,
            export_profile: currentVersion.export_profile,
          }
        : publishing.master,
      release: {
        ...(publishing.release || {}),
        current_master_asset_node_id: currentVersion?.master_asset_node_id || null,
        current_master_version: currentVersion?.version || null,
        current_master_readiness: currentReadiness,
        current_package_certified: packageCertified,
        publication_authorized: publishApproved,
        can_approve_publication: Boolean(
          currentReadiness &&
          packageCertified &&
          !currentVersion?.publish_approval,
        ),
        stale_readiness_blocked: Boolean(readiness && !currentReadiness),
        blocker: !currentVersion
          ? "CURRENT_RELEASE_MASTER_REQUIRED"
          : !currentReadiness
            ? "CURRENT_MASTER_RELEASE_READINESS_REQUIRED"
            : !packageCertified
              ? "CURRENT_CERTIFIED_RELEASE_PACKAGE_REQUIRED"
              : !publishApproved
                ? "CURRENT_PUBLISH_RELEASE_APPROVAL_REQUIRED"
                : null,
      },
      targets,
      can_publish: Boolean(
        currentReadiness &&
        packageCertified &&
        publishApproved &&
        targets.length > 0,
      ),
    };
  },
});
